"""
PayTabs hosted-payment integration service.

Implements:
    - Hosted payment initiation
    - Callback/webhook verification
    - Transaction status query
    - Refund request
"""
import hashlib
import hmac
import logging
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urlencode

import requests
from django.conf import settings

from ..models import Order, PaymentTransaction

logger = logging.getLogger(__name__)

MONEY_QUANTIZER = Decimal("0.01")


class PaytabsError(Exception):
    def __init__(self, message, *, code="paytabs_error", http_status=400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


@dataclass(frozen=True)
class PaytabsRegionConfig:
    region_code: str
    profile_id: str
    server_key: str
    base_url: str


def _quantize_money(value):
    return Decimal(value).quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)


def _normalize_region_code(value):
    code = str(value or "").strip().lower()
    if code == "uae":
        return "ae"
    return code


def _resolve_base_url(region_setting):
    raw = str(region_setting or "").strip()
    if not raw:
        return "https://secure.paytabs.com"
    lowered = raw.lower()
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return raw.rstrip("/")
    mapping = {
        "sa": "https://secure.paytabs.sa",
        "ksa": "https://secure.paytabs.sa",
        "sau": "https://secure.paytabs.sa",
        "ae": "https://secure.paytabs.com",
        "uae": "https://secure.paytabs.com",
        "are": "https://secure.paytabs.com",
        "om": "https://secure-oman.paytabs.com",
        "omn": "https://secure-oman.paytabs.com",
        "oman": "https://secure-oman.paytabs.com",
        "global": "https://secure-global.paytabs.com",
    }
    return mapping.get(lowered, raw.rstrip("/"))


def _region_settings_suffix(region_code):
    normalized = _normalize_region_code(region_code)
    mapping = {"om": "OM", "ae": "AE", "sa": "SA"}
    return mapping.get(normalized, normalized.upper())


def get_region_config(region_code):
    suffix = _region_settings_suffix(region_code)
    profile_id = getattr(settings, f"PAYTABS_PROFILE_ID_{suffix}", "") or getattr(settings, "PAYTABS_PROFILE_ID", "")
    server_key = getattr(settings, f"PAYTABS_SERVER_KEY_{suffix}", "") or getattr(settings, "PAYTABS_SERVER_KEY", "")
    region_setting = getattr(settings, f"PAYTABS_REGION_{suffix}", "") or getattr(settings, "PAYTABS_BASE_URL", "")
    base_url = _resolve_base_url(region_setting)

    missing = []
    if not profile_id:
        missing.append(f"PAYTABS_PROFILE_ID_{suffix}")
    if not server_key:
        missing.append(f"PAYTABS_SERVER_KEY_{suffix}")

    if missing:
        raise PaytabsError(
            f"paytabs is not configured. Missing settings: {', '.join(missing)}",
            code="provider_config_missing",
            http_status=503,
        )

    return PaytabsRegionConfig(
        region_code=_normalize_region_code(region_code),
        profile_id=str(profile_id).strip(),
        server_key=str(server_key).strip(),
        base_url=base_url,
    )


def _country_code_for_order(order):
    region_code = _normalize_region_code(getattr(order.region, "code", ""))
    if region_code == "ae":
        return "AE"
    if region_code == "sa":
        return "SA"
    if region_code == "om":
        return "OM"
    return str(order.country or "AE").strip()[:2].upper() or "AE"


def _build_urls(order):
    return_base = (getattr(settings, "PAYTABS_RETURN_BASE_URL", "") or "").rstrip("/")
    callback_base = (getattr(settings, "PAYTABS_CALLBACK_BASE_URL", "") or "").rstrip("/")
    if not return_base:
        raise PaytabsError(
            "PAYTABS_RETURN_BASE_URL is required to build redirect URLs.",
            code="provider_config_missing",
            http_status=503,
        )
    if not callback_base:
        raise PaytabsError(
            "PAYTABS_CALLBACK_BASE_URL is required to build callback URLs.",
            code="provider_config_missing",
            http_status=503,
        )

    locale = (order.locale or "en").lower()
    region = _normalize_region_code(getattr(order.region, "code", "om"))
    order_number = order.order_number
    lookup_token = order.lookup_token
    if not lookup_token:
        lookup_token = order.ensure_lookup_token()
        order.save(update_fields=["lookup_token", "updated_at"])
    common_query = urlencode(
        {
            "region": region,
            "order_number": order_number,
            "lookup_token": lookup_token,
        }
    )

    return {
        "success": f"{return_base}/{locale}/payment/success?{common_query}",
        "failed": f"{return_base}/{locale}/payment/failed?{common_query}",
        "pending": f"{return_base}/{locale}/payment/pending?{common_query}",
        "callback": f"{callback_base}/api/payments/webhook/paytabs/",
    }


