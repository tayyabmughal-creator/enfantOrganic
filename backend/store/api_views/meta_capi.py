"""
Public relay endpoint for browser-originated Meta Conversions API events.

The storefront fires each funnel event twice: once through the Pixel and once
through here, both carrying the same ``event_id`` so Meta collapses them into a
single conversion. The server copy is what survives ad blockers and iOS
tracking prevention — the reason Events Manager reported zero CAPI coverage.

Identity that must not be client-supplied (IP address, user agent) is taken
from the request here; everything else is normalised and hashed downstream in
``services.meta_capi`` before it leaves the server. Raw email and phone are
never written to the database by this path.
"""

import logging

from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from ..services.meta_capi import (
    SUPPORTED_EVENTS,
    build_user_data,
    client_ip_from_request,
    get_capi_config,
)
from ..tasks import send_meta_capi_event_async

logger = logging.getLogger(__name__)

# Purchase is deliberately excluded: it is sent from the order record server-side
# so it cannot be forged or replayed by anyone hitting this open endpoint with a
# value of their choosing. Inflated Purchase volume would corrupt ad optimisation.
RELAYABLE_EVENTS = SUPPORTED_EVENTS - {"Purchase"}

MAX_CONTENT_IDS = 50


class OptionalJWTAuthentication(JWTAuthentication):
    """JWT that identifies the shopper when it can and stays quiet when it cannot.

    Access tokens live 15 minutes and the storefront keeps browsing with whatever
    is in storage, so a stale header is routine here. The default class answers
    401 to one, which on an endpoint that is otherwise open to guests would throw
    away the event instead of sending it anonymously — losing tracking for every
    signed-in shopper whose token had aged out.
    """

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except AuthenticationFailed:
            return None


