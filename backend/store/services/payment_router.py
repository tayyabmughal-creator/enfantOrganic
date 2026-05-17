"""
Provider-based payment router.

This module centralizes provider selection and exposes a stable interface:
    - initiate_payment(order, provider=None)
    - verify_webhook(provider, request)
    - get_status(transaction)
    - refund(transaction, amount)
"""
from decimal import Decimal

from django.conf import settings

from ..models import PaymentTransaction
from . import omannet
from . import paymob
from . import paytabs
from . import thawani


PROVIDER_LABELS = {
    PaymentTransaction.PROVIDER_PAYMOB: "Paymob",
    PaymentTransaction.PROVIDER_PAYTABS: "PayTabs",
    PaymentTransaction.PROVIDER_THAWANI: "Thawani",
    PaymentTransaction.PROVIDER_OMANNET: "OmanNet",
    PaymentTransaction.PROVIDER_HYPERPAY: "HyperPay",
    PaymentTransaction.PROVIDER_TELR: "Telr",
}


class PaymentProviderError(Exception):
    def __init__(self, message, *, code="payment_provider_error", http_status=400):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


class PaymentProviderDisabledError(PaymentProviderError):
    def __init__(self, message):
        super().__init__(message, code="provider_disabled", http_status=400)


class PaymentProviderConfigError(PaymentProviderError):
    def __init__(self, message):
        super().__init__(message, code="provider_config_missing", http_status=503)


class PaymentProviderNotImplementedError(PaymentProviderError):
    def __init__(self, message):
        super().__init__(message, code="provider_not_implemented", http_status=503)


class BasePaymentProvider:
    key = ""
    required_settings = ()

    def check_configuration(self):
        missing = [name for name in self.required_settings if not getattr(settings, name, "")]
        if missing:
            raise PaymentProviderConfigError(
                f"{self.key} is not configured. Missing settings: {', '.join(missing)}"
            )

    def initiate_payment(self, order):
        raise PaymentProviderNotImplementedError(f"{self.key} payment initiation is not implemented.")

    def verify_webhook(self, request):
        raise PaymentProviderNotImplementedError(f"{self.key} webhook verification is not implemented.")

    def get_status(self, transaction):
        return {
            "provider": self.key,
            "provider_reference": transaction.provider_reference,
            "status": transaction.status,
            "supported": False,
        }

    def refund(self, transaction, amount):
        raise PaymentProviderNotImplementedError(f"{self.key} refunds are not implemented.")


class PaymobPaymentProvider(BasePaymentProvider):
    key = PaymentTransaction.PROVIDER_PAYMOB
    required_settings = (
        "PAYMOB_API_KEY",
        "PAYMOB_INTEGRATION_ID",
        "PAYMOB_IFRAME_ID",
        "PAYMOB_HMAC_SECRET",
    )

    def initiate_payment(self, order):
        self.check_configuration()
        data = paymob.initiate_payment(order)
        data["provider"] = self.key
        data["provider_reference"] = str(data.get("paymob_order_id", ""))
        return data

    def verify_webhook(self, request):
        self.check_configuration()
        received_hmac = request.query_params.get("hmac", "")
        payload = request.data.get("obj", {})

        if not isinstance(payload, dict):
            raise PaymentProviderError("Invalid payload.", code="invalid_payload", http_status=400)

        if not paymob.verify_hmac(payload, received_hmac):
            raise PaymentProviderError("Invalid HMAC signature.", code="invalid_signature", http_status=400)

        paymob_tx_id = str(payload.get("id", "")).strip()
        order_payload = payload.get("order", {})
        merchant_order_id = order_payload.get("merchant_order_id", "") if isinstance(order_payload, dict) else ""
        if not merchant_order_id:
            raise PaymentProviderError("Missing merchant_order_id.", code="missing_order_id", http_status=400)

        success = bool(payload.get("success", False))
        pending = bool(payload.get("pending", False))
        error_occured = bool(payload.get("error_occured", False))

        if success and not pending and not error_occured:
            tx_status = PaymentTransaction.STATUS_PAID
        elif pending:
            tx_status = PaymentTransaction.STATUS_PENDING
        else:
            tx_status = PaymentTransaction.STATUS_FAILED

        return {
            "provider": self.key,
            "provider_reference": paymob_tx_id,
            "order_number": str(merchant_order_id),
            "status": tx_status,
            "raw_response": request.data,
        }

    def get_status(self, transaction):
        return {
            "provider": self.key,
            "provider_reference": transaction.provider_reference,
            "status": transaction.status,
            "supported": True,
        }

    def refund(self, transaction, amount):
        raise PaymentProviderNotImplementedError("Paymob refund flow is not enabled in this build.")


