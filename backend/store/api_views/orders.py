import secrets

from django.http import FileResponse
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ..models import Order
from ..serializers import GuestOrderLookupSerializer, OrderSerializer
from ..services.invoice import ensure_paid_order_invoice

ORDER_NOT_FOUND_DETAIL = "Order not found"


class OrderLookupThrottleMixin:
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "order_lookup"


def _match_by_token(order_number, token):
    if not token:
        return None
    order = Order.objects.filter(order_number=order_number).only("id", "lookup_token").first()
    if not order or not order.lookup_token:
        return None
    if not secrets.compare_digest(str(token), str(order.lookup_token)):
        return None
    return order


def _match_by_contact(order_number, email_or_phone):
    clean_contact = (email_or_phone or "").strip()
    if not clean_contact:
        return None
    return (
        Order.objects.filter(order_number=order_number, customer_email__iexact=clean_contact).first()
        or Order.objects.filter(order_number=order_number, customer_phone=clean_contact).first()
    )


def find_order_for_guest(order_number, *, lookup_token="", email_or_phone=""):
    """Resolve an order for a guest lookup.

    Preference order:
      1. Unguessable per-order lookup_token (sent in order confirmation email).
      2. order_number + matching customer_email or customer_phone (legacy fallback,
         retained for older orders predating the token field).
    """
    order = _match_by_token(order_number, lookup_token)
    if order is not None:
        return order
    return _match_by_contact(order_number, email_or_phone)


# Kept for backwards compatibility with any external callers — delegates to the new helper.
def find_order_by_contact(order_number, email_or_phone):
    return _match_by_contact(order_number, email_or_phone)


def _hydrate_for_response(order):
    return (
        Order.objects.filter(pk=order.pk)
        .select_related("region")
        .prefetch_related("items", "transactions", "status_history__actor", "return_requests__reviewed_by")
        .first()
    )


class OrderDetailView(OrderLookupThrottleMixin, APIView):
    serializer_class = OrderSerializer

    def get(self, request, order_number):
        order = find_order_for_guest(
            order_number,
            lookup_token=request.query_params.get("lookup_token", ""),
            email_or_phone=request.query_params.get("email_or_phone", ""),
        )
        if not order:
            return Response({"detail": ORDER_NOT_FOUND_DETAIL}, status=404)
        order = _hydrate_for_response(order)
        return Response(OrderSerializer(order, context={"request": request}).data)


class GuestOrderLookupView(OrderLookupThrottleMixin, APIView):
    serializer_class = GuestOrderLookupSerializer

    def post(self, request):
        serializer = GuestOrderLookupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = find_order_for_guest(
            serializer.validated_data["order_number"],
            lookup_token=serializer.validated_data.get("lookup_token", ""),
            email_or_phone=serializer.validated_data.get("email_or_phone", ""),
        )
        if not order:
            return Response({"detail": ORDER_NOT_FOUND_DETAIL}, status=404)
        order = _hydrate_for_response(order)
        return Response(OrderSerializer(order, context={"request": request}).data)


class OrderInvoiceDownloadView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, order_number):
        order = (
            Order.objects.filter(order_number=order_number)
            .select_related("region")
            .prefetch_related("items")
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=404)

        token = request.query_params.get("token", "")
        is_owner = bool(
            request.user.is_authenticated
            and order.user_id
            and order.user_id == request.user.pk
        )

        if not is_owner:
            if not token or not order.invoice_access_token:
                return Response({"detail": "Invoice token is required."}, status=403)
            if not secrets.compare_digest(token, order.invoice_access_token):
                return Response({"detail": "Invalid invoice token."}, status=403)

        if order.payment_status != Order.PAYMENT_PAID:
            return Response({"detail": "Invoice is available after payment confirmation."}, status=400)

        order = ensure_paid_order_invoice(order)
        if not order.invoice_pdf:
            return Response({"detail": "Invoice is not available yet."}, status=404)

        order.invoice_pdf.open("rb")
        filename = f"{order.invoice_number or order.order_number}.pdf"
        return FileResponse(order.invoice_pdf, as_attachment=True, filename=filename)