def _build_payment_methods_for_paytabs(order):
    methods = getattr(order.region, "payment_supported_methods", {}) or {}
    paytabs_methods = methods.get("paytabs_payment_methods")
    if isinstance(paytabs_methods, list) and paytabs_methods:
        return [str(item).strip().lower() for item in paytabs_methods if str(item).strip()]

    generated = ["creditcard"]
    local_methods = methods.get("local") or []
    wallet_methods = methods.get("wallets") or []

    normalized_local = {str(item).strip().lower() for item in local_methods if str(item).strip()}
    normalized_wallets = {str(item).strip().lower() for item in wallet_methods if str(item).strip()}

    if "mada" in normalized_local:
        generated.append("mada")
    if "omannet" in normalized_local:
        generated.append("omannet")
    if "apple_pay" in normalized_wallets or "applepay" in normalized_wallets:
        generated.append("applepay")
    return generated


def _post_json(config, path, payload):
    url = f"{config.base_url}{path}"
    headers = {
        "Authorization": config.server_key,
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=45)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.error("PayTabs API request failed (%s %s): %s", "POST", url, exc)
        raise PaytabsError(
            "PayTabs gateway request failed.",
            code="provider_unavailable",
            http_status=502,
        ) from exc

    try:
        return response.json()
    except ValueError as exc:
        raise PaytabsError(
            "PayTabs gateway returned an invalid response.",
            code="provider_response_invalid",
            http_status=502,
        ) from exc


def _normalize_tran_ref(payload):
    return str(payload.get("tran_ref") or payload.get("tranRef") or "").strip()


def _extract_order_number(payload):
    return str(payload.get("cart_id") or payload.get("cartId") or "").strip()


def _extract_response_status(payload):
    payment_result = payload.get("payment_result") or {}
    if isinstance(payment_result, dict):
        status_value = payment_result.get("response_status")
        if status_value:
            return str(status_value).strip().upper()
    resp_status = payload.get("respStatus")
    if resp_status:
        return str(resp_status).strip().upper()
    return ""


def _map_response_status_to_tx_status(response_status, tran_type="sale"):
    tran_type_value = str(tran_type or "").strip().lower()
    if tran_type_value == "refund" and response_status == "A":
        return PaymentTransaction.STATUS_REFUNDED
    if response_status == "A":
        return PaymentTransaction.STATUS_PAID
    if response_status in {"P", "H"}:
        return PaymentTransaction.STATUS_PENDING
    if response_status == "V":
        return PaymentTransaction.STATUS_CANCELLED
    return PaymentTransaction.STATUS_FAILED


def initiate_payment(order):
    config = get_region_config(getattr(order.region, "code", ""))
    urls = _build_urls(order)
    cart_amount = str(_quantize_money(order.grand_total))

    payload = {
        "profile_id": int(config.profile_id) if str(config.profile_id).isdigit() else config.profile_id,
        "tran_type": "sale",
        "tran_class": "ecom",
        "cart_id": order.order_number,
        "cart_currency": order.currency_code,
        "cart_amount": cart_amount,
        "cart_description": f"Order {order.order_number}",
        "paypage_lang": "ar" if (order.locale or "").lower() == "ar" else "en",
        "callback": urls["callback"],
        "return": urls["pending"],
        "customer_details": {
            "name": order.customer_name,
            "email": order.customer_email or "guest@example.com",
            "phone": order.customer_phone or "0000000000",
            "street1": order.address_line_1 or "N/A",
            "city": order.city or "N/A",
            "state": order.area or order.city or "N/A",
            "country": _country_code_for_order(order),
            "zip": order.postcode or "00000",
        },
        "shipping_details": {
            "name": order.customer_name,
            "email": order.customer_email or "guest@example.com",
            "phone": order.customer_phone or "0000000000",
            "street1": order.address_line_1 or "N/A",
            "city": order.city or "N/A",
            "state": order.area or order.city or "N/A",
            "country": _country_code_for_order(order),
            "zip": order.postcode or "00000",
        },
        "hide_shipping": True,
        "user_defined": {
            "udf1": order.order_number,
            "udf2": urls["success"],
            "udf3": urls["failed"],
        },
    }

    payment_methods = _build_payment_methods_for_paytabs(order)
    if payment_methods:
        payload["payment_methods"] = payment_methods

    response_data = _post_json(config, "/payment/request", payload)
    redirect_url = response_data.get("redirect_url")
    tran_ref = _normalize_tran_ref(response_data)
    if not redirect_url or not tran_ref:
        raise PaytabsError(
            "PayTabs did not return redirect_url/tran_ref for payment initiation.",
            code="provider_response_invalid",
            http_status=502,
        )

    return {
        "provider": PaymentTransaction.PROVIDER_PAYTABS,
        "provider_reference": tran_ref,
        "paytabs_tran_ref": tran_ref,
        "redirect_url": redirect_url,
        "iframe_url": redirect_url,
        "paymob_order_id": tran_ref,  # compatibility key expected by existing frontend flow
        "payment_key": tran_ref,  # compatibility key expected by existing frontend flow
        "return_url_pending": urls["pending"],
        "return_url_success": urls["success"],
        "return_url_failed": urls["failed"],
    }


