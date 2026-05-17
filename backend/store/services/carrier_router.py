"""
Carrier router and provider abstraction.

Stable interface:
    - get_rate(...)
    - create_shipment(order)
    - get_tracking_url(provider, tracking_number)
    - track_shipment(provider, tracking_number)
"""
import logging

from ..models import Region
from .carriers import (
    AramexCarrierAdapter,
    CarrierAdapterConfigError,
    CarrierAdapterError,
    CarrierAdapterNotImplementedError,
    FetchrCarrierAdapter,
    ManualCarrierAdapter,
    SmsaCarrierAdapter,
)


logger = logging.getLogger(__name__)


PROVIDER_REGISTRY = {
    Region.CARRIER_MANUAL: ManualCarrierAdapter(),
    Region.CARRIER_ARAMEX: AramexCarrierAdapter(),
    Region.CARRIER_SMSA: SmsaCarrierAdapter(),
    Region.CARRIER_FETCHR: FetchrCarrierAdapter(),
}

PROVIDER_LABELS = {
    Region.CARRIER_MANUAL: "Manual",
    Region.CARRIER_ARAMEX: "Aramex",
    Region.CARRIER_SMSA: "SMSA",
    Region.CARRIER_FETCHR: "Fetchr/Equivalent",
}


class CarrierRouterError(Exception):
    def __init__(self, message, *, code="carrier_router_error"):
        super().__init__(message)
        self.code = code


class CarrierRouterConfigError(CarrierRouterError):
    def __init__(self, message):
        super().__init__(message, code="carrier_config_missing")


class CarrierRouterDisabledError(CarrierRouterError):
    def __init__(self, message):
        super().__init__(message, code="carrier_disabled")


def _normalize_key(value):
    return str(value or "").strip().lower()


def _get_provider(key):
    provider_key = _normalize_key(key)
    provider = PROVIDER_REGISTRY.get(provider_key)
    if not provider:
        raise CarrierRouterConfigError(f"Unsupported carrier provider '{provider_key}'.")
    return provider


def _candidate_provider_keys(region):
    if not region:
        return []

    primary = _normalize_key(getattr(region, "primary_carrier", Region.CARRIER_MANUAL))
    fallback = _normalize_key(getattr(region, "fallback_carrier", Region.CARRIER_MANUAL))
    keys = [primary]
    if fallback and fallback not in keys:
        keys.append(fallback)
    return [key for key in keys if key]


def _check_provider_configuration(provider_key):
    provider = _get_provider(provider_key)
    try:
        provider.check_configuration()
        return True, ""
    except CarrierAdapterError as exc:
        return False, str(exc)


def get_region_carrier_options(region):
    enabled = bool(getattr(region, "carrier_enabled", False))
    configured_keys = _candidate_provider_keys(region)
    options = []
    for key in PROVIDER_REGISTRY.keys():
        is_selected = key in configured_keys
        is_active_path = enabled and is_selected
        configured, warning = _check_provider_configuration(key) if is_active_path else (True, "")
        options.append(
            {
                "key": key,
                "label": PROVIDER_LABELS.get(key, key.title()),
                "selected": is_selected,
                "enabled": enabled,
                "configured": configured,
                "available": (enabled and configured and is_selected) or key == Region.CARRIER_MANUAL,
                "warning": warning if is_active_path and not configured else "",
            }
        )
    return options


def get_region_carrier_warnings(region):
    warnings = []
    if not getattr(region, "carrier_enabled", False):
        return warnings
    for option in get_region_carrier_options(region):
        if option["selected"] and not option["configured"]:
            warnings.append(f"{option['label']}: {option['warning'] or 'Not configured.'}")
    return warnings


def get_rate(
    *,
    region,
    subtotal,
    city="",
    area="",
    country="",
    address_line_1="",
    postcode="",
):
    if not region or not getattr(region, "carrier_enabled", False):
        raise CarrierRouterDisabledError("Carrier quotes are disabled for this region.")

    failures = []
    for provider_key in _candidate_provider_keys(region):
        provider = _get_provider(provider_key)
        try:
            quote = provider.get_rate(
                region=region,
                subtotal=subtotal,
                city=city,
                area=area,
                country=country,
                address_line_1=address_line_1,
                postcode=postcode,
            )
            if quote:
                return quote
        except (CarrierAdapterConfigError, CarrierAdapterNotImplementedError, CarrierAdapterError) as exc:
            failures.append((provider_key, str(exc), getattr(exc, "code", "carrier_error")))
            logger.warning(
                "Carrier rate failed for region=%s provider=%s: %s",
                getattr(region, "code", "unknown"),
                provider_key,
                exc,
            )

    if failures:
        provider_list = ", ".join([item[0] for item in failures])
        raise CarrierRouterConfigError(
            f"Carrier quote unavailable. Checked providers: {provider_list}."
        )
    raise CarrierRouterConfigError("Carrier quote unavailable: no provider candidates configured.")


def create_shipment(order):
    region = getattr(order, "region", None)
    if not region:
        raise CarrierRouterConfigError("Order has no region.")

    provider_key = _normalize_key(getattr(region, "primary_carrier", Region.CARRIER_MANUAL))
    provider = _get_provider(provider_key)
    return provider.create_shipment(order)


def get_tracking_url(provider_key, tracking_number):
    provider = _get_provider(provider_key)
    return provider.get_tracking_url(tracking_number)


def track_shipment(provider_key, tracking_number):
    provider = _get_provider(provider_key)
    return provider.track_shipment(tracking_number)
