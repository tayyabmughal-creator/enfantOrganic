import json
import logging
from urllib import request as urlrequest

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone
from django.utils.html import escape

from .emails import (
    TEMPLATE_ORDER_CANCELLED,
    TEMPLATE_ORDER_DELIVERED,
    TEMPLATE_ORDER_SHIPPED,
    TEMPLATE_REFUND_PROCESSED,
    TEMPLATE_REVIEW_REQUEST,
    TEMPLATE_RETURN_REQUESTED,
    send_order_confirmation_email,
    send_order_status_update_email,
    send_payment_paid_email,
    send_transactional_order_email,
)
from .models import NotificationLog, Order, PushDevice, WhatsAppLog
from .services.inventory_health import get_inventory_admin_email, inventory_health_summary
from .services.sms_router import send_sms
from .services.sms_templates import render_sms_template
from .services.whatsapp_cloud import WhatsAppCloudError, send_template as send_whatsapp_template

logger = logging.getLogger(__name__)


class NotificationDispatchRetryableError(Exception):
    """Raised for transient notification failures that Celery should retry."""


ORDER_STATUS_EVENT_MAP = {
    Order.STATUS_PAID: NotificationLog.EVENT_PAYMENT_PAID,
    Order.STATUS_SHIPPED: NotificationLog.EVENT_ORDER_SHIPPED,
    Order.STATUS_DELIVERED: NotificationLog.EVENT_ORDER_DELIVERED,
    Order.STATUS_CANCELLED: NotificationLog.EVENT_ORDER_CANCELLED,
    Order.STATUS_REFUNDED: NotificationLog.EVENT_REFUND_PROCESSED,
}


EVENT_TEMPLATE_MAP = {
    NotificationLog.EVENT_ORDER_SHIPPED: TEMPLATE_ORDER_SHIPPED,
    NotificationLog.EVENT_ORDER_DELIVERED: TEMPLATE_ORDER_DELIVERED,
    NotificationLog.EVENT_ORDER_CANCELLED: TEMPLATE_ORDER_CANCELLED,
    NotificationLog.EVENT_REFUND_PROCESSED: TEMPLATE_REFUND_PROCESSED,
    NotificationLog.EVENT_REVIEW_REQUEST: TEMPLATE_REVIEW_REQUEST,
    NotificationLog.EVENT_RETURN_REQUESTED: TEMPLATE_RETURN_REQUESTED,
}

SMS_EVENT_SET = {
    NotificationLog.EVENT_ORDER_CREATED,
    NotificationLog.EVENT_ORDER_SHIPPED,
    NotificationLog.EVENT_ORDER_DELIVERED,
    NotificationLog.EVENT_REFUND_PROCESSED,
}

WHATSAPP_EVENT_SET = {
    NotificationLog.EVENT_ORDER_CREATED,
    NotificationLog.EVENT_ORDER_SHIPPED,
    NotificationLog.EVENT_ORDER_DELIVERED,
    NotificationLog.EVENT_REFUND_PROCESSED,
}


def _order_locale(order):
    locale = str(getattr(order, "locale", "en") or "en").strip().lower()
    return "ar" if locale == "ar" else "en"


def _event_log_title(event, order):
    return f"{event} - {order.order_number}"


def _event_log_body(event, order):
    return f"Event {event} for order {order.order_number} ({order.customer_name})"


def _notification_exists(event, channel, recipient, *, order=None):
    queryset = NotificationLog.objects.filter(
        event=event,
        channel=channel,
        recipient=recipient,
    )
    if order is None:
        queryset = queryset.filter(order__isnull=True)
    else:
        queryset = queryset.filter(order=order)
    return queryset.exists()


def _get_notification_log(event, channel, recipient, *, order=None):
    queryset = NotificationLog.objects.filter(
        event=event,
        channel=channel,
        recipient=recipient,
    )
    if order is None:
        queryset = queryset.filter(order__isnull=True)
    else:
        queryset = queryset.filter(order=order)
    return queryset.order_by("-created_at", "-id").first()


