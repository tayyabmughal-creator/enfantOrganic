import logging
from celery import shared_task
from celery.exceptions import MaxRetriesExceededError, Retry
from django.core.management import call_command

from .models import Order
from .notifications import (
    NotificationDispatchRetryableError,
    _dispatch_order_event,
    send_admin_inventory_health_email,
)
from .services.invoice import ensure_paid_order_invoice
from .services.shipment import create_order_shipment

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def process_order_event_async(self, order_id, event, extra_payload=None):
    try:
        _dispatch_order_event(order_id, event, extra_payload=extra_payload)
    except NotificationDispatchRetryableError as exc:
        retries = int(getattr(self.request, "retries", 0))
        logger.warning(
            "Retrying order notification dispatch for order=%s event=%s attempt=%s/%s: %s",
            order_id,
            event,
            retries + 1,
            self.max_retries,
            exc,
        )
        countdown = min(60, 2 ** retries)
        raise self.retry(exc=exc, countdown=countdown, max_retries=self.max_retries)
    except Exception:
        logger.exception("Order notification dispatch crashed for order=%s event=%s", order_id, event)

@shared_task
def generate_order_invoice_async(order_id):
    try:
        order = Order.objects.filter(pk=order_id).first()
        if order:
            ensure_paid_order_invoice(order)
    except Exception:
        logger.exception("Async invoice generation failed for order=%s", order_id)

@shared_task
def generate_order_shipment_async(order_id):
    try:
        order = Order.objects.filter(pk=order_id).first()
        if order:
            create_order_shipment(order)
    except Exception:
        logger.exception("Async shipment creation failed for order=%s", order_id)

def _retry_capi(task, error_message):
    """
    Back off and retry a failed CAPI delivery.

    Meta accepts an event for up to 7 days, so a slow exponential backoff is
    safe and far better than dropping a conversion because Graph blipped.
    """
    retries = int(getattr(task.request, "retries", 0))
    raise task.retry(
        exc=RuntimeError(error_message or "Meta CAPI delivery failed"),
        countdown=min(300, 30 * (2 ** retries)),
        max_retries=task.max_retries,
    )


@shared_task(bind=True, max_retries=3)
def send_meta_purchase_event_async(self, order_id):
    """
    Relay the server-side Purchase to Meta.

    Runs out-of-band because checkout must never wait on, or fail because of, an
    ad-platform call. Retries only on transport failures — ``send_event`` already
    swallows those and records them, so we re-read the log row to decide.
    """
    try:
        from .services.meta_capi import send_purchase_for_order

        order = Order.objects.filter(pk=order_id).select_related("region").first()
        if not order:
            logger.warning("Meta CAPI purchase skipped — order=%s not found", order_id)
            return

        log = send_purchase_for_order(order)
        if log.status == log.STATUS_FAILED:
            _retry_capi(self, log.error_message)
    except Retry:
        # Celery's own control-flow signal — must reach the worker, not the
        # blanket handler below, or the retry is silently cancelled.
        raise
    except MaxRetriesExceededError:
        logger.error("Meta CAPI purchase gave up after retries for order=%s", order_id)
    except Exception:
        logger.exception("Meta CAPI purchase task crashed for order=%s", order_id)


@shared_task(bind=True, max_retries=3)
def send_meta_capi_event_async(self, payload):
    """
    Relay a browser-originated funnel event (ViewContent, AddToCart, ...).

    The storefront POSTs these to /api/analytics/meta-event/ with the same
    event_id its Pixel used; the view attaches the request's IP and user agent
    before enqueuing, since those must come from the server, not the client.
    """
    try:
        from .services.meta_capi import send_event

        log = send_event(**payload)
        if log.status == log.STATUS_FAILED:
            _retry_capi(self, log.error_message)
    except Retry:
        raise
    except MaxRetriesExceededError:
        logger.error("Meta CAPI event gave up after retries: %s", payload.get("event_id"))
    except Exception:
        logger.exception("Meta CAPI event task crashed: %s", payload.get("event_id"))


@shared_task
def clear_expired_sessions():
    try:
        call_command("clearsessions")
    except Exception:
        logger.exception("Failed to clear expired sessions via celery beat")


@shared_task
def send_daily_inventory_health_email():
    try:
        return send_admin_inventory_health_email()
    except Exception:
        logger.exception("Failed to send daily inventory health email")
        return False


@shared_task
def trigger_frontend_revalidate_async(path=None, tag=None):
    import os

    import requests
    from django.conf import settings

    from .revalidation import RevalidationNotConfiguredError, get_revalidation_secret

    frontend_url = os.environ.get("FRONTEND_INTERNAL_URL", "http://frontend:3000")
    try:
        secret = get_revalidation_secret(required=not settings.DEBUG)
    except RevalidationNotConfiguredError:
        logger.error("REVALIDATION_SECRET is not configured; skipping frontend revalidate.")
        return
    if not secret:
        logger.warning("REVALIDATION_SECRET is not set; skipping frontend revalidate.")
        return

    url = f"{frontend_url}/api/revalidate"
    headers = {"Authorization": f"Bearer {secret}"}
    payload = {}
    if path:
        payload["path"] = path
    if tag:
        payload["tag"] = tag

    try:
        res = requests.post(url, json=payload, headers=headers, timeout=5)
        res.raise_for_status()
    except Exception:
        logger.exception("Failed to trigger frontend revalidation for payload=%s", payload)
