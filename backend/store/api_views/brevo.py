import logging

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services.brevo import BrevoWebhookError, handle_email_events, verify_webhook

logger = logging.getLogger(__name__)


class BrevoWebhookView(APIView):
    """Brevo transactional-email webhook — delivery receipts.

    Turns NotificationLog rows from "we handed it to the relay" into what
    actually happened (delivered / bounced / blocked / spam).
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            events = verify_webhook(request)
        except BrevoWebhookError as exc:
            logger.warning("Brevo webhook rejected: %s (%s)", exc, exc.code)
            return Response({"error": str(exc), "code": exc.code}, status=exc.http_status)
        except Exception:
            logger.exception("Unexpected Brevo webhook parsing error.")
            return Response(
                {"error": "Unexpected webhook processing error.", "code": "unexpected_error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            result = handle_email_events(events)
        except Exception:
            logger.exception("Brevo webhook event handling failed.")
            return Response(
                {"error": "Failed to process webhook events.", "code": "event_processing_failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"status": "ok", **result}, status=status.HTTP_200_OK)