def _normalize_notification_status(status):
    allowed = {
        NotificationLog.STATUS_PENDING,
        NotificationLog.STATUS_SENT,
        NotificationLog.STATUS_FAILED,
        NotificationLog.STATUS_SKIPPED,
        NotificationLog.STATUS_SKIPPED_NO_EMAIL,
        NotificationLog.STATUS_SKIPPED_DRAFT_ORDER,
    }
    return status if status in allowed else NotificationLog.STATUS_PENDING


def _create_notification_log(
    *,
    event,
    channel,
    recipient,
    order=None,
    provider="",
    provider_message_id="",
    title="",
    body="",
    payload=None,
    status=NotificationLog.STATUS_PENDING,
    error_message="",
):
    resolved_payload = payload or {}
    if title:
        resolved_title = title
    elif order:
        resolved_title = _event_log_title(event, order)
    else:
        resolved_title = event

    if body:
        resolved_body = body
    elif order:
        resolved_body = _event_log_body(event, order)
    else:
        resolved_body = ""
    status_key = _normalize_notification_status(status)

    return NotificationLog.objects.create(
        channel=channel,
        event=event,
        recipient=recipient,
        status=status_key,
        provider=provider,
        provider_message_id=provider_message_id,
        order=order,
        title=resolved_title,
        body=resolved_body,
        payload=resolved_payload,
        success=(status_key == NotificationLog.STATUS_SENT),
        error_message=str(error_message or ""),
    )


def _save_notification_log(
    log,
    *,
    status=None,
    provider=None,
    provider_message_id=None,
    title=None,
    body=None,
    payload=None,
    error_message=None,
    attempt_count=None,
    task_id=None,
    sent_at=None,
):
    if log is None:
        return None

    update_fields = ["updated_at"]
    if status is not None:
        log.status = _normalize_notification_status(status)
        log.success = log.status == NotificationLog.STATUS_SENT
        update_fields.extend(["status", "success"])
    if provider is not None:
        log.provider = provider
        update_fields.append("provider")
    if provider_message_id is not None:
        log.provider_message_id = provider_message_id
        update_fields.append("provider_message_id")
    if title is not None:
        log.title = title
        update_fields.append("title")
    if body is not None:
        log.body = body
        update_fields.append("body")
    if payload is not None:
        log.payload = payload
        update_fields.append("payload")
    if error_message is not None:
        log.error_message = str(error_message or "")
        update_fields.append("error_message")
    if attempt_count is not None:
        log.attempt_count = max(0, int(attempt_count))
        update_fields.append("attempt_count")
    if task_id is not None:
        log.task_id = str(task_id or "")
        update_fields.append("task_id")
    if sent_at is not None or status == NotificationLog.STATUS_SENT:
        log.sent_at = sent_at if sent_at is not None else timezone.now()
        update_fields.append("sent_at")
    elif status is not None and log.status != NotificationLog.STATUS_SENT and log.sent_at is not None:
        log.sent_at = None
        update_fields.append("sent_at")

    log.save(update_fields=list(dict.fromkeys(update_fields)))
    return log


def _ensure_email_notification_log(order, event, *, status, payload=None):
    recipient = str(order.customer_email or "").strip().lower()
    existing = _get_notification_log(
        event,
        NotificationLog.CHANNEL_EMAIL,
        recipient,
        order=order,
    )
    if existing:
        if existing.status in {
            NotificationLog.STATUS_SENT,
            NotificationLog.STATUS_SKIPPED,
            NotificationLog.STATUS_SKIPPED_NO_EMAIL,
            NotificationLog.STATUS_SKIPPED_DRAFT_ORDER,
        } and status == NotificationLog.STATUS_PENDING:
            return existing
        return _save_notification_log(
            existing,
            status=status,
            title=_event_log_title(event, order),
            body=_event_log_body(event, order),
            payload=payload if payload is not None else existing.payload,
        )
    return _create_notification_log(
        event=event,
        channel=NotificationLog.CHANNEL_EMAIL,
        recipient=recipient,
        order=order,
        provider="smtp",
        provider_message_id="",
        title=_event_log_title(event, order),
        body=_event_log_body(event, order),
        payload=payload or {},
        status=status,
    )


