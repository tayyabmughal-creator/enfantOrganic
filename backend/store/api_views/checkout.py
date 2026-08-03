import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_ipv46_address
from django.db import transaction
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from ..serializers import (
    CheckoutCreateSerializer,
    CouponValidationSerializer,
    GiftCardValidationSerializer,
    OrderSerializer,
)

logger = logging.getLogger(__name__)


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


def _capture_meta_capi_context(order, request):
    """
    Persist the Meta identity signals for this checkout, then queue the Purchase.

    Done in the view rather than the serializer because the useful values only
    exist on the HTTP request: fbp/fbc are browser cookies the storefront
    forwards, while IP and user agent are read from the request itself and never
    trusted from the request body.

    Everything here is best-effort. A tracking failure must never cost the
    customer their order, so the whole block is swallowed on error — the order
    is already committed by this point.
    """
    try:
        from ..services.meta_capi import client_ip_from_request, enqueue_purchase_event

        order.meta_fbp = str(request.data.get("meta_fbp") or "").strip()[:128]
        order.meta_fbc = str(request.data.get("meta_fbc") or "").strip()[:255]
        order.meta_event_source_url = str(
            request.data.get("meta_event_source_url") or ""
        ).strip()[:500]
        order.meta_client_user_agent = request.META.get("HTTP_USER_AGENT", "")[:500]

        client_ip = client_ip_from_request(request)[:45]
        # A malformed forwarded header would raise on save; the rest of the
        # context is still worth keeping.
        try:
            validate_ipv46_address(client_ip)
            order.meta_client_ip = client_ip
        except DjangoValidationError:
            order.meta_client_ip = None

        order.save(
            update_fields=[
                "meta_fbp",
                "meta_fbc",
                "meta_event_source_url",
                "meta_client_user_agent",
                "meta_client_ip",
            ]
        )
        # on_commit so the worker cannot read the order before this transaction
        # lands — Celery is fast enough to lose that race.
        transaction.on_commit(lambda: enqueue_purchase_event(order))
    except Exception:
        logger.exception("Meta CAPI context capture failed for order=%s", order.pk)


class CheckoutView(APIView):
    serializer_class = CheckoutCreateSerializer
    throttle_scope = "checkout"

    @transaction.atomic
    def post(self, request):
        serializer = CheckoutCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        _capture_meta_capi_context(order, request)
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
                    "gift_card_amount": "0.00",
                    "gift_card_balance": "0.00",
                    "discount_amount": "0.00",
                    "final_total": None,
                    "message": "",
                    "error": validation_error_message(error),
                }
            )


class GiftCardValidationView(APIView):
    serializer_class = GiftCardValidationSerializer
    throttle_scope = "checkout"

    def post(self, request):
        serializer = GiftCardValidationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            return Response(serializer.evaluate())
        except serializers.ValidationError as error:
            return Response(
                {
                    "valid": False,
                    "gift_card_amount": "0.00",
                    "gift_card_balance": "0.00",
                    "discount_amount": "0.00",
                    "final_total": None,
                    "message": "",
                    "error": validation_error_message(error),
                }
            )
