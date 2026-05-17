from decimal import Decimal, InvalidOperation


SMS_TEMPLATES = {
    "order_created": {
        "en": "Enfant Organic: Order {order_number} is confirmed. Total {grand_total} {currency_code}.",
        "ar": "إنفانت أورجانيك: تم تأكيد طلبك {order_number}. الإجمالي {grand_total} {currency_code}.",
    },
    "order_shipped": {
        "en": "Enfant Organic: Order {order_number} has shipped. Track: {tracking_url}",
        "ar": "إنفانت أورجانيك: تم شحن طلبك {order_number}. التتبع: {tracking_url}",
    },
    "order_delivered": {
        "en": "Enfant Organic: Order {order_number} was delivered. Thank you for shopping with us.",
        "ar": "إنفانت أورجانيك: تم تسليم طلبك {order_number}. شكراً لتسوقك معنا.",
    },
    "refund_processed": {
        "en": "Enfant Organic: Refund processed for order {order_number}. Amount {refund_amount} {currency_code}.",
        "ar": "إنفانت أورجانيك: تم تنفيذ استرداد طلبك {order_number}. المبلغ {refund_amount} {currency_code}.",
    },
}


def _normalize_locale(locale):
    return "ar" if str(locale or "").strip().lower() == "ar" else "en"


def _format_amount(value):
    try:
        return str(Decimal(value).quantize(Decimal("0.01")))
    except (InvalidOperation, TypeError, ValueError):
        return "0.00"


def render_sms_template(event, *, order, locale="en"):
    templates = SMS_TEMPLATES.get(str(event or "").strip().lower())
    if not templates:
        return ""

    language = _normalize_locale(locale)
    template = templates.get(language) or templates.get("en") or ""
    if not template:
        return ""

    context = {
        "order_number": getattr(order, "order_number", ""),
        "customer_name": getattr(order, "customer_name", ""),
        "grand_total": _format_amount(getattr(order, "grand_total", 0)),
        "refund_amount": _format_amount(getattr(order, "refund_amount", 0)),
        "currency_code": getattr(order, "currency_code", ""),
        "tracking_number": getattr(order, "tracking_number", ""),
        "tracking_url": getattr(order, "tracking_url", "") or "",
    }
    message = template.format(**context)
    return " ".join(message.split())