def _send_customer_event_email(order, event):
    if not order.customer_email:
        return False, "Customer email is not set.", NotificationLog.STATUS_SKIPPED_NO_EMAIL

    if event == NotificationLog.EVENT_ORDER_CREATED:
        sent = bool(send_order_confirmation_email(order))
        return sent, "" if sent else "Email provider did not confirm delivery.", NotificationLog.STATUS_SENT if sent else NotificationLog.STATUS_FAILED

    if event == NotificationLog.EVENT_PAYMENT_PAID:
        sent = bool(send_payment_paid_email(order))
        return sent, "" if sent else "Email provider did not confirm delivery.", NotificationLog.STATUS_SENT if sent else NotificationLog.STATUS_FAILED

    if event in {
        NotificationLog.EVENT_ORDER_SHIPPED,
        NotificationLog.EVENT_ORDER_DELIVERED,
        NotificationLog.EVENT_ORDER_CANCELLED,
        NotificationLog.EVENT_REFUND_PROCESSED,
        NotificationLog.EVENT_REVIEW_REQUEST,
        NotificationLog.EVENT_RETURN_REQUESTED,
    }:
        template_key = EVENT_TEMPLATE_MAP.get(event)
        sent = bool(send_transactional_order_email(order, template_key))
        return sent, "" if sent else "Email provider did not confirm delivery.", NotificationLog.STATUS_SENT if sent else NotificationLog.STATUS_FAILED

    sent = bool(send_order_status_update_email(order))
    return sent, "" if sent else "Email provider did not confirm delivery.", NotificationLog.STATUS_SENT if sent else NotificationLog.STATUS_FAILED


def _dispatch_customer_event(order, event, *, extra_payload=None):
    recipient = str(order.customer_email or "").strip().lower()
    payload = {
        "event": event,
        "locale": _order_locale(order),
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "currency_code": order.currency_code,
        "total_amount": str(order.grand_total),
    }
    if extra_payload:
        payload.update(extra_payload)

    log = _ensure_email_notification_log(
        order,
        event,
        status=NotificationLog.STATUS_PENDING,
        payload=payload,
    )
    if log and log.status in {
        NotificationLog.STATUS_SENT,
        NotificationLog.STATUS_SKIPPED,
        NotificationLog.STATUS_SKIPPED_NO_EMAIL,
        NotificationLog.STATUS_SKIPPED_DRAFT_ORDER,
    }:
        return log

    try:
        sent, send_error, send_status = _send_customer_event_email(order, event)
    except Exception as exc:
        logger.exception("Notification send failed for order=%s event=%s", order.order_number, event)
        attempt_count = (log.attempt_count if log else 0) + 1
        _save_notification_log(
            log,
            status=NotificationLog.STATUS_FAILED,
            provider="smtp",
            title=_event_log_title(event, order),
            body=_event_log_body(event, order),
            payload=payload,
            error_message=str(exc),
            attempt_count=attempt_count,
        )
        raise NotificationDispatchRetryableError(str(exc)) from exc

    attempt_count = (log.attempt_count if log else 0) + (0 if send_status in {
        NotificationLog.STATUS_SKIPPED,
        NotificationLog.STATUS_SKIPPED_NO_EMAIL,
        NotificationLog.STATUS_SKIPPED_DRAFT_ORDER,
    } else 1)
    resolved_status = send_status if sent or send_status in {
        NotificationLog.STATUS_SKIPPED,
        NotificationLog.STATUS_SKIPPED_NO_EMAIL,
        NotificationLog.STATUS_SKIPPED_DRAFT_ORDER,
    } else NotificationLog.STATUS_FAILED
    _save_notification_log(
        log,
        status=resolved_status,
        provider="smtp",
        title=_event_log_title(event, order),
        body=_event_log_body(event, order),
        payload=payload,
        error_message=send_error,
        attempt_count=attempt_count,
        sent_at=timezone.now() if resolved_status == NotificationLog.STATUS_SENT else None,
    )
    if resolved_status == NotificationLog.STATUS_FAILED:
        raise NotificationDispatchRetryableError(send_error or "Email provider did not confirm delivery.")
    return log


