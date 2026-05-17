import logging

from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services.whatsapp_cloud import (
    WhatsAppCloudError,
    handle_delivery_receipts,
    verify_webhook,
    verify_webhook_challenge,
)

logger = logging.getLogger(__name__)


class WhatsAppWebhookView(APIView):
    """
    WhatsApp Cloud API webhook endpoint.

    GET  -> verification challenge
    POST -> delivery receipt updates
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            challenge = verify_webhook_challenge(request.query_params)
        except WhatsAppCloudError as exc:
            logger.warning(
                "WhatsApp webhook verification rejected: %s (%s)",
                exc,
                getattr(exc, "code", "whatsapp_error"),
            )
            return Response(
                {"error": str(exc), "code": getattr(exc, "code", "whatsapp_error")},
                status=getattr(exc, "http_status", status.HTTP_400_BAD_REQUEST),
            )

        return HttpResponse(challenge, status=200, content_type="text/plain")

    def post(self, request):
        try:
            webhook_data = verify_webhook(request)
        except WhatsAppCloudError as exc:
            logger.warning(
                "WhatsApp webhook rejected: %s (%s)",
                exc,
                getattr(exc, "code", "whatsapp_error"),
            )
            return Response(
                {"error": str(exc), "code": getattr(exc, "code", "whatsapp_error")},
                status=getattr(exc, "http_status", status.HTTP_400_BAD_REQUEST),
            )
        except Exception:
            logger.exception("Unexpected WhatsApp webhook parsing error.")
            return Response(
                {"error": "Unexpected webhook processing error.", "code": "unexpected_error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            result = handle_delivery_receipts(
                webhook_data.get("receipts", []),
                payload=webhook_data.get("payload", {}),
            )
        except Exception:
            logger.exception("WhatsApp webhook receipt handling failed.")
            return Response(
                {"error": "Failed to process webhook receipts.", "code": "receipt_processing_failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "status": "ok",
                "processed_receipts": result.get("processed_receipts", 0),
            },
            status=status.HTTP_200_OK,
        )