class PlaceholderPaymentProvider(BasePaymentProvider):
    def initiate_payment(self, order):
        self.check_configuration()
        raise PaymentProviderNotImplementedError(
            f"{self.key} is configured but integration is not implemented yet."
        )


class PaytabsPaymentProvider(BasePaymentProvider):
    key = PaymentTransaction.PROVIDER_PAYTABS

    def initiate_payment(self, order):
        try:
            data = paytabs.initiate_payment(order)
        except paytabs.PaytabsError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc
        data["provider"] = self.key
        data["provider_reference"] = str(data.get("provider_reference") or data.get("paytabs_tran_ref") or "")
        return data

    def verify_webhook(self, request):
        try:
            return paytabs.verify_webhook(request)
        except paytabs.PaytabsError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc

    def get_status(self, transaction):
        try:
            return paytabs.get_status(transaction)
        except paytabs.PaytabsError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc

    def refund(self, transaction, amount):
        try:
            return paytabs.refund(transaction, amount)
        except paytabs.PaytabsError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc


class HyperpayPaymentProvider(PlaceholderPaymentProvider):
    key = PaymentTransaction.PROVIDER_HYPERPAY
    required_settings = ("HYPERPAY_ENTITY_ID", "HYPERPAY_ACCESS_TOKEN")


class TelrPaymentProvider(PlaceholderPaymentProvider):
    key = PaymentTransaction.PROVIDER_TELR
    required_settings = ("TELR_STORE_ID", "TELR_AUTH_KEY")


class ThawaniPaymentProvider(BasePaymentProvider):
    key = PaymentTransaction.PROVIDER_THAWANI

    def initiate_payment(self, order):
        try:
            data = thawani.initiate_payment(order)
        except thawani.ThawaniError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc
        data["provider"] = self.key
        return data

    def verify_webhook(self, request):
        try:
            return thawani.verify_webhook(request)
        except thawani.ThawaniError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc

    def get_status(self, transaction):
        try:
            return thawani.get_status(transaction)
        except thawani.ThawaniError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc

    def refund(self, transaction, amount):
        try:
            return thawani.refund(transaction, amount)
        except thawani.ThawaniError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc


class OmannetPaymentProvider(BasePaymentProvider):
    key = PaymentTransaction.PROVIDER_OMANNET

    def initiate_payment(self, order):
        try:
            data = omannet.initiate_payment(order)
        except omannet.OmannetError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc
        data["provider"] = self.key
        return data

    def verify_webhook(self, request):
        try:
            return omannet.verify_webhook(request)
        except omannet.OmannetError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc

    def get_status(self, transaction):
        try:
            return omannet.get_status(transaction)
        except omannet.OmannetError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc

    def refund(self, transaction, amount):
        try:
            return omannet.refund(transaction, amount)
        except omannet.OmannetError as exc:
            raise PaymentProviderError(
                str(exc),
                code=getattr(exc, "code", "payment_provider_error"),
                http_status=getattr(exc, "http_status", 400),
            ) from exc


PROVIDER_REGISTRY = {
    PaymentTransaction.PROVIDER_PAYMOB: PaymobPaymentProvider(),
    PaymentTransaction.PROVIDER_PAYTABS: PaytabsPaymentProvider(),
    PaymentTransaction.PROVIDER_HYPERPAY: HyperpayPaymentProvider(),
    PaymentTransaction.PROVIDER_TELR: TelrPaymentProvider(),
    PaymentTransaction.PROVIDER_THAWANI: ThawaniPaymentProvider(),
    PaymentTransaction.PROVIDER_OMANNET: OmannetPaymentProvider(),
}


def _normalize_provider_key(provider):
    return str(provider or "").strip().lower()


def _normalize_enabled_providers(raw_value):
    if isinstance(raw_value, list):
        candidates = raw_value
    elif isinstance(raw_value, str):
        candidates = raw_value.split(",")
    else:
        candidates = []
    return [_normalize_provider_key(item) for item in candidates if _normalize_provider_key(item)]


def _get_provider_client(provider_key):
    provider = PROVIDER_REGISTRY.get(provider_key)
    if not provider:
        supported = ", ".join(sorted(PROVIDER_REGISTRY.keys()))
        raise PaymentProviderError(
            f"Unsupported payment provider '{provider_key}'. Supported: {supported}.",
            code="unsupported_provider",
            http_status=400,
        )
    return provider