def _resolve_config_for_webhook(payload):
    cart_id = _extract_order_number(payload)
    if cart_id:
        order = Order.objects.select_related("region").filter(order_number=cart_id).first()
        if order:
            return get_region_config(order.region.code)

    profile_id = str(payload.get("profile_id") or payload.get("profileId") or "").strip()
    if profile_id:
        for code in ("om", "ae", "sa"):
            try:
                candidate = get_region_config(code)
            except PaytabsError:
                continue
            if str(candidate.profile_id) == profile_id:
                return candidate

    raise PaytabsError(
        "Unable to resolve PayTabs region credentials for webhook validation.",
        code="provider_config_missing",
        http_status=503,
    )


def _get_raw_request_body(request):
    django_request = getattr(request, "_request", None)
    if django_request is not None:
        return django_request.body or b""
    return request.body or b""


def _verify_callback_signature(config, raw_body, request):
    signature = (
        request.headers.get("Signature")
        or request.headers.get("signature")
        or request.META.get("HTTP_SIGNATURE", "")
    )
    signature = str(signature or "").strip().lower()
    if not signature:
        raise PaytabsError(
            "Missing PayTabs webhook signature.",
            code="invalid_signature",
            http_status=400,
        )
    expected = hmac.new(
        config.server_key.encode("utf-8"),
        raw_body or b"",
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise PaytabsError(
            "Invalid PayTabs webhook signature.",
            code="invalid_signature",
            http_status=400,
        )


def query_transaction_by_ref(region_code, tran_ref):
    config = get_region_config(region_code)
    payload = {
        "profile_id": int(config.profile_id) if str(config.profile_id).isdigit() else config.profile_id,
        "tran_ref": tran_ref,
    }
    return _post_json(config, "/payment/query", payload)


def verify_webhook(request):
    raw_body = _get_raw_request_body(request)
    payload = request.data if isinstance(request.data, dict) else {}
    if not payload:
        raise PaytabsError("Invalid payload.", code="invalid_payload", http_status=400)

    config = _resolve_config_for_webhook(payload)
    _verify_callback_signature(config, raw_body, request)

    tran_ref = _normalize_tran_ref(payload)
    order_number = _extract_order_number(payload)
    if not tran_ref or not order_number:
        raise PaytabsError(
            "Webhook payload is missing tran_ref or cart_id.",
            code="invalid_payload",
            http_status=400,
        )

    # Secondary verification against PayTabs query endpoint to reject forged payloads.
    query_response = _post_json(
        config,
        "/payment/query",
        {
            "profile_id": int(config.profile_id) if str(config.profile_id).isdigit() else config.profile_id,
            "tran_ref": tran_ref,
        },
    )
    queried_order_number = _extract_order_number(query_response)
    if queried_order_number and queried_order_number != order_number:
        raise PaytabsError(
            "Webhook order reference does not match PayTabs query validation.",
            code="invalid_signature",
            http_status=400,
        )

    response_status = _extract_response_status(query_response) or _extract_response_status(payload)
    tran_type = str(query_response.get("tran_type") or payload.get("tran_type") or "sale")
    tx_status = _map_response_status_to_tx_status(response_status, tran_type)

    return {
        "provider": PaymentTransaction.PROVIDER_PAYTABS,
        "provider_reference": tran_ref,
        "order_number": order_number,
        "status": tx_status,
        "response_status": response_status,
        "raw_response": payload,
        "verified_query": query_response,
    }


def get_status(transaction):
    order = transaction.order
    response_data = query_transaction_by_ref(order.region.code, transaction.provider_reference)
    response_status = _extract_response_status(response_data)
    tx_status = _map_response_status_to_tx_status(response_status, response_data.get("tran_type"))
    return {
        "provider": PaymentTransaction.PROVIDER_PAYTABS,
        "provider_reference": transaction.provider_reference,
        "status": tx_status,
        "response_status": response_status,
        "supported": True,
        "raw": response_data,
    }


def refund(transaction, amount):
    order = transaction.order
    config = get_region_config(order.region.code)
    refund_amount = str(_quantize_money(amount))

    payload = {
        "profile_id": int(config.profile_id) if str(config.profile_id).isdigit() else config.profile_id,
        "tran_type": "refund",
        "tran_class": "ecom",
        "tran_ref": transaction.provider_reference,
        "cart_id": f"{order.order_number}-refund-{transaction.pk}",
        "cart_currency": order.currency_code,
        "cart_amount": refund_amount,
        "cart_description": f"Refund for {order.order_number}",
    }

    response_data = _post_json(config, "/payment/request", payload)
    response_status = _extract_response_status(response_data)
    status_value = _map_response_status_to_tx_status(response_status, "refund")

    if status_value == PaymentTransaction.STATUS_FAILED:
        raise PaytabsError(
            "PayTabs refund request was not accepted.",
            code="refund_failed",
            http_status=400,
        )

    return {
        "provider": PaymentTransaction.PROVIDER_PAYTABS,
        "provider_reference": _normalize_tran_ref(response_data) or transaction.provider_reference,
        "status": status_value,
        "response_status": response_status,
        "raw_response": response_data,
    }
