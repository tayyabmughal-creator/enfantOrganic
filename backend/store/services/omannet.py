"""
OmanNet payment adapter scaffold.

Direct OmanNet API integration details often vary by acquiring bank/contract.
This module provides:
  - credential checks
  - webhook verification structure
  - controlled placeholder responses for initiation/status/refund
"""
import hashlib
import hmac
from dataclasses import dataclass

from ..models import PaymentTransaction
from .payment_config import get_omannet_config


class OmannetError(Exception):
    def __init__(self, message, *, code="omannet_error", http_status=400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


@dataclass(frozen=True)
class OmannetConfig:
    merchant_id: str
    access_code: str
    sha_request: str
    sha_response: str
    base_url: str
    webhook_secret: str


def _build_config():
    cfg = get_omannet_config()
    return OmannetConfig(
        merchant_id=cfg["merchant_id"],
        access_code=cfg["access_code"],
        sha_request=cfg["sha_request"],
        sha_response=cfg["sha_response"],
        base_url=cfg["base_url"].rstrip("/"),
        webhook_secret=cfg["webhook_secret"],
    )


def check_configuration():
    config = _build_config()
    missing = []
    if not config.merchant_id:
        missing.append("OMANNET_MERCHANT_ID")
    if not config.access_code:
        missing.append("OMANNET_ACCESS_CODE")
    if not config.sha_request:
        missing.append("OMANNET_SHA_REQUEST")
    if not config.base_url:
        missing.append("OMANNET_BASE_URL")
    if missing:
        raise OmannetError(
            f"omannet is not configured. Missing settings: {', '.join(missing)}",
            code="provider_config_missing",
            http_status=503,
        )
    return config


def initiate_payment(order):
    check_configuration()
    raise OmannetError(
        "OmanNet adapter scaffolding is ready, but direct gateway contract/API details are pending.",
        code="provider_not_implemented",
        http_status=503,
    )


def verify_webhook(request):
    payload = request.data if isinstance(request.data, dict) else {}
    if not payload:
        raise OmannetError("Invalid payload.", code="invalid_payload", http_status=400)

    config = check_configuration()
    if config.webhook_secret:
        signature = (
            request.headers.get("X-OmanNet-Signature")
            or request.headers.get("OmanNet-Signature")
            or request.headers.get("Signature")
            or request.META.get("HTTP_X_OMANNET_SIGNATURE", "")
        )
        signature = str(signature or "").strip().lower()
        if not signature:
            raise OmannetError("Missing OmanNet webhook signature.", code="invalid_signature", http_status=400)
        raw_body = getattr(getattr(request, "_request", request), "body", b"") or b""
        expected = hmac.new(
            config.webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise OmannetError("Invalid OmanNet webhook signature.", code="invalid_signature", http_status=400)

    order_number = str(
        payload.get("order_number")
        or payload.get("merchant_order_id")
        or payload.get("cart_id")
        or ""
    ).strip()
    provider_reference = str(
        payload.get("transaction_id")
        or payload.get("tran_ref")
        or payload.get("id")
        or ""
    ).strip()
    if not order_number or not provider_reference:
        raise OmannetError(
            "Webhook payload is missing order_number/provider_reference.",
            code="invalid_payload",
            http_status=400,
        )

    status_key = str(payload.get("status") or payload.get("payment_status") or "").strip().lower()
    if status_key in {"paid", "success", "successful", "completed"}:
        tx_status = PaymentTransaction.STATUS_PAID
    elif status_key in {"pending", "processing"}:
        tx_status = PaymentTransaction.STATUS_PENDING
    elif status_key in {"cancelled", "canceled"}:
        tx_status = PaymentTransaction.STATUS_CANCELLED
    elif status_key == "refunded":
        tx_status = PaymentTransaction.STATUS_REFUNDED
    else:
        tx_status = PaymentTransaction.STATUS_FAILED

    return {
        "provider": PaymentTransaction.PROVIDER_OMANNET,
        "provider_reference": provider_reference,
        "order_number": order_number,
        "status": tx_status,
        "raw_response": payload,
    }


def get_status(transaction):
    raise OmannetError(
        "OmanNet status query scaffolding exists but direct API details are pending.",
        code="provider_not_implemented",
        http_status=503,
    )


def refund(transaction, amount):
    raise OmannetError(
        "OmanNet refund scaffolding exists but direct API details are pending.",
        code="provider_not_implemented",
        http_status=503,
    )
