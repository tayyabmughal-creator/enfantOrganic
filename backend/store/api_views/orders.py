from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Order
from ..serializers import GuestOrderLookupSerializer, OrderSerializer


def find_order_by_contact(order_number, email_or_phone):
    clean_contact = email_or_phone.strip()
    if not clean_contact:
        return None

    return (
        Order.objects.filter(order_number=order_number, customer_email__iexact=clean_contact).first()
        or Order.objects.filter(order_number=order_number, customer_phone=clean_contact).first()
    )


class OrderDetailView(APIView):
    serializer_class = OrderSerializer

    def get(self, request, order_number):
        order = find_order_by_contact(
            order_number,
            request.query_params.get("email_or_phone", ""),
        )
        if not order:
            return Response({"detail": "Order not found"}, status=404)
        order = (
            Order.objects.filter(pk=order.pk)
            .select_related("region")
            .prefetch_related("items", "transactions")
            .first()
        )
        return Response(OrderSerializer(order, context={"request": request}).data)


class GuestOrderLookupView(APIView):
    serializer_class = GuestOrderLookupSerializer

    def post(self, request):
        serializer = GuestOrderLookupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email_or_phone = serializer.validated_data["email_or_phone"].strip()
        order_number = serializer.validated_data["order_number"]
        order = find_order_by_contact(order_number, email_or_phone)
        if not order:
            return Response({"detail": "Order not found"}, status=404)
        return Response(OrderSerializer(order, context={"request": request}).data)