class MetaCapiEventView(APIView):
    """
    POST /api/analytics/meta-event/

    Body: {
        event_name: "ViewContent" | "AddToCart" | "InitiateCheckout" | "AddPaymentInfo",
        event_id: "<same id the Pixel used>",
        event_source_url: "<window.location.href>",
        fbp / fbc: "<_fbp / _fbc cookie values>",
        external_id: "<storefront session id, used when the visitor is a guest>",
        user_data: { email, phone, first_name, last_name, city, postcode, country },
        custom_data: { currency, value, content_ids, contents, num_items },
    }

    Unauthenticated by design — guests generate most of the funnel. Throttled on
    the existing 'analytics' scope.
    """

    authentication_classes = [OptionalJWTAuthentication]
    permission_classes = [permissions.AllowAny]
    throttle_scope = "analytics"

    @extend_schema(responses=dict)
    def post(self, request):
        event_name = str(request.data.get("event_name") or "").strip()
        if event_name not in RELAYABLE_EVENTS:
            return Response(
                {"error": "Unsupported event_name."}, status=status.HTTP_400_BAD_REQUEST
            )

        event_id = str(request.data.get("event_id") or "").strip()[:128]
        if not event_id:
            # Without it Meta cannot pair this with the Pixel copy and would
            # count the same action twice.
            return Response(
                {"error": "event_id is required for deduplication."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Answer 200 with a no-op when CAPI is off so the storefront never sees
        # errors in the console for a feature the client has simply not enabled.
        if not get_capi_config()["enabled"]:
            return Response({"status": "disabled"}, status=status.HTTP_200_OK)

        raw_user = request.data.get("user_data")
        raw_user = raw_user if isinstance(raw_user, dict) else {}

        region_code = str(request.data.get("region_code") or "").strip().lower()

        # ViewContent and AddToCart fire long before checkout, so the browser has
        # no email to offer and Events Manager flagged the whole browse half of
        # the funnel as missing its highest-value match key. A signed-in shopper
        # is the exception: the account already holds a verified address, and
        # taking it from the session rather than the request body means it cannot
        # be spoofed through this open endpoint. Guests are unchanged.
        account_email = ""
        if request.user and request.user.is_authenticated:
            account_email = (getattr(request.user, "email", "") or "").strip()

        user_data = build_user_data(
            email=account_email or raw_user.get("email", ""),
            phone=raw_user.get("phone", ""),
            first_name=raw_user.get("first_name", ""),
            last_name=raw_user.get("last_name", ""),
            city=raw_user.get("city", ""),
            postcode=raw_user.get("postcode", ""),
            # Fall back to the storefront region. om/ae/sa are ISO 3166-1 alpha-2
            # codes, and a visitor on a regional store is in that market by
            # definition — so country is knowable on every event, including browse
            # events that have no checkout details yet. Events Manager asks
            # specifically for this class of key, which fbp and external_id alone
            # do not appear to satisfy.
            country=raw_user.get("country") or region_code,
            region_code=region_code,
            # A signed-in user is the stronger, non-forgeable identity, so it wins.
            # Otherwise fall back to the storefront's session id: Meta needs at
            # least one matching key or it drops the event for attribution, and on
            # browse events there is nothing else to offer. It is hashed downstream,
            # so the raw value never reaches Meta.
            external_id=(
                str(request.user.pk)
                if request.user and request.user.is_authenticated
                else str(request.data.get("external_id") or "").strip()[:128]
            ),
            fbp=str(request.data.get("fbp") or "").strip()[:128],
            fbc=str(request.data.get("fbc") or "").strip()[:255],
            client_ip=client_ip_from_request(request)[:45],
            client_user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
        )

        payload = {
            "event_name": event_name,
            "event_id": event_id,
            "user_data": user_data,
            "custom_data": self._clean_custom_data(request.data.get("custom_data")),
            # Passed through untouched: the storefront geo-redirects to om./ae./
            # sa. subdomains, so rebuilding a canonical URL here would no longer
            # match what the Pixel reported.
            "event_source_url": str(request.data.get("event_source_url") or "").strip()[:500],
        }

        try:
            send_meta_capi_event_async.delay(payload)
        except Exception:
            # A broker outage must not surface as a checkout error.
            logger.exception("Could not enqueue Meta CAPI event %s", event_id)
            return Response({"status": "queue_unavailable"}, status=status.HTTP_202_ACCEPTED)

        return Response({"status": "queued"}, status=status.HTTP_202_ACCEPTED)

    @staticmethod
    def _clean_custom_data(raw):
        """
        Whitelist the commerce fields Meta understands.

        Anything else is dropped rather than forwarded — this endpoint is open,
        and unbounded client-controlled JSON has no business reaching a
        third-party API or our logs.
        """
        if not isinstance(raw, dict):
            return {}

        cleaned = {}
        currency = str(raw.get("currency") or "").strip().upper()[:3]
        if currency:
            cleaned["currency"] = currency
        for key in ("value", "num_items"):
            try:
                if raw.get(key) is not None:
                    cleaned[key] = float(raw[key])
            except (TypeError, ValueError):
                continue
        if isinstance(raw.get("content_ids"), list):
            ids = [str(item).strip()[:120] for item in raw["content_ids"][:MAX_CONTENT_IDS]]
            cleaned["content_ids"] = [item for item in ids if item]
            cleaned["content_type"] = "product"
        if isinstance(raw.get("contents"), list):
            contents = []
            for item in raw["contents"][:MAX_CONTENT_IDS]:
                if not isinstance(item, dict):
                    continue
                entry = {"id": str(item.get("id") or "").strip()[:120]}
                if not entry["id"]:
                    continue
                try:
                    entry["quantity"] = int(item.get("quantity") or 1)
                    entry["item_price"] = float(item.get("item_price") or 0)
                except (TypeError, ValueError):
                    entry["quantity"] = 1
                contents.append(entry)
            if contents:
                cleaned["contents"] = contents
        content_name = str(raw.get("content_name") or "").strip()[:200]
        if content_name:
            cleaned["content_name"] = content_name
        return cleaned
