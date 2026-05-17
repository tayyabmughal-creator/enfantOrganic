from abc import ABC, abstractmethod

from django.conf import settings


class CarrierAdapterError(Exception):
    def __init__(self, message, *, code="carrier_error"):
        super().__init__(message)
        self.code = code


class CarrierAdapterConfigError(CarrierAdapterError):
    def __init__(self, message):
        super().__init__(message, code="carrier_config_missing")


class CarrierAdapterUnavailableError(CarrierAdapterError):
    def __init__(self, message):
        super().__init__(message, code="carrier_unavailable")


class CarrierAdapterNotImplementedError(CarrierAdapterError):
    def __init__(self, message):
        super().__init__(message, code="carrier_not_implemented")


class BaseCarrierAdapter(ABC):
    key = ""
    label = ""
    required_settings = ()

    def check_configuration(self):
        missing = [name for name in self.required_settings if not getattr(settings, name, "")]
        if missing:
            raise CarrierAdapterConfigError(
                f"{self.key} carrier is not configured. Missing settings: {', '.join(missing)}"
            )

    @abstractmethod
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
        raise NotImplementedError

    @abstractmethod
    def create_shipment(self, order):
        raise NotImplementedError

    @abstractmethod
    def get_tracking_url(self, tracking_number):
        raise NotImplementedError

    @abstractmethod
    def track_shipment(self, tracking_number):
        raise NotImplementedError
