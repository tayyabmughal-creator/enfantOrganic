"""Abandoned-cart recovery helper.

A cart is only cleared ("recovered") by an order that genuinely CONVERTED: a paid
order, or an offline method (COD / WhatsApp / bank transfer) that counts as placed
on submit. An online order that is still UNPAID — the customer dropped off on the
hosted payment page — must NOT clear the cart, so the abandoned checkout stays
visible (Shopify parity). Called both at order creation (checkout serializer) and
when the payment webhook marks an online order paid.
"""
from django.db.models import Q
from django.utils import timezone

from ..models import AbandonedCart, Order


def order_converts(order) -> bool:
    """True when an order should clear a matching abandoned cart."""
    return (
        order.payment_method != Order.PAYMENT_ONLINE
        or order.payment_status == Order.PAYMENT_PAID
    )


def recover_carts_for_order(order) -> int:
    """Mark abandoned/contacted carts matching a converted order as recovered.

    Matches by conversion session token AND by email/phone (a customer may have
    abandoned on a different device/session). No-op for a non-converting order.
    Returns the number of carts updated.
    """
    if not order_converts(order):
        return 0

    match = Q()
    session_key = (getattr(order, "conversion_session_key", "") or "").strip()
    if session_key:
        match |= Q(session_token=session_key)
    if order.customer_email:
        match |= Q(customer_email=order.customer_email)
    if order.customer_phone:
        match |= Q(customer_phone=order.customer_phone)
    if not match:
        return 0

    return (
        AbandonedCart.objects.filter(
            status__in=[AbandonedCart.STATUS_ABANDONED, AbandonedCart.STATUS_CONTACTED]
        )
        .filter(match)
        .update(status=AbandonedCart.STATUS_RECOVERED, recovered_at=timezone.now())
    )
