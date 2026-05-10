import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _build_items_text(order):
    lines = []
    for item in order.items.all():
        option = f" ({item.selected_options_text})" if item.selected_options_text else ""
        lines.append(
            f"  • {item.product_name}{option} × {item.quantity}  —  {item.line_total} {order.currency_code}"
        )
    return "\n".join(lines) or "  (no items)"


def send_order_confirmation_email(order):
    if not order.customer_email:
        return False

    items_text = _build_items_text(order)

    subject = f"Order Confirmed — {order.order_number} | Enfant Organics"

    message = (
        f"Hi {order.customer_name},\n\n"
        f"Thank you for shopping with Enfant Organics! Your order has been received.\n\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"Order number : {order.order_number}\n"
        f"Payment      : {order.get_payment_method_display()}\n"
        f"Status       : {order.get_status_display()}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"Items:\n{items_text}\n\n"
        f"Subtotal    : {order.subtotal} {order.currency_code}\n"
        f"Shipping    : {order.shipping_total} {order.currency_code}\n"
        f"Total       : {order.grand_total} {order.currency_code}\n\n"
        f"Delivery address:\n"
        f"  {order.address_line_1}"
        + (f", {order.address_line_2}" if order.address_line_2 else "")
        + f"\n"
        f"  {order.city}, {order.country}\n\n"
        f"You will receive an update once your order is dispatched.\n\n"
        f"Warm regards,\n"
        f"The Enfant Organics Team\n"
    )

    sent_count = send_mail(
        subject=subject,
        message=message,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@enfantorganics.com"),
        recipient_list=[order.customer_email],
        fail_silently=False,
    )

    if not sent_count:
        logger.warning("Order confirmation email not sent for order %s", order.order_number)

    return bool(sent_count)


def send_order_status_update_email(order):
    if not order.customer_email:
        return False

    subject = f"Order Update — {order.order_number} | Enfant Organics"

    message = (
        f"Hi {order.customer_name},\n\n"
        f"Your order {order.order_number} has been updated.\n\n"
        f"New status: {order.get_status_display()}\n"
    )

    if order.tracking_number:
        message += f"Tracking number: {order.tracking_number}\n"
    if order.tracking_url:
        message += f"Track your order: {order.tracking_url}\n"

    message += (
        f"\nThank you for choosing Enfant Organics.\n\n"
        f"The Enfant Organics Team\n"
    )

    sent_count = send_mail(
        subject=subject,
        message=message,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@enfantorganics.com"),
        recipient_list=[order.customer_email],
        fail_silently=False,
    )

    return bool(sent_count)
