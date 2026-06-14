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
from decimal import Decimal, ROUND_HALF_UP

import requests
from django.conf import settings as dj_settings

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


def _check_config(region_code=""):
    cfg = get_paymob_config(region_code)
    suffix = (cfg.get("region_code") or "").upper()
    if not cfg.get("enabled", True):
        raise PaymobError("Paymob is disabled for this region in the admin panel.")
    missing_map = {
        "api_key":        f"PAYMOB_API_KEY{('_' + suffix) if suffix and suffix != 'OM' else ''}",
        "integration_id": f"PAYMOB_INTEGRATION_ID{('_' + suffix) if suffix and suffix != 'OM' else ''}",
        "iframe_id":      f"PAYMOB_IFRAME_ID{('_' + suffix) if suffix and suffix != 'OM' else ''}",
        "hmac_secret":    f"PAYMOB_HMAC_SECRET{('_' + suffix) if suffix and suffix != 'OM' else ''}",
    }
    missing = [label for key, label in missing_map.items() if not cfg.get(key)]
    if missing:
        raise PaymobError(
            f"Paymob is not configured for this region. Missing settings: {', '.join(missing)}"
        )


def _get(data: dict, dotted_key: str) -> str:
    """Retrieve a possibly nested value using dot notation, coerce to str."""
    keys = dotted_key.split(".", 1)
    value = data.get(keys[0], "")
    if len(keys) == 2 and isinstance(value, dict):
        value = value.get(keys[1], "")
    return str(value)


def get_auth_token(cfg=None) -> str:
    """Authenticate with Paymob and return a short-lived auth token.

    Accepts an already-resolved config dict so the whole initiation flow uses a
    single region's credentials/base_url consistently.
    """
    cfg = cfg or get_paymob_config()
    if not cfg.get("api_key"):
        raise PaymobError("Paymob API key is not configured.")
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


def create_paymob_order(auth_token: str, amount_cents: int, currency: str, merchant_order_id: str, cfg=None) -> str:
    """Register an order with Paymob and return the Paymob order ID."""
    cfg = cfg or get_paymob_config()
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
    cfg=None,
) -> str:
    """Request a payment key (one-time token) for the Paymob iframe."""
    cfg = cfg or get_paymob_config()
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


def _charge_amount_and_currency(order, cfg):
    """Resolve the (amount_cents, currency) to charge through Paymob.

    Normally the order currency equals the integration currency and the amount is
    sent as-is. In shared-account mode a non-OMR order (e.g. an AED UAE order or a
    SAR Saudi order) is charged through the Oman OMR integration, so the total is
    converted into the integration's currency using the order region's fx_rate.

    Region.fx_rate is the rate FROM the base/Oman currency TO the region currency
    (region_price = base_price * fx_rate), so we divide to convert back.
    """
    integration_currency = str(cfg.get("currency") or "").upper()
    order_currency = str(getattr(order, "currency_code", "") or "").upper()
    total = Decimal(str(getattr(order, "grand_total", 0) or 0))
    currency = order_currency or integration_currency

    if integration_currency and order_currency and order_currency != integration_currency:
        rate = Decimal(str(getattr(getattr(order, "region", None), "fx_rate", 0) or 0))
        if rate <= 0:
            raise PaymobError(
                f"Cannot charge a {order_currency} order through a "
                f"{integration_currency} Paymob integration: region fx_rate is not set."
            )
        total = (total / rate).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        currency = integration_currency

    amount_cents = int(total * 100)
    return amount_cents, currency


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


def _unified_checkout_enabled(cfg) -> bool:
    """True when Unified Checkout is switched on AND the account-level secret +
    public keys are present. Used to route the flow to Paymob's hosted Unified
    Checkout (redirect) for hosted/MIGS integrations that don't support the
    legacy embeddable iframe."""
    flag = str(getattr(dj_settings, "PAYMOB_USE_UNIFIED_CHECKOUT", "") or "").strip().lower() in {
        "1", "true", "yes", "on",
    }
    return flag and bool(cfg.get("secret_key")) and bool(cfg.get("public_key"))


def _unified_payment_method_ids(cfg) -> list:
    """Integration IDs offered on the Unified Checkout page (card + Apple Pay)."""
    ids = []
    for key in ("integration_id", "apple_pay_integration_id"):
        value = cfg.get(key)
        if not value:
            continue
        try:
            num = int(value)
        except (TypeError, ValueError):
            continue
        if num not in ids:
            ids.append(num)
    return ids


