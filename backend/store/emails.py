import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def send_order_confirmation_email(order):
    if not order.customer_email:
        return False

    subject = f"Order confirmation - {order.order_number}"

    message = (
        f"Hi {order.customer_name},\n\n"
        f"Thank you for your order.\n\n"
        f"Order number: {order.order_number}\n"
        f"Status: {order.status}\n"
        f"Total: {order.grand_total} {order.currency_code}\n\n"
        f"We will contact you soon with updates.\n"
    )

    sent_count = send_mail(
        subject=subject,
        message=message,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@example.com"),
        recipient_list=[order.customer_email],
        fail_silently=False,
    )

    if not sent_count:
        logger.warning("Order confirmation email was not sent for order %s", order.order_number)

    return bool(sent_count)
