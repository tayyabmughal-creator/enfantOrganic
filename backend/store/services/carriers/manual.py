from decimal import Decimal, ROUND_HALF_UP

from .base import BaseCarrierAdapter


MONEY_QUANTIZER = Decimal("0.01")


def _quantize_money(value):
    return Decimal(value).quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)


class ManualCarrierAdapter(BaseCarrierAdapter):
    key = "manual"
    label = "Manual"
    required_settings = ()

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
        shipping_fee = _quantize_money(getattr(region, "shipping_fee", Decimal("0.00")) or Decimal("0.00"))
        return {
            "carrier_key": self.key,
            "carrier_name": self.label,
            "shipping_fee": shipping_fee,
            "eta_min_days": None,
            "eta_max_days": None,
            "service_name": "Manual shipping",
            "raw_response": {"mode": "manual"},
        }

    def create_shipment(self, order):
        return {
            "carrier_key": self.key,
            "carrier_name": self.label,
            "supported": False,
            "message": "Manual carrier does not create shipment automatically.",
        }

    def get_tracking_url(self, tracking_number):
        return ""

    def track_shipment(self, tracking_number):
        return {
            "carrier_key": self.key,
            "carrier_name": self.label,
            "tracking_number": tracking_number,
            "status": "manual_tracking",
            "supported": False,
        }