def initiate_unified_checkout(order, cfg=None, region_code=None) -> dict:
    """Create a Paymob payment Intention and return a hosted Unified Checkout URL.

    Works with hosted/MIGS integrations (e.g. live OM card 69050 / Apple Pay
    69051) that the legacy /acceptance/iframes endpoint cannot render. The amount
    is converted into the integration's currency (shared-account mode) the same
    way as the iframe flow. Returns redirect_url for the frontend to navigate to.
    """
    if region_code is None:
        region_code = getattr(getattr(order, "region", None), "code", "")
    cfg = cfg or get_paymob_config(region_code)
    if not cfg.get("secret_key") or not cfg.get("public_key"):
        raise PaymobError(
            "Paymob Unified Checkout is not configured. Set PAYMOB_SECRET_KEY and PAYMOB_PUBLIC_KEY."
        )
    payment_methods = _unified_payment_method_ids(cfg)
    if not payment_methods:
        raise PaymobError("Paymob Unified Checkout has no integration IDs configured.")

    amount_cents, currency = _charge_amount_and_currency(order, cfg)
    billing = build_billing_data(order)
    special_reference = str(order.order_number)
    body = {
        "amount": amount_cents,
        "currency": currency,
        "payment_methods": payment_methods,
        "items": [{
            "name": special_reference,
            "amount": amount_cents,
            "description": f"Order {special_reference}",
            "quantity": 1,
        }],
        "billing_data": billing,
        "customer": {
            "first_name": billing["first_name"],
            "last_name": billing["last_name"],
            "email": billing["email"],
        },
        "special_reference": special_reference,
    }
    pub_base = str(getattr(dj_settings, "PAYMOB_PUBLIC_BASE_URL", "") or "").rstrip("/")
    if pub_base:
        body["notification_url"] = f"{pub_base}/api/payments/webhook/"
        body["redirection_url"] = f"{pub_base}/checkout/return"

    base = cfg["base_url"].rstrip("/")
    root = base[:-4] if base.endswith("/api") else base  # /v1/intention lives on the root host

    try:
        resp = requests.post(
            f"{root}/v1/intention/",
            headers={"Authorization": f"Token {cfg['secret_key']}", "Content-Type": "application/json"},
            json=body,
            timeout=30,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.error("Paymob intention request failed: %s", exc)
        raise PaymobError(f"Paymob Unified Checkout initiation failed: {exc}") from exc

    data = resp.json()
    client_secret = data.get("client_secret", "")
    if not client_secret:
        raise PaymobError("Paymob intention response did not contain a client_secret.")

    redirect_url = f"{root}/unifiedcheckout/?publicKey={cfg['public_key']}&clientSecret={client_secret}"
    paymob_order_id = str(data.get("intention_order_id") or data.get("id") or "")
    logger.info(
        "Paymob Unified Checkout initiated: order=%s intention=%s region=%s",
        order.order_number, paymob_order_id, region_code or "default",
    )
    return {
        "redirect_url": redirect_url,
        "iframe_url": redirect_url,
        "paymob_order_id": paymob_order_id,
    }


def initiate_payment(order) -> dict:
    """
    Full Paymob initiation flow for a given Order.

    Returns a dict with:
      - payment_key: the Paymob one-time token
      - iframe_url: the URL to redirect the user to
      - paymob_order_id: the Paymob-side order ID (store this for reconciliation)
    """
    region_code = getattr(getattr(order, "region", None), "code", "")
    cfg = get_paymob_config(region_code)
    if _unified_checkout_enabled(cfg):
        return initiate_unified_checkout(order, cfg, region_code)
    _check_config(region_code)
    amount_cents, currency = _charge_amount_and_currency(order, cfg)

    auth_token = get_auth_token(cfg)
    paymob_order_id = create_paymob_order(auth_token, amount_cents, currency, order.order_number, cfg=cfg)
    billing_data = build_billing_data(order)
    payment_key = create_payment_key(auth_token, amount_cents, currency, paymob_order_id, billing_data, cfg=cfg)

    iframe_url = (
        f"{cfg['base_url']}/acceptance/iframes/{cfg['iframe_id']}"
        f"?payment_token={payment_key}"
    )

    logger.info(
        "Paymob payment initiated: order=%s paymob_order=%s region=%s",
        order.order_number,
        paymob_order_id,
        region_code or "default",
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
    region_code = getattr(getattr(order, "region", None), "code", "")
    cfg = get_paymob_config(region_code)
    if _unified_checkout_enabled(cfg):
        # Unified Checkout presents Apple Pay (and card) on its hosted page.
        return initiate_unified_checkout(order, cfg, region_code)
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
            ("integration_id", "PAYMOB_INTEGRATION_ID"),
            ("iframe_id", "PAYMOB_IFRAME_ID"),
            ("hmac_secret", "PAYMOB_HMAC_SECRET"),
        ]
        if not cfg.get(key)
    ]
    if missing:
        raise PaymobError(
            f"Paymob is not configured. Missing environment variables: {', '.join(missing)}"
        )

    amount_cents, currency = _charge_amount_and_currency(order, cfg)

    auth_token = get_auth_token(cfg)
    paymob_order_id = create_paymob_order(auth_token, amount_cents, currency, order.order_number, cfg=cfg)
    billing_data = build_billing_data(order)
    payment_key = create_payment_key(
        auth_token,
        amount_cents,
        currency,
        paymob_order_id,
        billing_data,
        integration_id=int(apple_pay_integration_id),
        cfg=cfg,
    )

    iframe_url = (
        f"{cfg['base_url']}/acceptance/iframes/{apple_pay_iframe_id}"
        f"?payment_token={payment_key}"
    )

    logger.info(
        "Paymob Apple Pay payment initiated: order=%s paymob_order=%s region=%s",
        order.order_number,
        paymob_order_id,
        region_code or "default",
    )

    return {
        "payment_key": payment_key,
        "iframe_url": iframe_url,
        "paymob_order_id": paymob_order_id,
    }


def verify_hmac(transaction_data: dict, received_hmac: str, region_code="") -> bool:
    """
    Verify the HMAC-SHA512 signature on a Paymob transaction callback.

    Paymob concatenates specific fields in a fixed order and computes
    HMAC-SHA512 with the HMAC secret as the key. The secret is region-specific:
    the caller passes the region of the order the callback refers to so the
    correct per-region secret is used (defaults to the global/Oman secret).
    """
    cfg = get_paymob_config(region_code)
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
