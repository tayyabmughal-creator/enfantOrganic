"""
Thawani payment adapter scaffold.

This adapter intentionally supports:
  - configuration checks
  - webhook verification structure
  - request/response mapping hooks

If production API credentials/contract details are not finalized, initiation and refund
remain safe placeholders that return controlled errors.
"""
import hashlib
import hmac
import logging
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

import requests

from ..models import PaymentTransaction
from .payment_config import get_thawani_config

logger = logging.getLogger(__name__)

MONEY_QUANTIZER = Decimal("0.01")
_LEGACY_API_PREFIX = "/api/v1"


class ThawaniError(Exception):
    def __init__(self, message, *, code="thawani_error", http_status=400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


@dataclass(frozen=True)
class ThawaniConfig:
    publishable_key: str
    secret_key: str
    base_url: str
    webhook_secret: str
    enable_real_api: bool
    create_session_path: str


def _to_money(value):
    return Decimal(value).quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)


def _build_request_url(base_url, path):
    base = str(base_url or "").strip().rstrip("/")
    normalized_path = f"/{str(path or '').lstrip('/')}"
    # Backward compatibility: older configs may still include /api/v1 in the
    # base URL while the path also starts with /api/v1/...
    if base.endswith(_LEGACY_API_PREFIX) and normalized_path.startswith(f"{_LEGACY_API_PREFIX}/"):
        base = base[: -len(_LEGACY_API_PREFIX)]
    return f"{base}{normalized_path}"


def _build_config():
    cfg = get_thawani_config()
    return ThawaniConfig(
        publishable_key=cfg["publishable_key"],
        secret_key=cfg["secret_key"],
        base_url=cfg["base_url"].rstrip("/"),
        webhook_secret=cfg["webhook_secret"],
        enable_real_api=cfg["enable_real_api"],
        create_session_path=cfg["create_session_path"],
    )


def check_configuration():
    config = _build_config()
    missing = []
    if not config.publishable_key:
        missing.append("THAWANI_PUBLISHABLE_KEY")
    if not config.secret_key:
        missing.append("THAWANI_SECRET_KEY")
    if not config.base_url:
        missing.append("THAWANI_BASE_URL")
    if missing:
        raise ThawaniError(
            f"thawani is not configured. Missing settings: {', '.join(missing)}",
            code="provider_config_missing",
            http_status=503,
        )
    return config


def _post_json(config, path, payload):
    url = _build_request_url(config.base_url, path)
    headers = {
        "Content-Type": "application/json",
        "thawani-api-key": config.secret_key,
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=45)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.error("Thawani API request failed (%s): %s", url, exc)
        raise ThawaniError(
            "Thawani gateway request failed.",
            code="provider_unavailable",
            http_status=502,
        ) from exc
    try:
        return response.json()
    except ValueError as exc:
        raise ThawaniError(
            "Thawani returned an invalid response.",
            code="provider_response_invalid",
            http_status=502,
        ) from exc


def initiate_payment(order):
    config = check_configuration()
    if not config.enable_real_api:
        raise ThawaniError(
            "Thawani adapter is enabled but real API mode is disabled. "
            "Set THAWANI_ENABLE_REAL_API=1 after credential/API confirmation.",
            code="provider_not_implemented",
            http_status=503,
        )

    payload = {
        "client_reference_id": order.order_number,
        "mode": "payment",
        "products": [
            {
                "name": f"Order {order.order_number}",
                "quantity": 1,
                # Thawani implementations often expect minor units; kept configurable in adapter mode.
                "unit_amount": int(_to_money(order.grand_total) * 1000),
            }
        ],
        "success_url": "",
        "cancel_url": "",
        "metadata": {
            "order_number": order.order_number,
        },
    }

    response_data = _post_json(config, config.create_session_path, payload)
    data_obj = response_data.get("data") if isinstance(response_data, dict) else {}
    provider_reference = str(
        (data_obj or {}).get("session_id")
        or response_data.get("session_id")
        or response_data.get("id")
        or ""
    ).strip()
    redirect_url = str(
        (data_obj or {}).get("checkout_url")
        or response_data.get("checkout_url")
        or response_data.get("redirect_url")
        or ""
    ).strip()
    if not provider_reference or not redirect_url:
        raise ThawaniError(
            "Thawani did not return expected session/checkout fields.",
            code="provider_response_invalid",
            http_status=502,
        )

    return {
        "provider": PaymentTransaction.PROVIDER_THAWANI,
        "provider_reference": provider_reference,
        "redirect_url": redirect_url,
        "iframe_url": redirect_url,
    }


def _map_status(raw_status):
    value = str(raw_status or "").strip().lower()
    if value in {"paid", "successful", "completed", "success"}:
        return PaymentTransaction.STATUS_PAID
    if value in {"pending", "processing"}:
        return PaymentTransaction.STATUS_PENDING
    if value in {"cancelled", "canceled"}:
        return PaymentTransaction.STATUS_CANCELLED
    if value in {"refunded"}:
        return PaymentTransaction.STATUS_REFUNDED
    return PaymentTransaction.STATUS_FAILED


def verify_webhook(request):
    payload = request.data if isinstance(request.data, dict) else {}
    if not payload:
        raise ThawaniError("Invalid payload.", code="invalid_payload", http_status=400)

    config = check_configuration()

    if config.webhook_secret:
        signature = (
            request.headers.get("X-Thawani-Signature")
            or request.headers.get("Thawani-Signature")
            or request.headers.get("Signature")
            or request.META.get("HTTP_X_THAWANI_SIGNATURE", "")
        )
        signature = str(signature or "").strip().lower()
        if not signature:
            raise ThawaniError("Missing Thawani webhook signature.", code="invalid_signature", http_status=400)
        raw_body = getattr(getattr(request, "_request", request), "body", b"") or b""
        expected = hmac.new(
            config.webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise ThawaniError("Invalid Thawani webhook signature.", code="invalid_signature", http_status=400)

    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    order_number = str(
        metadata.get("order_number")
        or payload.get("order_number")
        or payload.get("client_reference_id")
        or ""
    ).strip()
    provider_reference = str(
        payload.get("session_id")
        or payload.get("payment_id")
        or payload.get("id")
        or ""
    ).strip()
    if not order_number or not provider_reference:
        raise ThawaniError(
            "Webhook payload is missing order_number/provider_reference.",
            code="invalid_payload",
            http_status=400,
        )

    status_value = _map_status(payload.get("status") or payload.get("payment_status"))
    return {
        "provider": PaymentTransaction.PROVIDER_THAWANI,
        "provider_reference": provider_reference,
        "order_number": order_number,
        "status": status_value,
        "raw_response": payload,
    }


def get_status(transaction):
    raise ThawaniError(
        "Thawani status query is scaffolded but not enabled until API contract is finalized.",
        code="provider_not_implemented",
        http_status=503,
    )


def refund(transaction, amount):
    raise ThawaniError(
        "Thawani refund flow is scaffolded but not enabled until merchant/API approval.",
        code="provider_not_implemented",
        http_status=503,
    )
