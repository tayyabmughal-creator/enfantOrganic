"""
Payment API views — provider-based payment integration.

Endpoints:
  POST /api/payments/initiate/   → route to configured provider and initiate payment
  POST /api/payments/webhook/    → Paymob transaction callback, verifies signature, updates order
  GET  /api/payments/status/<order_number>/  → lightweight payment status poll
"""
import logging

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Order, PaymentTransaction
from ..services.invoice import ensure_paid_order_invoice
from ..services.payment_router import (
    PaymentProviderError,
    get_status as get_provider_status,
    initiate_payment,
    verify_webhook,
)

logger = logging.getLogger(__name__)


def _apply_webhook_update(provider_key, request, *, ignore_missing_order=False):
    try:
        webhook_data = verify_webhook(provider_key, request)
    except PaymentProviderError as exc:
        if ignore_missing_order and getattr(exc, "code", "") == "missing_order_id":
            logger.warning("%s webhook missing order identifier.", provider_key)
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)
        logger.warning("%s webhook rejected: %s (%s)", provider_key, exc, getattr(exc, "code", "provider_error"))
        return Response(
            {"error": str(exc), "code": getattr(exc, "code", "provider_error")},
            status=getattr(exc, "http_status", status.HTTP_400_BAD_REQUEST),
        )

    merchant_order_id = webhook_data["order_number"]
    provider_reference = webhook_data["provider_reference"] or "unknown"
    tx_status = webhook_data["status"]

    try:
        order = Order.objects.select_for_update().get(order_number=merchant_order_id)
    except Order.DoesNotExist:
        logger.error("%s webhook: order %s not found.", provider_key, merchant_order_id)
        return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

    # Idempotency: skip if we already recorded this exact provider transaction as final.
    if PaymentTransaction.objects.filter(
        provider=provider_key,
        provider_reference=provider_reference,
        status__in=[
            PaymentTransaction.STATUS_PAID,
            PaymentTransaction.STATUS_FAILED,
            PaymentTransaction.STATUS_REFUNDED,
            PaymentTransaction.STATUS_CANCELLED,
        ],
    ).exists():
        logger.info("%s webhook: transaction %s already processed.", provider_key, provider_reference)
        return Response({"status": "already_processed"}, status=status.HTTP_200_OK)

    webhook_note = f"Payment webhook update from {provider_key} ({tx_status})."
    payment_changed = False
    if tx_status == PaymentTransaction.STATUS_PAID:
        if order.payment_status != Order.PAYMENT_PAID:
            order.payment_status = Order.PAYMENT_PAID
            payment_changed = True
        if order.status in {Order.STATUS_PENDING, Order.STATUS_CONFIRMED, Order.STATUS_FAILED}:
            if order.can_transition_to(Order.STATUS_PAID):
                order.transition_to(Order.STATUS_PAID, note=webhook_note)
    elif tx_status == PaymentTransaction.STATUS_REFUNDED:
        if order.payment_status != Order.PAYMENT_REFUNDED:
            order.payment_status = Order.PAYMENT_REFUNDED
            payment_changed = True
        if order.can_transition_to(Order.STATUS_REFUNDED):
            order.transition_to(Order.STATUS_REFUNDED, note=webhook_note)
    elif tx_status in {PaymentTransaction.STATUS_FAILED, PaymentTransaction.STATUS_CANCELLED}:
        if order.can_transition_to(Order.STATUS_FAILED):
            order.transition_to(Order.STATUS_FAILED, note=webhook_note)

    PaymentTransaction.objects.update_or_create(
        order=order,
        provider=provider_key,
        provider_reference=provider_reference,
        defaults={
            "amount": order.grand_total,
            "currency_code": order.currency_code,
            "status": tx_status,
            "raw_response": webhook_data.get("raw_response", request.data),
        },
    )

    if payment_changed:
        order.save(update_fields=["payment_status", "updated_at"])
    if order.payment_status == Order.PAYMENT_PAID:
        from ..tasks import generate_order_invoice_async
        generate_order_invoice_async.delay(order.id)
    elif tx_status in {
        PaymentTransaction.STATUS_REFUNDED,
        PaymentTransaction.STATUS_FAILED,
        PaymentTransaction.STATUS_CANCELLED,
    }:
        try:
            order.restore_inventory()
        except Exception:
            logger.exception(
                "Inventory restore failed after %s webhook for order %s",
                provider_key,
                merchant_order_id,
            )

    logger.info(
        "%s webhook processed: order=%s tx=%s status=%s",
        provider_key,
        merchant_order_id,
        provider_reference,
        tx_status,
    )

    return Response({"status": "ok"}, status=status.HTTP_200_OK)


