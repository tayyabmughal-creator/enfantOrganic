import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template import TemplateDoesNotExist
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.utils import timezone

from .models import Order
from .services.invoice import ensure_paid_order_invoice

logger = logging.getLogger(__name__)


TEMPLATE_ORDER_CONFIRMED = "order_confirmed"
TEMPLATE_PAYMENT_PAID = "payment_paid"
TEMPLATE_ORDER_SHIPPED = "order_shipped"
TEMPLATE_ORDER_DELIVERED = "order_delivered"
TEMPLATE_ORDER_CANCELLED = "order_cancelled"
TEMPLATE_REFUND_PROCESSED = "refund_processed"
TEMPLATE_REVIEW_REQUEST = "review_request"
TEMPLATE_RETURN_REQUESTED = "return_requested"
TEMPLATE_ORDER_UPDATE = "order_update"


STATUS_TEMPLATE_MAP = {
    Order.STATUS_PAID: TEMPLATE_PAYMENT_PAID,
    Order.STATUS_SHIPPED: TEMPLATE_ORDER_SHIPPED,
    Order.STATUS_DELIVERED: TEMPLATE_ORDER_DELIVERED,
    Order.STATUS_CANCELLED: TEMPLATE_ORDER_CANCELLED,
    Order.STATUS_REFUNDED: TEMPLATE_REFUND_PROCESSED,
}


SUBJECTS = {
    TEMPLATE_ORDER_CONFIRMED: {
        "en": "Order Confirmed — {order_number} | Enfant Organics",
        "ar": "تأكيد الطلب — {order_number} | Enfant Organics",
    },
    TEMPLATE_PAYMENT_PAID: {
        "en": "Payment Confirmed — {order_number} | Enfant Organics",
        "ar": "تأكيد الدفع — {order_number} | Enfant Organics",
    },
    TEMPLATE_ORDER_SHIPPED: {
        "en": "Order Shipped — {order_number} | Enfant Organics",
        "ar": "تم شحن الطلب — {order_number} | Enfant Organics",
    },
    TEMPLATE_ORDER_DELIVERED: {
        "en": "Order Delivered — {order_number} | Enfant Organics",
        "ar": "تم تسليم الطلب — {order_number} | Enfant Organics",
    },
    TEMPLATE_ORDER_CANCELLED: {
        "en": "Order Cancelled — {order_number} | Enfant Organics",
        "ar": "تم إلغاء الطلب — {order_number} | Enfant Organics",
    },
    TEMPLATE_REFUND_PROCESSED: {
        "en": "Refund Processed — {order_number} | Enfant Organics",
        "ar": "تمت معالجة الاسترداد — {order_number} | Enfant Organics",
    },
    TEMPLATE_REVIEW_REQUEST: {
        "en": "How Was Your Order? — {order_number} | Enfant Organics",
        "ar": "شاركينا رأيك — {order_number} | Enfant Organics",
    },
    TEMPLATE_RETURN_REQUESTED: {
        "en": "Return Request Received — {order_number} | Enfant Organics",
        "ar": "تم استلام طلب الإرجاع — {order_number} | Enfant Organics",
    },
    TEMPLATE_ORDER_UPDATE: {
        "en": "Order Update — {order_number} | Enfant Organics",
        "ar": "تحديث الطلب — {order_number} | Enfant Organics",
    },
}


def _locale(order):
    value = str(getattr(order, "locale", "en") or "en").strip().lower()
    return "ar" if value == "ar" else "en"


def _is_rtl(locale):
    return locale == "ar"


def _order_items(order):
    items = []
    for item in order.items.all():
        items.append(
            {
                "name": item.product_name,
                "options_text": item.selected_options_text or "",
                "quantity": item.quantity,
                "line_total": item.line_total,
            }
        )
    return items


def _tracking_url(order, locale):
    """Build a tracking link the customer can click without logging in.

    Includes the order's unguessable lookup_token so the page can fetch the
    order without asking for email/phone (and without being enumerable).
    """
    base = getattr(settings, "FRONTEND_PUBLIC_URL", "").rstrip("/")
    if not base:
        return ""
    token = order.lookup_token or order.ensure_lookup_token()
    locale_seg = "ar" if locale == "ar" else "en"
    return (
        f"{base}/{locale_seg}/track-order"
        f"?o={order.order_number}&t={token}"
    )


def _render_context(order, locale, template_key, extra_context=None):
    tax_label = order.tax_label or "VAT"
    status_label = Order.get_status_label(order.status, locale=locale)
    context = {
        "order": order,
        "template_key": template_key,
        "locale": locale,
        "lang_code": "ar" if locale == "ar" else "en",
        "direction": "rtl" if _is_rtl(locale) else "ltr",
        "status_label": status_label,
        "items": _order_items(order),
        "tax_label": tax_label,
        "site_name": "Enfant Organics",
        "support_email": getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@enfantorganics.com"),
        "current_year": timezone.now().year,
        "tracking_url": _tracking_url(order, locale),
    }
    if extra_context:
        context.update(extra_context)
    return context


def _subject_for(template_key, locale, order):
    locale_subjects = SUBJECTS.get(template_key, SUBJECTS[TEMPLATE_ORDER_UPDATE])
    pattern = locale_subjects.get(locale, locale_subjects["en"])
    return pattern.format(order_number=order.order_number).replace("\n", " ").strip()


def _attach_invoice_if_available(email, order):
    try:
        if order.payment_status == Order.PAYMENT_PAID:
            ensure_paid_order_invoice(order)
        if not order.invoice_pdf:
            return
        order.invoice_pdf.open("rb")
        try:
            email.attach(
                f"{order.invoice_number or order.order_number}.pdf",
                order.invoice_pdf.read(),
                "application/pdf",
            )
        finally:
            order.invoice_pdf.close()
    except Exception:
        logger.exception("Failed to attach invoice PDF for order %s", order.order_number)


def send_transactional_order_email(order, template_key, *, extra_context=None, attach_invoice=False):
    if not order.customer_email:
        return False

    locale = _locale(order)
    template_base = f"emails/{locale}/{template_key}"
    context = _render_context(order, locale, template_key, extra_context=extra_context)

    html_body = render_to_string(f"{template_base}.html", context)
    try:
        text_body = render_to_string(f"{template_base}.txt", context)
    except TemplateDoesNotExist:
        text_body = strip_tags(html_body)
    subject = _subject_for(template_key, locale, order)

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@enfantorganics.com"),
        to=[order.customer_email],
    )
    email.attach_alternative(html_body, "text/html")

    if attach_invoice:
        _attach_invoice_if_available(email, order)

    sent_count = email.send(fail_silently=False)
    if not sent_count:
        logger.warning("Transactional email not sent for order %s (%s)", order.order_number, template_key)
    return bool(sent_count)


def send_order_confirmation_email(order):
    return send_transactional_order_email(
        order,
        TEMPLATE_ORDER_CONFIRMED,
        attach_invoice=True,
    )


def send_payment_paid_email(order):
    return send_transactional_order_email(
        order,
        TEMPLATE_PAYMENT_PAID,
        attach_invoice=True,
    )


def send_order_status_update_email(order):
    template_key = STATUS_TEMPLATE_MAP.get(order.status, TEMPLATE_ORDER_UPDATE)
    attach_invoice = template_key == TEMPLATE_PAYMENT_PAID
    return send_transactional_order_email(
        order,
        template_key,
        attach_invoice=attach_invoice,
    )
