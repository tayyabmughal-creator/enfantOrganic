import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.mail.message import make_msgid
from django.template import TemplateDoesNotExist
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.utils import timezone

from .models import Order, SiteSettings
from .services.invoice import ensure_paid_order_invoice, generate_order_invoice

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


def _support_email():
    """Monitored inbox customers can actually reach.

    DEFAULT_FROM_EMAIL is a send-only address on a domain with no mailbox, so
    replies to it bounce; SiteSettings.contact_email is the real inbox.
    """
    site_settings = SiteSettings.objects.only("contact_email").first()
    contact_email = str(getattr(site_settings, "contact_email", "") or "").strip()
    return contact_email or str(getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()


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
        "support_email": _support_email(),
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
        elif not order.invoice_pdf:
            generate_order_invoice(order)
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


def _message_id_domain():
    """Right-hand side for generated Message-IDs — the sending domain.

    Keeping it aligned with DEFAULT_FROM_EMAIL avoids handing receivers a
    Message-ID whose domain has nothing to do with the envelope sender.
    """
    from_email = str(getattr(settings, "DEFAULT_FROM_EMAIL", "") or "")
    _, _, domain = from_email.rpartition("@")
    domain = domain.strip().rstrip(">").strip()
    return domain or None


def _send_with_message_id(email):
    """Send and return the Message-ID we stamped, or "" when nothing was sent.

    The ID must be fixed *before* send(): Django mints a fresh one inside
    message() on every call, so reading it back afterwards would give us an ID
    the provider never saw. Brevo echoes this exact value in its webhook events,
    which is what lets a delivery receipt find its NotificationLog row later.
    """
    message_id = str(email.extra_headers.get("Message-ID") or "")
    if not message_id:
        message_id = make_msgid(domain=_message_id_domain())
        email.extra_headers["Message-ID"] = message_id
    return message_id if email.send(fail_silently=False) else ""


def send_transactional_order_email(order, template_key, *, extra_context=None, attach_invoice=False):
    """Returns the sent message's Message-ID (truthy) or "" — callers may bool() it."""
    if not order.customer_email:
        return ""

    locale = _locale(order)
    template_base = f"emails/{locale}/{template_key}"
    context = _render_context(order, locale, template_key, extra_context=extra_context)

    html_body = render_to_string(f"{template_base}.html", context)
    try:
        text_body = render_to_string(f"{template_base}.txt", context)
    except TemplateDoesNotExist:
        text_body = strip_tags(html_body)
    subject = _subject_for(template_key, locale, order)

    support_email = context.get("support_email", "")
    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@enfantorganics.com"),
        to=[order.customer_email],
        reply_to=[support_email] if support_email else None,
    )
    email.attach_alternative(html_body, "text/html")

    if attach_invoice:
        _attach_invoice_if_available(email, order)

    message_id = _send_with_message_id(email)
    if not message_id:
        logger.warning("Transactional email not sent for order %s (%s)", order.order_number, template_key)
    return message_id


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


def _whatsapp_click_to_chat_url(order):
    """wa.me link so staff can reply to the customer in one click.

    Every order carries a phone number (email is optional), so this is the most
    reliable way to reach the customer from the alert itself.
    """
    digits = "".join(ch for ch in str(order.customer_phone or "") if ch.isdigit())
    if not digits:
        return ""
    return f"https://wa.me/{digits}"


def _shipping_address_text(order):
    parts = [
        order.address_line_1,
        order.address_line_2,
        order.building,
        order.apartment,
        order.area,
        order.city,
        order.postcode,
        order.country,
    ]
    return "\n".join(str(part).strip() for part in parts if str(part or "").strip())


def send_admin_new_order_email(order, recipient):
    """Alert the store owner/staff inbox that a new order landed.

    Always English — this goes to staff, not the customer, so it deliberately
    ignores the order locale.
    """
    recipient = str(recipient or "").strip()
    if not recipient:
        return ""

    context = _render_context(order, "en", "admin_new_order")
    context.update(
        {
            "region_label": getattr(order.region, "name_en", "") or getattr(order.region, "code", "") or "—",
            "whatsapp_url": _whatsapp_click_to_chat_url(order),
            "shipping_address": _shipping_address_text(order),
            "admin_url": f"{getattr(settings, 'FRONTEND_PUBLIC_URL', '').rstrip('/')}/admin",
        }
    )

    html_body = render_to_string("emails/en/admin_new_order.html", context)
    subject = (
        f"New order {order.order_number} — {order.grand_total} {order.currency_code} "
        f"({order.customer_name})"
    )

    email = EmailMultiAlternatives(
        subject=subject,
        body=strip_tags(html_body),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@enfantorganics.com"),
        to=[recipient],
        reply_to=[order.customer_email] if order.customer_email else None,
    )
    email.attach_alternative(html_body, "text/html")

    message_id = _send_with_message_id(email)
    if not message_id:
        logger.warning("Admin new-order email not sent for order %s", order.order_number)
    return message_id


def send_order_status_update_email(order):
    template_key = STATUS_TEMPLATE_MAP.get(order.status, TEMPLATE_ORDER_UPDATE)
    attach_invoice = template_key == TEMPLATE_PAYMENT_PAID
    return send_transactional_order_email(
        order,
        template_key,
        attach_invoice=attach_invoice,
    )
