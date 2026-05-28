import logging
from celery import shared_task
from django.core.management import call_command

from .models import Order
from .notifications import _dispatch_order_event, send_admin_inventory_health_email
from .services.invoice import ensure_paid_order_invoice
from .services.shipment import create_order_shipment

logger = logging.getLogger(__name__)

@shared_task
def process_order_event_async(order_id, event, extra_payload=None):
    try:
        _dispatch_order_event(order_id, event, extra_payload=extra_payload)
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