def _send_customer_event_sms(order, event, *, payload=None):
    recipient = str(order.customer_phone or "").strip()
    if not recipient:
        return {
            "sent": False,
            "status": NotificationLog.STATUS_SKIPPED,
            "error_message": "Customer phone is not set.",
            "provider": "",
            "provider_message_id": "",
            "message_body": "",
            "provider_payload": payload or {},
        }

    if not bool(getattr(order, "sms_opt_in", False)):
        return {
            "sent": False,
            "status": NotificationLog.STATUS_SKIPPED,
            "error_message": "Customer did not opt in for SMS notifications.",
            "provider": "",
            "provider_message_id": "",
            "message_body": "",
            "provider_payload": payload or {},
        }

    message_body = render_sms_template(event, order=order, locale=_order_locale(order))
    if not message_body:
        return {
            "sent": False,
            "status": NotificationLog.STATUS_SKIPPED,
            "error_message": "No SMS template available for this event.",
            "provider": "",
            "provider_message_id": "",
            "message_body": "",
            "provider_payload": payload or {},
        }

    sms_result = send_sms(
        recipient,
        message_body,
        locale=_order_locale(order),
        metadata=payload or {},
    )
    result_status = str(sms_result.get("status") or "").strip().lower()
    success = bool(sms_result.get("success"))
    if success:
        status = NotificationLog.STATUS_SENT
    elif result_status == "skipped":
        status = NotificationLog.STATUS_SKIPPED
    else:
        status = NotificationLog.STATUS_FAILED

    return {
        "sent": success,
        "status": status,
        "error_message": str(sms_result.get("error") or ""),
        "provider": str(sms_result.get("provider") or ""),
        "provider_message_id": str(sms_result.get("provider_message_id") or ""),
        "message_body": message_body,
        "provider_payload": {
            **(payload or {}),
            "attempted_providers": sms_result.get("attempted_providers", []),
        },
    }


def _dispatch_customer_sms_event(order, event, *, extra_payload=None):
    recipient = str(order.customer_phone or "").strip()
    if _notification_exists(event, NotificationLog.CHANNEL_SMS, recipient, order=order):
        return None

    payload = {
        "event": event,
        "locale": _order_locale(order),
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "currency_code": order.currency_code,
        "total_amount": str(order.grand_total),
        "sms_opt_in": bool(getattr(order, "sms_opt_in", False)),
    }
    if extra_payload:
        payload.update(extra_payload)

    try:
        sms_result = _send_customer_event_sms(order, event, payload=payload)
    except Exception as exc:
        logger.exception("SMS notification failed for order=%s event=%s", order.order_number, event)
        sms_result = {
            "sent": False,
            "status": NotificationLog.STATUS_FAILED,
            "error_message": str(exc),
            "provider": "",
            "provider_message_id": "",
            "message_body": "",
            "provider_payload": payload,
        }

    return _create_notification_log(
        event=event,
        channel=NotificationLog.CHANNEL_SMS,
        recipient=recipient,
        order=order,
        provider=sms_result["provider"],
        provider_message_id=sms_result["provider_message_id"],
        title=_event_log_title(event, order),
        body=sms_result["message_body"] or _event_log_body(event, order),
        payload=sms_result["provider_payload"],
        status=sms_result["status"],
        error_message=sms_result["error_message"],
    )