def _resolve_order_provider_key(order, requested_provider=None):
    region = getattr(order, "region", None)
    enabled = _normalize_enabled_providers(
        getattr(region, "payment_enabled_providers", []) if region else []
    )
    default_provider = _normalize_provider_key(
        getattr(region, "default_payment_provider", "") if region else ""
    )

    requested_key = _normalize_provider_key(requested_provider)
    if requested_key == PaymentTransaction.PROVIDER_ONLINE:
        requested_key = ""

    provider_key = requested_key or default_provider or PaymentTransaction.PROVIDER_PAYMOB
    if not requested_key and enabled and provider_key not in enabled:
        provider_key = enabled[0]

    if enabled and provider_key not in enabled:
        raise PaymentProviderDisabledError(
            f"Payment provider '{provider_key}' is disabled for region '{region.code}'."
        )

    return provider_key


def _check_provider_configuration(provider_key, region=None):
    try:
        if provider_key == PaymentTransaction.PROVIDER_PAYMOB:
            PaymobPaymentProvider().check_configuration()
        elif provider_key == PaymentTransaction.PROVIDER_PAYTABS:
            region_code = getattr(region, "code", "")
            paytabs.get_region_config(region_code)
        elif provider_key == PaymentTransaction.PROVIDER_THAWANI:
            thawani.check_configuration()
        elif provider_key == PaymentTransaction.PROVIDER_OMANNET:
            omannet.check_configuration()
        else:
            _get_provider_client(provider_key).check_configuration()
        return True, ""
    except PaymentProviderError as exc:
        return False, str(exc)
    except paytabs.PaytabsError as exc:
        return False, str(exc)
    except thawani.ThawaniError as exc:
        return False, str(exc)
    except omannet.OmannetError as exc:
        return False, str(exc)


def get_region_provider_options(region):
    enabled = set(_normalize_enabled_providers(getattr(region, "payment_enabled_providers", [])))
    options = []
    for provider_key in PROVIDER_REGISTRY.keys():
        configured, warning = _check_provider_configuration(provider_key, region)
        is_enabled = provider_key in enabled
        options.append(
            {
                "key": provider_key,
                "label": PROVIDER_LABELS.get(provider_key, provider_key.title()),
                "enabled": is_enabled,
                "configured": configured,
                "available": is_enabled and configured,
                "warning": warning if is_enabled and not configured else "",
            }
        )
    return options


def get_region_provider_warnings(region):
    warnings = []
    for option in get_region_provider_options(region):
        if option["enabled"] and not option["configured"]:
            warnings.append(f"{option['label']}: {option['warning'] or 'Not configured.'}")
    return warnings


def initiate_payment(order, provider=None, *, payment_type=None):
    provider_key = _resolve_order_provider_key(order, provider)
    client = _get_provider_client(provider_key)
    if (
        payment_type == "apple_pay"
        and provider_key == PaymentTransaction.PROVIDER_PAYMOB
    ):
        from . import paymob as _paymob
        return _paymob.initiate_apple_pay_payment(order)
    return client.initiate_payment(order)


def verify_webhook(provider, request):
    provider_key = _normalize_provider_key(provider)
    client = _get_provider_client(provider_key)
    return client.verify_webhook(request)


def get_status(transaction):
    provider_key = _normalize_provider_key(transaction.provider)
    if provider_key in {
        PaymentTransaction.PROVIDER_COD,
        PaymentTransaction.PROVIDER_WHATSAPP,
        PaymentTransaction.PROVIDER_BANK_TRANSFER,
        PaymentTransaction.PROVIDER_ONLINE,
    }:
        return {
            "provider": provider_key,
            "provider_reference": transaction.provider_reference,
            "status": transaction.status,
            "supported": False,
        }
    client = _get_provider_client(provider_key)
    return client.get_status(transaction)


def refund(transaction, amount):
    provider_key = _normalize_provider_key(transaction.provider)
    if provider_key in {
        PaymentTransaction.PROVIDER_COD,
        PaymentTransaction.PROVIDER_WHATSAPP,
        PaymentTransaction.PROVIDER_BANK_TRANSFER,
        PaymentTransaction.PROVIDER_ONLINE,
    }:
        raise PaymentProviderNotImplementedError(f"Refund is not supported for '{provider_key}'.")
    client = _get_provider_client(provider_key)
    return client.refund(transaction, Decimal(amount))
