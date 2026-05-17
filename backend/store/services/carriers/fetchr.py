from .base import BaseCarrierAdapter, CarrierAdapterNotImplementedError


class FetchrCarrierAdapter(BaseCarrierAdapter):
    key = "fetchr"
    label = "Fetchr"
    required_settings = (
        "FETCHR_API_KEY",
    )

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
        raise CarrierAdapterNotImplementedError(
            "Fetchr/equivalent adapter is scaffolded; rate API mapping pending provider contract."
        )

    def create_shipment(self, order):
        self.check_configuration()
        raise CarrierAdapterNotImplementedError(
            "Fetchr/equivalent adapter is scaffolded; shipment API mapping pending provider contract."
        )

    def get_tracking_url(self, tracking_number):
        return ""

    def track_shipment(self, tracking_number):
        self.check_configuration()
        raise CarrierAdapterNotImplementedError(
            "Fetchr/equivalent adapter is scaffolded; tracking API mapping pending provider contract."
        )