def _send_customer_event_whatsapp(order, event, *, payload=None):
    recipient = str(order.customer_phone or "").strip()
    if not recipient:
        return {
            "sent": False,
            "status": NotificationLog.STATUS_SKIPPED,
            "error_message": "Customer phone is not set.",
            "provider": "whatsapp_cloud",
            "provider_message_id": "",
            "template_name": "",
            "request_payload": {},
            "response_payload": {},
            "webhook_payload": {},
        }

    if not bool(getattr(order, "whatsapp_opt_in", False)):
        return {
            "sent": False,
            "status": NotificationLog.STATUS_SKIPPED,
            "error_message": "Customer did not opt in for WhatsApp notifications.",
            "provider": "whatsapp_cloud",
            "provider_message_id": "",
            "template_name": "",
            "request_payload": {},
            "response_payload": {},
            "webhook_payload": {},
        }

    try:
        wa_result = send_whatsapp_template(
            order,
            event,
            locale=_order_locale(order),
            metadata=payload or {},
        )
        return {
            "sent": True,
            "status": NotificationLog.STATUS_SENT,
            "error_message": "",
            "provider": str(wa_result.get("provider") or "whatsapp_cloud"),
            "provider_message_id": str(wa_result.get("provider_message_id") or ""),
            "template_name": str(wa_result.get("template_name") or ""),
            "request_payload": wa_result.get("request_payload") or {},
            "response_payload": wa_result.get("response_payload") or {},
            "webhook_payload": {},
        }
    except WhatsAppCloudError as exc:
        status_key = NotificationLog.STATUS_FAILED
        if getattr(exc, "code", "") in {
            "provider_disabled",
            "template_not_configured",
            "missing_recipient",
        }:
            status_key = NotificationLog.STATUS_SKIPPED
        return {
            "sent": False,
            "status": status_key,
            "error_message": str(exc),
            "provider": "whatsapp_cloud",
            "provider_message_id": "",
            "template_name": "",
            "request_payload": payload or {},
            "response_payload": {},
            "webhook_payload": {},
        }
    except Exception as exc:
        logger.exception("WhatsApp notification failed for order=%s event=%s", order.order_number, event)
        return {
            "sent": False,
            "status": NotificationLog.STATUS_FAILED,
            "error_message": str(exc),
            "provider": "whatsapp_cloud",
            "provider_message_id": "",
            "template_name": "",
            "request_payload": payload or {},
            "response_payload": {},
            "webhook_payload": {},
        }


def _dispatch_customer_whatsapp_event(order, event, *, extra_payload=None):
    recipient = str(order.customer_phone or "").strip()
    if _notification_exists(event, NotificationLog.CHANNEL_WHATSAPP, recipient, order=order):
        return None

    payload = {
        "event": event,
        "locale": _order_locale(order),
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "currency_code": order.currency_code,
        "total_amount": str(order.grand_total),
        "whatsapp_opt_in": bool(getattr(order, "whatsapp_opt_in", False)),
    }
    if extra_payload:
        payload.update(extra_payload)

    wa_result = _send_customer_event_whatsapp(order, event, payload=payload)

    WhatsAppLog.objects.create(
        order=order,
        event=event,
        recipient=recipient,
        locale=_order_locale(order),
        template_name=wa_result["template_name"],
        provider=wa_result["provider"],
        provider_message_id=wa_result["provider_message_id"],
        status=(
            WhatsAppLog.STATUS_SENT
            if wa_result["status"] == NotificationLog.STATUS_SENT
            else WhatsAppLog.STATUS_SKIPPED
            if wa_result["status"] == NotificationLog.STATUS_SKIPPED
            else WhatsAppLog.STATUS_FAILED
        ),
        request_payload=wa_result["request_payload"],
        response_payload=wa_result["response_payload"],
        webhook_payload=wa_result["webhook_payload"],
        error_message=wa_result["error_message"],
    )

    return _create_notification_log(
        event=event,
        channel=NotificationLog.CHANNEL_WHATSAPP,
        recipient=recipient,
        order=order,
        provider=wa_result["provider"],
        provider_message_id=wa_result["provider_message_id"],
        title=_event_log_title(event, order),
        body=_event_log_body(event, order),
        payload=payload,
        status=wa_result["status"],
        error_message=wa_result["error_message"],
    )


