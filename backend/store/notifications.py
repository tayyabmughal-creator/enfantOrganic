import json
from urllib import request as urlrequest

from django.conf import settings

from .models import NotificationLog, PushDevice


def notify_admins_new_order(order):
    title = f"New order {order.order_number}"
    body = f"{order.customer_name} placed {order.grand_total} {order.currency_code} via {order.payment_method}."
    payload = {
        "event": NotificationLog.EVENT_NEW_ORDER,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "total_amount": str(order.grand_total),
        "currency_code": order.currency_code,
        "payment_method": order.payment_method,
    }
    return send_admin_push(NotificationLog.EVENT_NEW_ORDER, title, body, payload)


def notify_admins_paid_order(order):
    title = f"Paid order {order.order_number}"
    body = f"{order.customer_name} payment confirmed for {order.grand_total} {order.currency_code}."
    payload = {
        "event": NotificationLog.EVENT_PAID_ORDER,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "total_amount": str(order.grand_total),
        "currency_code": order.currency_code,
        "payment_method": order.payment_method,
    }
    return send_admin_push(NotificationLog.EVENT_PAID_ORDER, title, body, payload)


def notify_admins_payment_review(order):
    title = f"Payment review {order.order_number}"
    body = f"{order.customer_name} has a payment that needs review."
    payload = {
        "event": NotificationLog.EVENT_PAYMENT_REVIEW,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "total_amount": str(order.grand_total),
        "currency_code": order.currency_code,
        "payment_method": order.payment_method,
    }
    return send_admin_push(NotificationLog.EVENT_PAYMENT_REVIEW, title, body, payload)


def notify_admins_low_stock(product):
    title = f"Low stock: {product.name_en}"
    body = f"{product.name_en} has {product.stock_quantity} item(s) remaining."
    payload = {
        "event": NotificationLog.EVENT_LOW_STOCK,
        "product_slug": product.slug,
        "product_name": product.name_en,
        "stock_quantity": product.stock_quantity,
    }
    return send_admin_push(NotificationLog.EVENT_LOW_STOCK, title, body, payload)


def send_admin_push(event, title, body, payload):
    tokens = list(
        PushDevice.objects.filter(
            user__is_staff=True,
            is_active=True,
        ).values_list("token", flat=True)
    )

    if not tokens:
        return NotificationLog.objects.create(
            event=event,
            title=title,
            body=body,
            payload=payload,
            success=True,
        )

    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": payload,
        }
        for token in tokens
    ]

    try:
        data = json.dumps(messages).encode("utf-8")
        req = urlrequest.Request(
            settings.EXPO_PUSH_ENDPOINT,
            data=data,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlrequest.urlopen(req, timeout=5) as response:
            response_payload = json.loads(response.read().decode("utf-8") or "{}")
        return NotificationLog.objects.create(
            event=event,
            title=title,
            body=body,
            payload={**payload, "expo_response": response_payload},
            success=True,
        )
    except Exception as exc:
        return NotificationLog.objects.create(
            event=event,
            title=title,
            body=body,
            payload=payload,
            success=False,
            error_message=str(exc),
        )
