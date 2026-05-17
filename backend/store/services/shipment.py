import logging

from django.utils import timezone

from ..emails import send_order_status_update_email
from ..models import NotificationLog, Order, Region
from . import carrier_router


logger = logging.getLogger(__name__)


AUTO_SHIPMENT_STATUSES = {
    Order.STATUS_PROCESSING,
    Order.STATUS_SHIPPED,
}


class ShipmentServiceError(Exception):
    def __init__(self, message, *, code="shipment_error"):
        super().__init__(message)
        self.code = code


def _normalize_key(value):
    return str(value or "").strip().lower()


def _status_from_tracking(raw_status):
    normalized = _normalize_key(raw_status)
    if not normalized:
        return Order.SHIPMENT_CREATED
    if normalized in {"delivered", "delivery_completed"}:
        return Order.SHIPMENT_DELIVERED
    if normalized in {"in_transit", "out_for_delivery", "picked_up", "shipped"}:
        return Order.SHIPMENT_IN_TRANSIT
    if normalized in {"failed", "cancelled", "exception"}:
        return Order.SHIPMENT_FAILED
    if normalized in {"manual_tracking", "tracking_unavailable_in_scaffold"}:
        return Order.SHIPMENT_MANUAL
    return Order.SHIPMENT_CREATED


def _resolve_carrier_key(order, override_key=""):
    preferred = _normalize_key(override_key)
    if preferred:
        return preferred

    if _normalize_key(order.carrier):
        return _normalize_key(order.carrier)

    region = getattr(order, "region", None)
    if region and getattr(region, "carrier_enabled", False):
        return _normalize_key(getattr(region, "primary_carrier", Region.CARRIER_MANUAL)) or Region.CARRIER_MANUAL

    return Region.CARRIER_MANUAL


def _build_tracking_message(order):
    lines = [
        f"Order: {order.order_number}",
        f"Shipment status: {order.shipment_status}",
    ]
    if order.tracking_number:
        lines.append(f"Tracking number: {order.tracking_number}")
    if order.tracking_url:
        lines.append(f"Track here: {order.tracking_url}")
    return "\n".join(lines)


def _log_customer_channel(order, channel, message, *, success, error_message=""):
    recipient = ""
    if channel == NotificationLog.CHANNEL_EMAIL:
        recipient = str(order.customer_email or "").strip().lower()
    elif channel == NotificationLog.CHANNEL_SMS:
        recipient = str(order.customer_phone or "").strip()
    elif channel == NotificationLog.CHANNEL_WHATSAPP:
        recipient = str(order.customer_phone or "").strip()

    status = NotificationLog.STATUS_SENT if success else NotificationLog.STATUS_FAILED
    payload = {
        "channel": channel,
        "order_number": order.order_number,
        "tracking_number": order.tracking_number,
        "tracking_url": order.tracking_url,
        "carrier": order.carrier,
        "locale": order.locale,
    }
    return NotificationLog.objects.create(
        channel=channel,
        event=NotificationLog.EVENT_SHIPMENT_UPDATE,
        recipient=recipient,
        status=status,
        provider="internal",
        order=order,
        title=f"Shipment update sent via {channel}",
        body=message,
        payload=payload,
        success=bool(success),
        error_message=error_message,
    )


def notify_customer_tracking_added(order):
    if not order.tracking_number and not order.tracking_url:
        return {"email": False, "sms": False, "whatsapp": False}

    message = _build_tracking_message(order)
    email_success = False
    email_error = ""
    try:
        email_success = bool(send_order_status_update_email(order))
    except Exception as exc:
        email_error = str(exc)
        logger.exception("Failed shipment email notification for order %s", order.order_number)

    _log_customer_channel(
        order,
        "email",
        message,
        success=email_success,
        error_message=email_error,
    )

    sms_error = "SMS provider is not configured yet; message logged for integration."
    _log_customer_channel(
        order,
        "sms",
        message,
        success=False,
        error_message=sms_error,
    )

    whatsapp_error = "WhatsApp provider is not configured yet; message logged for integration."
    _log_customer_channel(
        order,
        "whatsapp",
        message,
        success=False,
        error_message=whatsapp_error,
    )

    return {
        "email": email_success,
        "sms": False,
        "whatsapp": False,
    }


def should_auto_create_shipment(previous_status, new_status):
    if previous_status == new_status:
        return False
    return new_status in AUTO_SHIPMENT_STATUSES


