from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from ..serializers import CheckoutCreateSerializer, CouponValidationSerializer, OrderSerializer


def validation_error_message(error):
    detail = getattr(error, "detail", error)
    if isinstance(detail, dict):
        first_value = next(iter(detail.values()), "")
        if isinstance(first_value, list) and first_value:
            return str(first_value[0])
        return str(first_value)
    if isinstance(detail, list) and detail:
        return str(detail[0])
    return str(detail)


class CheckoutView(APIView):
    serializer_class = CheckoutCreateSerializer
    throttle_scope = "checkout"

    def post(self, request):
        serializer = CheckoutCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        # Expose the per-order lookup_token only on the just-placed order response
        # so the customer (especially a guest) can save it for later tracking.
        return Response(
            OrderSerializer(
                order,
                context={"request": request, "expose_lookup_token": True},
            ).data,
            status=201,
        )


class CouponValidationView(APIView):
    serializer_class = CouponValidationSerializer
    throttle_scope = "checkout"

    def post(self, request):
        serializer = CouponValidationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            return Response(serializer.evaluate())
        except serializers.ValidationError as error:
            return Response(
                {
                    "valid": False,
                    "discount_amount": "0.00",
                    "final_total": None,
                    "message": "",
                    "error": validation_error_message(error),
                }
            )
