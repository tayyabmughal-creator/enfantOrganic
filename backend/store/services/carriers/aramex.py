from decimal import Decimal, ROUND_HALF_UP
import re

from django.conf import settings

from .base import (
    BaseCarrierAdapter,
    CarrierAdapterConfigError,
    CarrierAdapterNotImplementedError,
)


MONEY_QUANTIZER = Decimal("0.01")


def _quantize_money(value):
    return Decimal(value).quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)


class AramexCarrierAdapter(BaseCarrierAdapter):
    key = "aramex"
    label = "Aramex"
    required_settings = (
        "ARAMEX_USERNAME",
        "ARAMEX_PASSWORD",
        "ARAMEX_ACCOUNT_NUMBER",
        "ARAMEX_ACCOUNT_PIN",
    )

    def _is_real_api_enabled(self):
        raw = str(getattr(settings, "ARAMEX_ENABLE_REAL_API", "0")).strip().lower()
        return raw in {"1", "true", "yes", "on"}

    def get_rate(
        self,
        *,
        region,
        subtotal,
        city="",
        area="",
        country="",
        address_line_1="",
        postcode="",
    ):
        self.check_configuration()

        if not self._is_real_api_enabled():
            base_shipping = _quantize_money(getattr(region, "shipping_fee", Decimal("0.00")) or Decimal("0.00"))
            return {
                "carrier_key": self.key,
                "carrier_name": self.label,
                "shipping_fee": base_shipping,
                "eta_min_days": 2,
                "eta_max_days": 4,
                "service_name": "Aramex Standard (scaffold)",
                "raw_response": {"mode": "scaffold"},
            }

        raise CarrierAdapterNotImplementedError(
            "Aramex live API mode is not implemented in this scaffold yet."
        )

    def create_shipment(self, order):
        self.check_configuration()
        if not self._is_real_api_enabled():
            raw_order_number = getattr(order, "order_number", "") or "ORDER"
            normalized_order_number = re.sub(r"[^A-Za-z0-9]", "", str(raw_order_number).upper())[-16:] or "ORDER"
            tracking_number = f"ARX-{normalized_order_number}"
            return {
                "carrier_key": self.key,
                "carrier_name": self.label,
                "tracking_number": tracking_number,
                "tracking_url": self.get_tracking_url(tracking_number),
                "status": "created",
                "supported": True,
                "raw_response": {"mode": "scaffold"},
            }
        raise CarrierAdapterNotImplementedError(
            "Aramex shipment creation is not implemented in this scaffold yet."
        )

    def get_tracking_url(self, tracking_number):
        if not tracking_number:
            return ""
        base = str(getattr(settings, "ARAMEX_TRACKING_BASE_URL", "https://www.aramex.com/us/en/track/results")).strip()
        if not base:
            return ""
        return f"{base}?ShipmentNumber={tracking_number}"

    def track_shipment(self, tracking_number):
        if not tracking_number:
            raise CarrierAdapterConfigError("Tracking number is required.")
        if not self._is_real_api_enabled():
            return {
                "carrier_key": self.key,
                "carrier_name": self.label,
                "tracking_number": tracking_number,
                "tracking_url": self.get_tracking_url(tracking_number),
                "status": "tracking_unavailable_in_scaffold",
                "supported": False,
            }
        raise CarrierAdapterNotImplementedError(
            "Aramex tracking API is not implemented in this scaffold yet."
        )
