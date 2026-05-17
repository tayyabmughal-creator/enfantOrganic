"""
Paymob Accept payment gateway service.

Flow:
1. get_auth_token()          → short-lived Paymob auth token
2. create_paymob_order()     → Paymob-side order ID
3. create_payment_key()      → one-time payment token
4. Build iframe URL with payment token → send to frontend
5. Frontend redirects user to iframe URL
6. Paymob POSTs webhook → verify_hmac() → update order status

Credentials are loaded from SiteSettings (DB) first, with fallback to
Django settings (environment variables). Use the admin panel or env vars.
No Paymob credentials are ever exposed to the frontend.
"""
import hashlib
import hmac as _hmac
import logging

import requests

from .payment_config import get_paymob_config

logger = logging.getLogger(__name__)

# Fields used to compute the HMAC for Paymob transaction callbacks.
# The order is mandatory — Paymob concatenates them in this exact sequence.
_HMAC_FIELDS = [
    "amount_cents",
    "created_at",
    "currency",
    "error_occured",
    "has_parent_transaction",
    "id",
    "integration_id",
    "is_3d_secure",
    "is_auth",
    "is_capture",
    "is_refunded",
    "is_standalone_payment",
    "is_voided",
    "order",
    "owner",
    "pending",
    "source_data.pan",
    "source_data.sub_type",
    "source_data.type",
    "success",
]


class PaymobError(Exception):
    """Raised when a Paymob API call fails or is misconfigured."""


def _check_config():
    cfg = get_paymob_config()
    missing_map = {
        "api_key":        "PAYMOB_API_KEY",
        "integration_id": "PAYMOB_INTEGRATION_ID",
        "iframe_id":      "PAYMOB_IFRAME_ID",
        "hmac_secret":    "PAYMOB_HMAC_SECRET",
    }
    missing = [label for key, label in missing_map.items() if not cfg.get(key)]
    if missing:
        raise PaymobError(
            f"Paymob is not configured. Missing environment variables: {', '.join(missing)}"
        )


def _get(data: dict, dotted_key: str) -> str:
    """Retrieve a possibly nested value using dot notation, coerce to str."""
    keys = dotted_key.split(".", 1)
    value = data.get(keys[0], "")
    if len(keys) == 2 and isinstance(value, dict):
        value = value.get(keys[1], "")
    return str(value)


def get_auth_token() -> str:
    """Authenticate with Paymob and return a short-lived auth token."""
    _check_config()
    cfg = get_paymob_config()
    try:
        response = requests.post(
            f"{cfg['base_url']}/auth/tokens",
            json={"api_key": cfg["api_key"]},
            timeout=30,
        )
        response.raise_for_status()
        token = response.json().get("token", "")
        if not token:
            raise PaymobError("Paymob auth response did not contain a token.")
        return token
    except requests.RequestException as exc:
        logger.error("Paymob auth request failed: %s", exc)
        raise PaymobError(f"Paymob authentication failed: {exc}") from exc


def create_paymob_order(auth_token: str, amount_cents: int, currency: str, merchant_order_id: str) -> str:
    """Register an order with Paymob and return the Paymob order ID."""
    cfg = get_paymob_config()
    try:
        response = requests.post(
            f"{cfg['base_url']}/ecommerce/orders",
            json={
                "auth_token": auth_token,
                "delivery_needed": False,
                "amount_cents": amount_cents,
                "currency": currency,
                "merchant_order_id": str(merchant_order_id),
                "items": [],
            },
            timeout=30,
        )
        response.raise_for_status()
        paymob_order_id = response.json().get("id")
        if not paymob_order_id:
            raise PaymobError("Paymob order response did not contain an order ID.")
        return str(paymob_order_id)
    except requests.RequestException as exc:
        logger.error("Paymob create order failed for %s: %s", merchant_order_id, exc)
        raise PaymobError(f"Paymob order creation failed: {exc}") from exc


def create_payment_key(
    auth_token: str,
    amount_cents: int,
    currency: str,
    paymob_order_id: str,
    billing_data: dict,
    *,
    integration_id: int = None,
) -> str:
    """Request a payment key (one-time token) for the Paymob iframe."""
    cfg = get_paymob_config()
    try:
        response = requests.post(
            f"{cfg['base_url']}/acceptance/payment_keys",
            json={
                "auth_token": auth_token,
                "amount_cents": amount_cents,
                "expiration": 3600,
                "order_id": paymob_order_id,
                "billing_data": billing_data,
                "currency": currency,
                "integration_id": integration_id if integration_id is not None else int(cfg["integration_id"]),
                "lock_order_when_paid": True,
            },
            timeout=30,
        )
        response.raise_for_status()
        token = response.json().get("token", "")
        if not token:
            raise PaymobError("Paymob payment key response did not contain a token.")
        return token
    except requests.RequestException as exc:
        logger.error("Paymob payment key request failed: %s", exc)
        raise PaymobError(f"Paymob payment key creation failed: {exc}") from exc