def create_order_shipment(order, *, carrier_key="", force=False):
    carrier = _resolve_carrier_key(order, carrier_key)
    previous_tracking_number = order.tracking_number
    previous_tracking_url = order.tracking_url
    is_manual = carrier == Region.CARRIER_MANUAL

    if not force and (order.tracking_number or order.shipment_status in {Order.SHIPMENT_CREATED, Order.SHIPMENT_IN_TRANSIT, Order.SHIPMENT_DELIVERED}):
        return {
            "created": False,
            "carrier": carrier,
            "reason": "Shipment already exists for this order.",
            "shipment_status": order.shipment_status,
            "tracking_number": order.tracking_number,
            "tracking_url": order.tracking_url,
        }

    now = timezone.now()
    tracking_number = ""
    tracking_url = ""
    shipment_status = Order.SHIPMENT_CREATED

    if is_manual:
        shipment_status = Order.SHIPMENT_MANUAL
    else:
        try:
            response = carrier_router.create_shipment(order)
            tracking_number = str(response.get("tracking_number", "")).strip()
            tracking_url = str(response.get("tracking_url", "")).strip()
            if not tracking_url and tracking_number:
                tracking_url = carrier_router.get_tracking_url(carrier, tracking_number)
            shipment_status = _status_from_tracking(response.get("status"))
        except Exception as exc:
            logger.warning(
                "Carrier shipment creation failed for order=%s carrier=%s: %s",
                order.order_number,
                carrier,
                exc,
            )
            shipment_status = Order.SHIPMENT_MANUAL

    update_fields = ["carrier", "shipment_status", "updated_at"]
    order.carrier = carrier
    order.shipment_status = shipment_status
    if order.shipment_created_at is None:
        order.shipment_created_at = now
        update_fields.append("shipment_created_at")
    if tracking_number:
        order.tracking_number = tracking_number
        update_fields.append("tracking_number")
    if tracking_url:
        order.tracking_url = tracking_url
        update_fields.append("tracking_url")
    order.save(update_fields=update_fields)

    has_new_tracking = (
        bool(order.tracking_number or order.tracking_url)
        and (order.tracking_number != previous_tracking_number or order.tracking_url != previous_tracking_url)
    )
    notification_result = {}
    if has_new_tracking:
        notification_result = notify_customer_tracking_added(order)

    return {
        "created": True,
        "carrier": order.carrier,
        "shipment_status": order.shipment_status,
        "tracking_number": order.tracking_number,
        "tracking_url": order.tracking_url,
        "notification": notification_result,
    }


def update_manual_tracking(order, *, carrier="", tracking_number="", tracking_url="", shipment_status=""):
    normalized_tracking_number = str(tracking_number or "").strip()
    normalized_tracking_url = str(tracking_url or "").strip()
    if not normalized_tracking_number and not normalized_tracking_url:
        raise ShipmentServiceError(
            "Tracking number or tracking URL is required for manual shipment updates.",
            code="tracking_required",
        )

    selected_carrier = _resolve_carrier_key(order, carrier) or Region.CARRIER_MANUAL
    if not normalized_tracking_url and normalized_tracking_number:
        try:
            normalized_tracking_url = carrier_router.get_tracking_url(selected_carrier, normalized_tracking_number) or ""
        except Exception:
            normalized_tracking_url = ""

    previous_tracking_number = order.tracking_number
    previous_tracking_url = order.tracking_url

    order.carrier = selected_carrier
    order.tracking_number = normalized_tracking_number or order.tracking_number
    order.tracking_url = normalized_tracking_url or order.tracking_url
    order.shipment_status = _normalize_key(shipment_status) or Order.SHIPMENT_MANUAL
    if order.shipment_status not in {
        Order.SHIPMENT_PENDING,
        Order.SHIPMENT_CREATED,
        Order.SHIPMENT_IN_TRANSIT,
        Order.SHIPMENT_DELIVERED,
        Order.SHIPMENT_FAILED,
        Order.SHIPMENT_MANUAL,
    }:
        order.shipment_status = Order.SHIPMENT_MANUAL
    if order.shipment_created_at is None:
        order.shipment_created_at = timezone.now()

    order.save(
        update_fields=[
            "carrier",
            "tracking_number",
            "tracking_url",
            "shipment_status",
            "shipment_created_at",
            "updated_at",
        ]
    )

    has_new_tracking = (
        bool(order.tracking_number or order.tracking_url)
        and (order.tracking_number != previous_tracking_number or order.tracking_url != previous_tracking_url)
    )
    notification_result = {}
    if has_new_tracking:
        notification_result = notify_customer_tracking_added(order)

    return {
        "carrier": order.carrier,
        "shipment_status": order.shipment_status,
        "tracking_number": order.tracking_number,
        "tracking_url": order.tracking_url,
        "notification": notification_result,
    }


def refresh_order_tracking(order):
    if not order.tracking_number:
        raise ShipmentServiceError("Tracking number is not set for this order.", code="tracking_missing")

    carrier = _resolve_carrier_key(order)
    tracking_data = carrier_router.track_shipment(carrier, order.tracking_number)

    refreshed_tracking_url = str(tracking_data.get("tracking_url", "")).strip()
    if not refreshed_tracking_url:
        refreshed_tracking_url = carrier_router.get_tracking_url(carrier, order.tracking_number) or order.tracking_url

    order.carrier = carrier
    order.tracking_url = refreshed_tracking_url or order.tracking_url
    order.shipment_status = _status_from_tracking(tracking_data.get("status"))
    order.save(update_fields=["carrier", "tracking_url", "shipment_status", "updated_at"])

    return {
        "carrier": order.carrier,
        "shipment_status": order.shipment_status,
        "tracking_number": order.tracking_number,
        "tracking_url": order.tracking_url,
        "provider_status": tracking_data.get("status", ""),
        "provider_data": tracking_data,
    }