def _dispatch_admin_push(event, title, body, payload, *, order=None):
    recipient = "staff"
    if _notification_exists(event, NotificationLog.CHANNEL_PUSH, recipient, order=order):
        return None

    tokens = list(
        PushDevice.objects.filter(
            user__is_staff=True,
            is_active=True,
        ).values_list("token", flat=True)
    )
    provider = "expo"

    if not tokens:
        return _create_notification_log(
            event=event,
            channel=NotificationLog.CHANNEL_PUSH,
            recipient=recipient,
            order=order,
            provider=provider,
            title=title,
            body=body,
            payload={**payload, "token_count": 0},
            status=NotificationLog.STATUS_SKIPPED,
            error_message="No active staff push devices.",
        )

    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": payload,
        }
        for token in tokens
    ]

    try:
        data = json.dumps(messages).encode("utf-8")
        req = urlrequest.Request(
            settings.EXPO_PUSH_ENDPOINT,
            data=data,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlrequest.urlopen(req, timeout=5) as response:
            response_payload = json.loads(response.read().decode("utf-8") or "{}")

        return _create_notification_log(
            event=event,
            channel=NotificationLog.CHANNEL_PUSH,
            recipient=recipient,
            order=order,
            provider=provider,
            provider_message_id="",
            title=title,
            body=body,
            payload={**payload, "expo_response": response_payload},
            status=NotificationLog.STATUS_SENT,
        )
    except Exception as exc:
        logger.exception("Admin push failed for event=%s", event)
        return _create_notification_log(
            event=event,
            channel=NotificationLog.CHANNEL_PUSH,
            recipient=recipient,
            order=order,
            provider=provider,
            title=title,
            body=body,
            payload=payload,
            status=NotificationLog.STATUS_FAILED,
            error_message=str(exc),
        )


def _dispatch_order_event(order_id, event, *, extra_payload=None):
    order = (
        Order.objects.filter(pk=order_id)
        .prefetch_related("items")
        .first()
    )
    if not order:
        return None

    _dispatch_customer_event(order, event, extra_payload=extra_payload)
    if event in SMS_EVENT_SET:
        _dispatch_customer_sms_event(order, event, extra_payload=extra_payload)
    if event in WHATSAPP_EVENT_SET:
        _dispatch_customer_whatsapp_event(order, event, extra_payload=extra_payload)

    # Keep staff push awareness for core payment/order events.
    if event in {
        NotificationLog.EVENT_ORDER_CREATED,
        NotificationLog.EVENT_PAYMENT_PAID,
        NotificationLog.EVENT_ORDER_CANCELLED,
        NotificationLog.EVENT_REFUND_PROCESSED,
    }:
        title = f"Order {order.order_number}"
        body = f"{event.replace('_', ' ').title()} for {order.customer_name} ({order.grand_total} {order.currency_code})."
        _dispatch_admin_push(
            event,
            title,
            body,
            {
                "event": event,
                "order_number": order.order_number,
                "customer_name": order.customer_name,
                "total_amount": str(order.grand_total),
                "currency_code": order.currency_code,
            },
            order=order,
        )

    return order


def queue_order_notification_event(order, event, *, extra_payload=None):
    order_id = order.pk

    def _callback():
        payload = {
            "event": event,
            "locale": _order_locale(order),
            "order_number": order.order_number,
            "customer_name": order.customer_name,
            "currency_code": order.currency_code,
            "total_amount": str(order.grand_total),
        }
        if extra_payload:
            payload.update(extra_payload)
        notification_log = _ensure_email_notification_log(
            order,
            event,
            status=NotificationLog.STATUS_PENDING,
            payload=payload,
        )
        try:
            from .tasks import process_order_event_async
            task_result = process_order_event_async.delay(order_id, event, extra_payload=extra_payload)
            if notification_log is not None:
                _save_notification_log(notification_log, task_id=getattr(task_result, "id", ""))
        except Exception as exc:
            if notification_log is not None:
                _save_notification_log(
                    notification_log,
                    status=NotificationLog.STATUS_FAILED,
                    error_message=str(exc),
                )
            logger.exception("Failed to queue order notification task for order=%s event=%s", order_id, event)

    transaction.on_commit(_callback)


_DRAFT_ORDER_PLACED_STATUSES = {
    Order.STATUS_CONFIRMED,
    Order.STATUS_PAID,
    Order.STATUS_PROCESSING,
}

_DRAFT_ORDER_PENDING_STATUSES = {
    Order.STATUS_PENDING,
    None,
}


def queue_order_notification_events(order, *, is_create=False, previous_status=None):
    is_draft = getattr(order, "sales_channel", "") == Order.SALES_CHANNEL_DRAFT_ORDER

    if is_draft and is_create:
        # Draft orders are created internally by admin — skip the creation notification
        # but log it as skipped so the audit trail is clean.
        def _draft_skip_callback():
            existing = _get_notification_log(
                NotificationLog.EVENT_ORDER_CREATED,
                NotificationLog.CHANNEL_EMAIL,
                str(order.customer_email or "").strip().lower(),
                order=order,
            )
            if existing is None:
                _ensure_email_notification_log(
                    order,
                    NotificationLog.EVENT_ORDER_CREATED,
                    status=NotificationLog.STATUS_SKIPPED_DRAFT_ORDER,
                    payload={
                        "event": NotificationLog.EVENT_ORDER_CREATED,
                        "locale": _order_locale(order),
                        "order_number": order.order_number,
                        "skip_reason": "draft_order",
                    },
                )

        transaction.on_commit(_draft_skip_callback)
        return

    if not is_draft and is_create:
        queue_order_notification_event(order, NotificationLog.EVENT_ORDER_CREATED)

    if previous_status == order.status:
        return

    # For draft orders transitioning from pending → confirmed/paid/processing,
    # send an order-placed confirmation so the customer knows their order is active.
    if (
        is_draft
        and previous_status in _DRAFT_ORDER_PENDING_STATUSES
        and order.status in _DRAFT_ORDER_PLACED_STATUSES
    ):
        queue_order_notification_event(order, NotificationLog.EVENT_ORDER_CREATED)

    status_event = ORDER_STATUS_EVENT_MAP.get(order.status)
    if status_event:
        queue_order_notification_event(order, status_event)
        if status_event == NotificationLog.EVENT_ORDER_DELIVERED:
            queue_order_notification_event(order, NotificationLog.EVENT_REVIEW_REQUEST)


def notify_admins_new_order(order):
    title = f"New order {order.order_number}"
    body = f"{order.customer_name} placed {order.grand_total} {order.currency_code} via {order.payment_method}."
    payload = {
        "event": NotificationLog.EVENT_ORDER_CREATED,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "total_amount": str(order.grand_total),
        "currency_code": order.currency_code,
        "payment_method": order.payment_method,
    }
    return _dispatch_admin_push(NotificationLog.EVENT_ORDER_CREATED, title, body, payload, order=order)


def notify_admins_paid_order(order):
    title = f"Paid order {order.order_number}"
    body = f"{order.customer_name} payment confirmed for {order.grand_total} {order.currency_code}."
    payload = {
        "event": NotificationLog.EVENT_PAYMENT_PAID,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "total_amount": str(order.grand_total),
        "currency_code": order.currency_code,
        "payment_method": order.payment_method,
    }
    return _dispatch_admin_push(NotificationLog.EVENT_PAYMENT_PAID, title, body, payload, order=order)


def notify_admins_payment_review(order):
    title = f"Payment review {order.order_number}"
    body = f"{order.customer_name} has a payment that needs review."
    payload = {
        "event": NotificationLog.EVENT_PAYMENT_REVIEW,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "total_amount": str(order.grand_total),
        "currency_code": order.currency_code,
        "payment_method": order.payment_method,
    }
    return _dispatch_admin_push(NotificationLog.EVENT_PAYMENT_REVIEW, title, body, payload, order=order)


def notify_admins_low_stock(product):
    title = f"Low stock: {product.name_en}"
    body = f"{product.name_en} has {product.stock_quantity} item(s) remaining."
    payload = {
        "event": NotificationLog.EVENT_LOW_STOCK,
        "product_slug": product.slug,
        "product_name": product.name_en,
        "stock_quantity": product.stock_quantity,
    }
    return _dispatch_admin_push(NotificationLog.EVENT_LOW_STOCK, title, body, payload, order=None)


def _format_inventory_email_group(title, products):
    if not products:
        return f"{title}\nNone"
    lines = [title]
    lines.extend(
        f"- {product['name_en']} ({product['stock_quantity']} units)"
        for product in products
    )
    return "\n".join(lines)


def send_admin_inventory_health_email():
    summary = inventory_health_summary()
    if summary["count"] <= 0:
        return False

    recipient = get_inventory_admin_email()
    if not recipient:
        logger.warning("Inventory health email skipped because no admin recipient is configured.")
        return False

    subject = f"Inventory Health: {summary['count']} product(s) need attention"
    text_body = "\n\n".join(
        [
            f"Inventory Health ({summary['count']})",
            f"Threshold: {summary['threshold']} units or below",
            _format_inventory_email_group("Out of Stock", summary["out_of_stock"]),
            _format_inventory_email_group("Critical", summary["critical"]),
            _format_inventory_email_group("Low Stock", summary["low_stock"]),
        ]
    )
    html_sections = []
    for label, products in (
        ("Out of Stock", summary["out_of_stock"]),
        ("Critical", summary["critical"]),
        ("Low Stock", summary["low_stock"]),
    ):
        if products:
            rows = "".join(
                f"<li><strong>{escape(product['name_en'])}</strong> — {product['stock_quantity']} units</li>"
                for product in products
            )
        else:
            rows = "<li>None</li>"
        html_sections.append(f"<h2>{label}</h2><ul>{rows}</ul>")

    html_body = (
        f"<h1>Inventory Health ({summary['count']})</h1>"
        f"<p>Threshold: {summary['threshold']} units or below.</p>"
        + "".join(html_sections)
    )

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@enfantorganics.com"),
        to=[recipient],
    )
    email.attach_alternative(html_body, "text/html")
    sent = bool(email.send(fail_silently=False))

    _create_notification_log(
        event=NotificationLog.EVENT_LOW_STOCK,
        channel=NotificationLog.CHANNEL_EMAIL,
        recipient=recipient,
        provider="smtp",
        title=subject,
        body=text_body,
        payload={
            "threshold": summary["threshold"],
            "count": summary["count"],
            "out_of_stock": [product["slug"] for product in summary["out_of_stock"]],
            "critical": [product["slug"] for product in summary["critical"]],
            "low_stock": [product["slug"] for product in summary["low_stock"]],
        },
        status=NotificationLog.STATUS_SENT if sent else NotificationLog.STATUS_FAILED,
        error_message="" if sent else "Email provider did not confirm delivery.",
    )
    return sent


def send_admin_push(event, title, body, payload):
    # Legacy wrapper; keep signature used in older call-sites.
    return _dispatch_admin_push(event, title, body, payload, order=None)