def _initiate_payment_response(request, *, is_retry=False):
    order_number = request.data.get("order_number", "").strip()
    if not order_number:
        return Response({"error": "order_number is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        order = Order.objects.get(order_number=order_number)
    except Order.DoesNotExist:
        return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

    # Ownership check: authenticated users can only initiate for their own orders.
    if order.user_id and request.user.is_authenticated and order.user_id != request.user.pk:
        return Response({"error": "Unauthorized."}, status=status.HTTP_403_FORBIDDEN)

    if order.payment_method != Order.PAYMENT_ONLINE:
        return Response(
            {"error": "This order is not configured for online payment."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if order.payment_status == Order.PAYMENT_PAID:
        return Response({"error": "This order is already paid."}, status=status.HTTP_400_BAD_REQUEST)

    if order.status == Order.STATUS_CANCELLED:
        return Response({"error": "Cannot initiate payment for a cancelled order."}, status=status.HTTP_400_BAD_REQUEST)

    if is_retry and order.status == Order.STATUS_FAILED and order.can_transition_to(Order.STATUS_PENDING):
        order.transition_to(Order.STATUS_PENDING, note="Payment retry initiated.")

    requested_provider = request.data.get("provider")
    payment_type = str(request.data.get("payment_type", "")).strip().lower()
    try:
        result = initiate_payment(order, requested_provider, payment_type=payment_type)
    except PaymentProviderError as exc:
        logger.error(
            "Payment initiation failed for order %s: %s (%s)",
            order_number,
            exc,
            getattr(exc, "code", "provider_error"),
        )
        return Response(
            {"error": str(exc), "code": getattr(exc, "code", "provider_error")},
            status=getattr(exc, "http_status", status.HTTP_400_BAD_REQUEST),
        )
    except Exception:
        logger.exception("Unexpected error during payment initiation for order %s", order_number)
        return Response(
            {"error": "An unexpected error occurred. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    provider_key = result.get("provider") or str(requested_provider or "").strip().lower() or PaymentTransaction.PROVIDER_PAYMOB
    provider_reference = (
        str(result.get("provider_reference", "")).strip()
        or str(result.get("paymob_order_id", "")).strip()
        or order.order_number
    )

    PaymentTransaction.objects.update_or_create(
        order=order,
        provider=provider_key,
        provider_reference=provider_reference,
        defaults={
            "amount": order.grand_total,
            "currency_code": order.currency_code,
            "status": PaymentTransaction.STATUS_PENDING,
            "raw_response": result,
        },
    )

    return Response(result, status=status.HTTP_200_OK)


class PaymentInitiateView(APIView):
    """
    Initiate an online payment for an existing order.

    Request:  POST { "order_number": "EO-20260509-0001" }
    Response: { "payment_key": "...", "iframe_url": "...", "paymob_order_id": "..." }
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "payment"

    def post(self, request):
        return _initiate_payment_response(request)


class PaymentRetryView(APIView):
    """
    Retry an online payment after a failed or abandoned attempt.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "payment"

    def post(self, request):
        return _initiate_payment_response(request, is_retry=True)


class PaymobWebhookView(APIView):
    """
    Receive Paymob transaction callbacks (webhook / HMAC-protected).

    Paymob sends:
      POST /api/payments/webhook/?hmac=<sha512>
      Body: { "type": "TRANSACTION", "obj": { ... transaction fields ... } }

    We verify the HMAC, update the PaymentTransaction and Order accordingly.
    Idempotent: duplicate callbacks for the same Paymob transaction ID are ignored.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "webhook"

    def post(self, request):
        return _apply_webhook_update(
            PaymentTransaction.PROVIDER_PAYMOB,
            request,
            ignore_missing_order=True,
        )


class PaytabsWebhookView(APIView):
    """
    Receive PayTabs callback/IPN notifications.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "webhook"

    def post(self, request):
        return _apply_webhook_update(PaymentTransaction.PROVIDER_PAYTABS, request)


class ThawaniWebhookView(APIView):
    """
    Receive Thawani webhook notifications.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "webhook"

    def post(self, request):
        return _apply_webhook_update(PaymentTransaction.PROVIDER_THAWANI, request)


class OmannetWebhookView(APIView):
    """
    Receive OmanNet webhook notifications.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "webhook"

    def post(self, request):
        return _apply_webhook_update(PaymentTransaction.PROVIDER_OMANNET, request)


class PaymentStatusView(APIView):
    """
    Lightweight payment status poll for the frontend.

    GET /api/payments/status/<order_number>/
    Returns: { "order_number", "payment_status", "status" }
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "payment"

    def get(self, request, order_number):
        try:
            order = Order.objects.select_related("region").get(order_number=order_number)
        except Order.DoesNotExist:
            return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        # Ownership check for authenticated users.
        if order.user_id and request.user.is_authenticated and order.user_id != request.user.pk:
            return Response({"error": "Unauthorized."}, status=status.HTTP_403_FORBIDDEN)

        latest_tx = (
            PaymentTransaction.objects.filter(order=order)
            .exclude(provider=PaymentTransaction.PROVIDER_ONLINE)
            .order_by("-updated_at", "-id")
            .first()
        ) or (
            PaymentTransaction.objects.filter(order=order).order_by("-updated_at", "-id").first()
        )

        provider_status = None
        if latest_tx:
            try:
                provider_status = get_provider_status(latest_tx)
            except PaymentProviderError as exc:
                provider_status = {
                    "provider": latest_tx.provider,
                    "provider_reference": latest_tx.provider_reference,
                    "status": latest_tx.status,
                    "supported": False,
                    "error": str(exc),
                    "code": getattr(exc, "code", "provider_error"),
                }

        return Response(
            {
                "order_number": order.order_number,
                "payment_status": order.payment_status,
                "status": order.status,
                "transaction": {
                    "provider": latest_tx.provider,
                    "provider_reference": latest_tx.provider_reference,
                    "status": latest_tx.status,
                }
                if latest_tx
                else None,
                "provider_status": provider_status,
            },
            status=status.HTTP_200_OK,
        )