def build_billing_data(order) -> dict:
    """Extract billing data from a local Order instance for Paymob."""
    name_parts = (order.customer_name or "Customer").split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else "N/A"
    return {
        "apartment": "N/A",
        "email": order.customer_email or "guest@example.com",
        "floor": "N/A",
        "first_name": first_name,
        "last_name": last_name,
        "street": order.address_line_1 or "N/A",
        "building": "N/A",
        "phone_number": order.customer_phone or "N/A",
        "shipping_method": "N/A",
        "postal_code": "N/A",
        "city": order.city or "N/A",
        "country": order.country or "N/A",
        "state": "N/A",
    }


def initiate_payment(order) -> dict:
    """
    Full Paymob initiation flow for a given Order.

    Returns a dict with:
      - payment_key: the Paymob one-time token
      - iframe_url: the URL to redirect the user to
      - paymob_order_id: the Paymob-side order ID (store this for reconciliation)
    """
    _check_config()
    cfg = get_paymob_config()
    amount_cents = int(order.grand_total * 100)
    currency = order.currency_code or cfg["currency"]

    auth_token = get_auth_token()
    paymob_order_id = create_paymob_order(auth_token, amount_cents, currency, order.order_number)
    billing_data = build_billing_data(order)
    payment_key = create_payment_key(auth_token, amount_cents, currency, paymob_order_id, billing_data)

    iframe_url = (
        f"{cfg['base_url']}/acceptance/iframes/{cfg['iframe_id']}"
        f"?payment_token={payment_key}"
    )

    logger.info(
        "Paymob payment initiated: order=%s paymob_order=%s",
        order.order_number,
        paymob_order_id,
    )

    return {
        "payment_key": payment_key,
        "iframe_url": iframe_url,
        "paymob_order_id": paymob_order_id,
    }


def initiate_apple_pay_payment(order) -> dict:
    """
    Paymob initiation flow using the Apple Pay integration ID.
    Uses the apple_pay_integration_id and apple_pay_iframe_id from config.
    Falls back to standard integration if Apple Pay IDs are not set.
    """
    cfg = get_paymob_config()
    apple_pay_integration_id = cfg["apple_pay_integration_id"]
    apple_pay_iframe_id = cfg["apple_pay_iframe_id"]

    if not apple_pay_integration_id or not apple_pay_iframe_id:
        raise PaymobError(
            "Paymob Apple Pay is not configured. "
            "Set PAYMOB_APPLE_PAY_INTEGRATION_ID and PAYMOB_APPLE_PAY_IFRAME_ID."
        )

    missing = [
        label for key, label in [
            ("api_key", "PAYMOB_API_KEY"),
            ("hmac_secret", "PAYMOB_HMAC_SECRET"),
        ]
        if not cfg.get(key)
    ]
    if missing:
        raise PaymobError(
            f"Paymob is not configured. Missing environment variables: {', '.join(missing)}"
        )

    amount_cents = int(order.grand_total * 100)
    currency = order.currency_code or cfg["currency"]

    auth_token = get_auth_token()
    paymob_order_id = create_paymob_order(auth_token, amount_cents, currency, order.order_number)
    billing_data = build_billing_data(order)
    payment_key = create_payment_key(
        auth_token,
        amount_cents,
        currency,
        paymob_order_id,
        billing_data,
        integration_id=int(apple_pay_integration_id),
    )

    iframe_url = (
        f"{cfg['base_url']}/acceptance/iframes/{apple_pay_iframe_id}"
        f"?payment_token={payment_key}"
    )

    logger.info(
        "Paymob Apple Pay payment initiated: order=%s paymob_order=%s",
        order.order_number,
        paymob_order_id,
    )

    return {
        "payment_key": payment_key,
        "iframe_url": iframe_url,
        "paymob_order_id": paymob_order_id,
    }


def verify_hmac(transaction_data: dict, received_hmac: str) -> bool:
    """
    Verify the HMAC-SHA512 signature on a Paymob transaction callback.

    Paymob concatenates specific fields in a fixed order and computes
    HMAC-SHA512 with the HMAC secret as the key.
    """
    cfg = get_paymob_config()
    if not cfg["hmac_secret"]:
        logger.warning("PAYMOB_HMAC_SECRET is not set — skipping HMAC verification.")
        return False

    concat = "".join(_get(transaction_data, field) for field in _HMAC_FIELDS)
    expected = _hmac.new(
        cfg["hmac_secret"].encode("utf-8"),
        concat.encode("utf-8"),
        hashlib.sha512,
    ).hexdigest()

    return _hmac.compare_digest(expected, received_hmac)
