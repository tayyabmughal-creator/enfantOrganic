"""
Payment API views — Paymob integration.

Endpoints:
  POST /api/payments/initiate/   → auth, create Paymob order, get payment key → return iframe URL
  POST /api/payments/webhook/    → Paymob transaction callback, verifies HMAC, updates order
  GET  /api/payments/status/<order_number>/  → lightweight payment status poll
"""
import logging

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Order, PaymentTransaction
from ..services.paymob import PaymobError, initiate_payment, verify_hmac

logger = logging.getLogger(__name__)


class PaymentInitiateView(APIView):
    """
    Initiate an online payment for an existing order.

    Request:  POST { "order_number": "EO-20260509-0001" }
    Response: { "payment_key": "...", "iframe_url": "...", "paymob_order_id": "..." }
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
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

        try:
            result = initiate_payment(order)
        except PaymobError as exc:
            logger.error("Paymob initiation failed for order %s: %s", order_number, exc)
            return Response(
                {"error": "Payment gateway error. Please try again or contact support."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            logger.exception("Unexpected error during payment initiation for order %s", order_number)
            return Response(
                {"error": "An unexpected error occurred. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Record a pending Paymob transaction for this initiation.
        PaymentTransaction.objects.get_or_create(
            order=order,
            provider=PaymentTransaction.PROVIDER_PAYMOB,
            provider_reference=result["paymob_order_id"],
            defaults={
                "amount": order.grand_total,
                "currency_code": order.currency_code,
                "status": PaymentTransaction.STATUS_PENDING,
                "raw_response": {"paymob_order_id": result["paymob_order_id"]},
            },
        )

        return Response(result, status=status.HTTP_200_OK)


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

    def post(self, request):
        received_hmac = request.query_params.get("hmac", "")
        obj = request.data.get("obj", {})

        if not isinstance(obj, dict):
            return Response({"error": "Invalid payload."}, status=status.HTTP_400_BAD_REQUEST)

        if not verify_hmac(obj, received_hmac):
            logger.warning("Paymob webhook HMAC verification failed.")
            return Response({"error": "Invalid HMAC signature."}, status=status.HTTP_400_BAD_REQUEST)

        paymob_tx_id = str(obj.get("id", ""))
        success = bool(obj.get("success", False))
        pending = bool(obj.get("pending", False))
        error_occured = bool(obj.get("error_occured", False))

        # Paymob wraps the local order number in obj.order.merchant_order_id
        paymob_order = obj.get("order", {})
        merchant_order_id = (
            paymob_order.get("merchant_order_id", "")
            if isinstance(paymob_order, dict)
            else ""
        )

        if not merchant_order_id:
            logger.warning("Paymob webhook missing merchant_order_id.")
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)

        try:
            order = Order.objects.select_for_update().get(order_number=merchant_order_id)
        except Order.DoesNotExist:
            logger.error("Paymob webhook: order %s not found.", merchant_order_id)
            return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        # Idempotency: skip if we already recorded this exact Paymob transaction.
        if PaymentTransaction.objects.filter(
            provider=PaymentTransaction.PROVIDER_PAYMOB,
            provider_reference=paymob_tx_id,
            status__in=[PaymentTransaction.STATUS_PAID, PaymentTransaction.STATUS_FAILED],
        ).exists():
            logger.info("Paymob webhook: transaction %s already processed.", paymob_tx_id)
            return Response({"status": "already_processed"}, status=status.HTTP_200_OK)

        # Determine new status.
        if success and not pending and not error_occured:
            tx_status = PaymentTransaction.STATUS_PAID
            order.payment_status = Order.PAYMENT_PAID
            if order.status == Order.STATUS_PENDING:
                order.status = Order.STATUS_CONFIRMED
        elif pending:
            tx_status = PaymentTransaction.STATUS_PENDING
        else:
            tx_status = PaymentTransaction.STATUS_FAILED

        # Create or update the PaymentTransaction record.
        PaymentTransaction.objects.update_or_create(
            order=order,
            provider=PaymentTransaction.PROVIDER_PAYMOB,
            provider_reference=paymob_tx_id,
            defaults={
                "amount": order.grand_total,
                "currency_code": order.currency_code,
                "status": tx_status,
                "raw_response": request.data,
            },
        )

        order.save(update_fields=["payment_status", "status", "updated_at"])

        logger.info(
            "Paymob webhook processed: order=%s tx=%s status=%s",
            merchant_order_id,
            paymob_tx_id,
            tx_status,
        )

        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class PaymentStatusView(APIView):
    """
    Lightweight payment status poll for the frontend.

    GET /api/payments/status/<order_number>/
    Returns: { "order_number", "payment_status", "status" }
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request, order_number):
        try:
            order = Order.objects.only(
                "order_number", "payment_status", "status"
            ).get(order_number=order_number)
        except Order.DoesNotExist:
            return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        # Ownership check for authenticated users.
        if order.user_id and request.user.is_authenticated and order.user_id != request.user.pk:
            return Response({"error": "Unauthorized."}, status=status.HTTP_403_FORBIDDEN)

        return Response(
            {
                "order_number": order.order_number,
                "payment_status": order.payment_status,
                "status": order.status,
            },
            status=status.HTTP_200_OK,
        )
