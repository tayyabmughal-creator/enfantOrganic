import hashlib
import hmac
import logging
import re

import requests
from django.conf import settings

from ..models import WhatsAppLog

logger = logging.getLogger(__name__)


WHATSAPP_PROVIDER_NAME = "whatsapp_cloud"
DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0"

EVENT_TEMPLATE_ENV_MAP = {
    WhatsAppLog.EVENT_ORDER_CREATED: "WHATSAPP_TEMPLATE_ORDER_CONFIRMED",
    WhatsAppLog.EVENT_ORDER_SHIPPED: "WHATSAPP_TEMPLATE_ORDER_SHIPPED",
    WhatsAppLog.EVENT_ORDER_DELIVERED: "WHATSAPP_TEMPLATE_ORDER_DELIVERED",
    WhatsAppLog.EVENT_REFUND_PROCESSED: "WHATSAPP_TEMPLATE_REFUND_PROCESSED",
}


class WhatsAppCloudError(Exception):
    def __init__(self, message, *, code="whatsapp_error", http_status=400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


def _normalize_phone(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    cleaned = re.sub(r"[^\d+]", "", raw)
    if cleaned.startswith("00"):
        cleaned = f"+{cleaned[2:]}"
    if cleaned.startswith("+"):
        return f"+{cleaned[1:].lstrip('+')}"
    return cleaned


def _get_required_settings():
    return {
        "WHATSAPP_PHONE_NUMBER_ID": str(getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "")).strip(),
        "WHATSAPP_ACCESS_TOKEN": str(getattr(settings, "WHATSAPP_ACCESS_TOKEN", "")).strip(),
        "WHATSAPP_VERIFY_TOKEN": str(getattr(settings, "WHATSAPP_VERIFY_TOKEN", "")).strip(),
        "WHATSAPP_BUSINESS_ACCOUNT_ID": str(getattr(settings, "WHATSAPP_BUSINESS_ACCOUNT_ID", "")).strip(),
    }


def _missing_required_settings():
    values = _get_required_settings()
    return [key for key, value in values.items() if not value]


def _graph_api_base_url():
    return str(
        getattr(settings, "WHATSAPP_GRAPH_API_BASE_URL", DEFAULT_GRAPH_BASE_URL)
        or DEFAULT_GRAPH_BASE_URL
    ).rstrip("/")


def _request_timeout():
    try:
        return int(getattr(settings, "WHATSAPP_REQUEST_TIMEOUT", 20))
    except (TypeError, ValueError):
        return 20


def _template_name_for_event(event):
    env_key = EVENT_TEMPLATE_ENV_MAP.get(str(event or "").strip().lower())
    if not env_key:
        return ""
    return str(getattr(settings, env_key, "")).strip()


def get_provider_status():
    missing_settings = _missing_required_settings()
    missing_templates = []
    for event_key, env_key in EVENT_TEMPLATE_ENV_MAP.items():
        if not str(getattr(settings, env_key, "")).strip():
            missing_templates.append({"event": event_key, "env": env_key})
    configured = not missing_settings
    templates_configured = len(missing_templates) == 0
    return {
        "provider": WHATSAPP_PROVIDER_NAME,
        "configured": configured,
        "templates_configured": templates_configured,
        "enabled": configured and templates_configured,
        "missing_settings": missing_settings,
        "missing_templates": missing_templates,
    }


def _ensure_provider_configured():
    missing = _missing_required_settings()
    if missing:
        raise WhatsAppCloudError(
            f"WhatsApp Cloud API is not configured. Missing settings: {', '.join(missing)}",
            code="provider_disabled",
            http_status=503,
        )
    return _get_required_settings()


def _build_template_parameters(order, event):
    order_number = str(getattr(order, "order_number", "") or "")
    grand_total = str(getattr(order, "grand_total", "") or "")
    currency_code = str(getattr(order, "currency_code", "") or "")
    tracking_url = str(getattr(order, "tracking_url", "") or "")
    refund_amount = str(getattr(order, "refund_amount", "") or "")

    if event == WhatsAppLog.EVENT_ORDER_CREATED:
        values = [order_number, grand_total, currency_code]
    elif event == WhatsAppLog.EVENT_ORDER_SHIPPED:
        values = [order_number, tracking_url or "-"]
    elif event == WhatsAppLog.EVENT_ORDER_DELIVERED:
        values = [order_number]
    elif event == WhatsAppLog.EVENT_REFUND_PROCESSED:
        values = [order_number, refund_amount, currency_code]
    else:
        values = [order_number]

    return [{"type": "text", "text": str(value or "-")} for value in values]


def send_template(order, event, *, locale="en", metadata=None):
    config = _ensure_provider_configured()
    template_name = _template_name_for_event(event)
    if not template_name:
        env_key = EVENT_TEMPLATE_ENV_MAP.get(str(event or "").strip().lower(), "WHATSAPP_TEMPLATE_<EVENT>")
        raise WhatsAppCloudError(
            f"WhatsApp template is not configured for event '{event}'. Missing {env_key}.",
            code="template_not_configured",
            http_status=503,
        )

    recipient = _normalize_phone(getattr(order, "customer_phone", ""))
    if not recipient:
        raise WhatsAppCloudError(
            "Customer phone is required for WhatsApp notifications.",
            code="missing_recipient",
            http_status=400,
        )

    language_code = "ar" if str(locale or "").strip().lower() == "ar" else "en"
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": [
                {
                    "type": "body",
                    "parameters": _build_template_parameters(order, event),
                }
            ],
        },
    }
    if metadata:
        payload["context"] = {"metadata": metadata}

    url = f"{_graph_api_base_url()}/{config['WHATSAPP_PHONE_NUMBER_ID']}/messages"
    headers = {
        "Authorization": f"Bearer {config['WHATSAPP_ACCESS_TOKEN']}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=_request_timeout())
    except requests.RequestException as exc:
        raise WhatsAppCloudError(
            f"WhatsApp Cloud request failed: {exc}",
            code="provider_unavailable",
            http_status=502,
        ) from exc

    response_data = {}
    try:
        response_data = response.json()
    except ValueError:
        response_data = {}

    if response.status_code >= 400:
        error_message = (
            (response_data.get("error") or {}).get("message")
            or response_data.get("message")
            or response.text
            or "WhatsApp provider rejected the request."
        )
        raise WhatsAppCloudError(
            f"WhatsApp Cloud send failed: {error_message}",
            code="provider_response_error",
            http_status=400,
        )

    provider_message_id = ""
    messages = response_data.get("messages")
    if isinstance(messages, list) and messages:
        provider_message_id = str(messages[0].get("id") or "").strip()

    return {
        "success": True,
        "provider": WHATSAPP_PROVIDER_NAME,
        "status": WhatsAppLog.STATUS_SENT,
        "provider_message_id": provider_message_id,
        "template_name": template_name,
        "recipient": recipient,
        "request_payload": payload,
        "response_payload": response_data,
    }


def verify_webhook_challenge(query_params):
    verify_token = str(getattr(settings, "WHATSAPP_VERIFY_TOKEN", "") or "").strip()
    if not verify_token:
        raise WhatsAppCloudError(
            "WhatsApp webhook verify token is not configured.",
            code="provider_disabled",
            http_status=503,
        )

    mode = str(query_params.get("hub.mode", "") or "").strip()
    token = str(query_params.get("hub.verify_token", "") or "").strip()
    challenge = str(query_params.get("hub.challenge", "") or "").strip()
    if mode != "subscribe" or not challenge:
        raise WhatsAppCloudError(
            "Invalid WhatsApp webhook challenge payload.",
            code="invalid_challenge",
            http_status=400,
        )
    if token != verify_token:
        raise WhatsAppCloudError(
            "Invalid WhatsApp webhook verify token.",
            code="invalid_verify_token",
            http_status=403,
        )
    return challenge


def _raw_request_body(request):
    django_request = getattr(request, "_request", None)
    if django_request is not None:
        return django_request.body or b""
    return request.body or b""


def _verify_signature_if_configured(request):
    app_secret = str(getattr(settings, "WHATSAPP_APP_SECRET", "") or "").strip()
    if not app_secret:
        return
    signature = (
        request.headers.get("X-Hub-Signature-256")
        or request.headers.get("x-hub-signature-256")
        or request.META.get("HTTP_X_HUB_SIGNATURE_256", "")
    )
    signature = str(signature or "").strip()
    if not signature.startswith("sha256="):
        raise WhatsAppCloudError(
            "Missing WhatsApp webhook signature.",
            code="invalid_signature",
            http_status=401,
        )
    expected = hmac.new(
        app_secret.encode("utf-8"),
        _raw_request_body(request),
        hashlib.sha256,
    ).hexdigest()
    received = signature.split("=", 1)[1].strip()
    if not hmac.compare_digest(expected, received):
        raise WhatsAppCloudError(
            "Invalid WhatsApp webhook signature.",
            code="invalid_signature",
            http_status=401,
        )


def _map_receipt_status(status):
    normalized = str(status or "").strip().lower()
    if normalized == "read":
        return WhatsAppLog.STATUS_READ
    if normalized == "delivered":
        return WhatsAppLog.STATUS_DELIVERED
    if normalized == "sent":
        return WhatsAppLog.STATUS_SENT
    if normalized in {"failed", "undelivered"}:
        return WhatsAppLog.STATUS_FAILED
    return WhatsAppLog.STATUS_PENDING


def verify_webhook(request):
    config = _ensure_provider_configured()
    _verify_signature_if_configured(request)

    payload = request.data
    if not isinstance(payload, dict):
        raise WhatsAppCloudError(
            "Invalid WhatsApp webhook payload.",
            code="invalid_payload",
            http_status=400,
        )
    if str(payload.get("object", "")).strip() != "whatsapp_business_account":
        raise WhatsAppCloudError(
            "Invalid WhatsApp webhook object.",
            code="invalid_payload",
            http_status=400,
        )

    entries = payload.get("entry")
    if not isinstance(entries, list):
        entries = []

    expected_ba_id = config["WHATSAPP_BUSINESS_ACCOUNT_ID"]
    eligible_entries = [entry for entry in entries if str(entry.get("id", "")).strip() == expected_ba_id]
    if not eligible_entries:
        raise WhatsAppCloudError(
            "Webhook source business account is not allowed.",
            code="invalid_source",
            http_status=403,
        )

    expected_phone_id = config["WHATSAPP_PHONE_NUMBER_ID"]
    receipts = []
    for entry in eligible_entries:
        changes = entry.get("changes")
        if not isinstance(changes, list):
            continue
        for change in changes:
            value = change.get("value", {})
            if not isinstance(value, dict):
                continue
            metadata = value.get("metadata", {})
            phone_number_id = str((metadata or {}).get("phone_number_id", "")).strip()
            if phone_number_id and phone_number_id != expected_phone_id:
                continue
            statuses = value.get("statuses")
            if not isinstance(statuses, list):
                continue
            for status_payload in statuses:
                if not isinstance(status_payload, dict):
                    continue
                provider_message_id = str(status_payload.get("id", "")).strip()
                if not provider_message_id:
                    continue
                receipts.append(
                    {
                        "provider_message_id": provider_message_id,
                        "recipient": str(status_payload.get("recipient_id", "")).strip(),
                        "status": _map_receipt_status(status_payload.get("status")),
                        "raw_status": str(status_payload.get("status", "")).strip().lower(),
                        "webhook_payload": status_payload,
                    }
                )

    if not receipts and eligible_entries:
        raise WhatsAppCloudError(
            "Webhook payload does not contain eligible WhatsApp delivery statuses.",
            code="invalid_payload",
            http_status=400,
        )

    return {
        "payload": payload,
        "receipts": receipts,
    }


def handle_delivery_receipts(receipts, *, payload=None):
    processed = 0
    for receipt in receipts:
        provider_message_id = str(receipt.get("provider_message_id", "")).strip()
        if not provider_message_id:
            continue
        status = receipt.get("status") or WhatsAppLog.STATUS_PENDING
        raw_payload = receipt.get("webhook_payload") or {}

        log_entry = (
            WhatsAppLog.objects.filter(provider_message_id=provider_message_id)
            .order_by("-created_at")
            .first()
        )
        if log_entry:
            log_entry.status = status
            log_entry.webhook_payload = raw_payload
            if payload is not None:
                log_entry.response_payload = payload
            log_entry.save(update_fields=["status", "webhook_payload", "response_payload", "updated_at"])
        else:
            WhatsAppLog.objects.create(
                event=WhatsAppLog.EVENT_DELIVERY_RECEIPT,
                recipient=str(receipt.get("recipient", "")).strip(),
                locale="en",
                template_name="",
                provider=WHATSAPP_PROVIDER_NAME,
                provider_message_id=provider_message_id,
                status=status,
                request_payload={},
                response_payload=payload or {},
                webhook_payload=raw_payload,
                error_message="",
            )
        processed += 1

    return {"processed_receipts": processed}
