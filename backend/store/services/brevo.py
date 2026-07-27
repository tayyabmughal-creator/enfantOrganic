"""Brevo transactional-email webhook handling.

Why this exists: Django's ``send()`` returns 1 the moment Brevo's SMTP relay
accepts a message, and Brevo can still reject or drop it afterwards without
telling us. That made ``NotificationLog.status == "sent"`` a false positive —
observed in production on 2026-07-27, where a low-stock alert logged as "sent"
had actually been rejected by Brevo for an unauthenticated sender. These
webhook receipts are the only source of truth about what really arrived.
"""

import logging
import secrets

from django.conf import settings
from django.utils import timezone

from ..models import NotificationLog

logger = logging.getLogger(__name__)


class BrevoWebhookError(Exception):
    def __init__(self, message, *, code="brevo_error", http_status=400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


# Brevo event name -> NotificationLog status. Engagement events (opened, click,
# unsubscribed, ...) are deliberately absent: they say nothing about delivery
# and must never overwrite a delivery outcome.
EVENT_STATUS_MAP = {
    "delivered": NotificationLog.STATUS_DELIVERED,
    "deferred": NotificationLog.STATUS_DEFERRED,
    "hard_bounce": NotificationLog.STATUS_BOUNCED,
    "hardBounce": NotificationLog.STATUS_BOUNCED,
    "soft_bounce": NotificationLog.STATUS_BOUNCED,
    "softBounce": NotificationLog.STATUS_BOUNCED,
    "blocked": NotificationLog.STATUS_BLOCKED,
    "invalid_email": NotificationLog.STATUS_BLOCKED,
    "invalid": NotificationLog.STATUS_BLOCKED,
    "error": NotificationLog.STATUS_BLOCKED,
    "spam": NotificationLog.STATUS_SPAM,
    "complaint": NotificationLog.STATUS_SPAM,
}


def _configured_token():
    return str(getattr(settings, "BREVO_WEBHOOK_TOKEN", "") or "").strip()


def verify_webhook(request):
    """Authenticate the caller and return the parsed event list.

    Brevo does not sign its webhooks, so the only thing standing between this
    endpoint and the open internet is a shared secret. It is accepted from a
    header or a query parameter because Brevo's UI only lets you configure a
    URL. Fails closed: with no token configured the endpoint is unusable.
    """
    expected = _configured_token()
    if not expected:
        raise BrevoWebhookError(
            "Brevo webhook is not configured.",
            code="webhook_not_configured",
            http_status=503,
        )

    presented = str(
        request.headers.get("X-Brevo-Token")
        or request.headers.get("X-Webhook-Token")
        or request.query_params.get("token")
        or ""
    ).strip()
    if not presented or not secrets.compare_digest(presented, expected):
        raise BrevoWebhookError(
            "Invalid webhook token.",
            code="invalid_token",
            http_status=403,
        )

    payload = request.data
    if isinstance(payload, dict):
        # Brevo posts a single event per request; batch mode wraps them in a list.
        events = payload.get("events") if isinstance(payload.get("events"), list) else [payload]
    elif isinstance(payload, list):
        events = payload
    else:
        raise BrevoWebhookError("Webhook body must be a JSON object or array.", code="invalid_payload")

    return [event for event in events if isinstance(event, dict)]


def _message_id(event):
    """Brevo echoes the Message-ID we stamped, under one of several key spellings."""
    for key in ("message-id", "message_id", "messageId"):
        value = str(event.get(key) or "").strip()
        if value:
            return value
    return ""


def _should_apply(current_status, new_status):
    """Only ever move a row forward — receipts arrive out of order and get replayed."""
    ranks = NotificationLog.STATUS_RANK
    return ranks.get(new_status, 0) >= ranks.get(current_status, 0)


def handle_email_events(events):
    """Apply delivery receipts to NotificationLog rows.

    Unmatched receipts are counted, not created: a row we never wrote is either
    an email sent outside this app or one sent before Message-ID capture
    existed, and inventing a log for it would be worse than dropping it.
    """
    applied = 0
    ignored = 0
    unmatched = 0

    for event in events:
        event_name = str(event.get("event") or "").strip()
        new_status = EVENT_STATUS_MAP.get(event_name)
        if not new_status:
            ignored += 1
            continue

        message_id = _message_id(event)
        if not message_id:
            unmatched += 1
            continue

        log = (
            NotificationLog.objects.filter(
                channel=NotificationLog.CHANNEL_EMAIL,
                provider_message_id=message_id,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        if log is None:
            unmatched += 1
            logger.info("Brevo receipt for unknown message_id=%s event=%s", message_id, event_name)
            continue

        if not _should_apply(log.status, new_status):
            ignored += 1
            continue

        reason = str(event.get("reason") or "").strip()
        log.status = new_status
        log.success = new_status in NotificationLog.SUCCESS_STATUSES
        log.error_message = "" if log.success else (reason or event_name)
        if new_status == NotificationLog.STATUS_DELIVERED and not log.sent_at:
            log.sent_at = timezone.now()

        payload = dict(log.payload or {})
        payload["brevo_event"] = {
            "event": event_name,
            "date": str(event.get("date") or ""),
            "reason": reason,
            "message_id": message_id,
        }
        log.payload = payload
        log.save(
            update_fields=[
                "status",
                "success",
                "error_message",
                "sent_at",
                "payload",
                "updated_at",
            ]
        )
        applied += 1

    return {"applied": applied, "ignored": ignored, "unmatched": unmatched}
