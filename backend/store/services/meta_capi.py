"""
Meta Conversions API — server-side event delivery.

Why this exists: the browser Pixel alone loses a large share of events to ad
blockers, iOS tracking prevention and Safari's cookie lifetime caps. Meta's own
Events Manager diagnostics for this dataset (2026-08-02) flagged both problems
we have: no manual advanced matching, and zero Pixel events covered by the
Conversions API. Every event in Test Events read "Received From: Browser".

Two rules govern everything below.

1. Deduplication. Each event carries the *same* ``event_id`` the browser Pixel
   sent, so Meta collapses the browser and server copies into one conversion.
   Get this wrong and every purchase is counted twice, which does not merely
   inflate a report — it trains Meta's optimiser on fabricated volume. Callers
   must reuse the Pixel's ID (Purchase uses ``purchase-{order_number}``), never
   generate a fresh one here.

2. Hashing. Meta matches users on SHA-256 of *normalised* values. The
   normalisation rules are not cosmetic: an unstripped space or a leftover "+"
   on a phone number produces a valid-looking hash that matches nobody, and the
   failure is silent — the API still answers ``events_received: 1``. That is
   why ``_hash`` is only ever reached through the per-field normalisers.

The storefront geo-redirects to om./ae./sa. subdomains, so ``event_source_url``
is always passed through verbatim from the browser rather than rebuilt from a
canonical host; a mismatched URL weakens Meta's confidence in the dedup pair.
"""

import hashlib
import logging
import re
from datetime import timedelta

import requests
from django.conf import settings as django_settings
from django.utils import timezone

from ..models import MetaCapiEvent, SiteSettings
from .sms_router import _normalize_phone

logger = logging.getLogger(__name__)

DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0"
REQUEST_TIMEOUT_SECONDS = 10

# Standard events we relay. Anything outside this set is rejected rather than
# forwarded: a typo'd event name is accepted by Meta as a custom event, where it
# silently fails to feed the standard-event optimisation the ads rely on.
SUPPORTED_EVENTS = frozenset(
    {
        "ViewContent",
        "AddToCart",
        "InitiateCheckout",
        "AddPaymentInfo",
        "Purchase",
    }
)

# Meta rejects events older than 7 days. We stop a day early so a task that sat
# in a backed-up queue fails loudly here instead of being silently dropped.
MAX_EVENT_AGE = timedelta(days=6)


class MetaCapiConfigError(Exception):
    """Raised when CAPI is not configured well enough to send anything."""


def _hash(value):
    """SHA-256 hex digest. Only call via the normalisers above — never raw."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _norm_email(value):
    email = str(value or "").strip().lower()
    # A bare "@" check is enough here; the field is already validated on input
    # and we would rather send a slightly odd address than drop a match.
    return _hash(email) if "@" in email else ""


def _norm_phone(value, region_code=""):
    # Meta wants digits only, including country code, with no "+" or separators.
    e164 = _normalize_phone(value, region_code)
    digits = re.sub(r"\D", "", e164)
    # Anything shorter than this cannot carry a country code plus a subscriber
    # number, so it would hash to a guaranteed non-match.
    return _hash(digits) if len(digits) >= 8 else ""


def _norm_name(value):
    # Lowercase, letters only. Meta strips punctuation, digits and whitespace,
    # so "Al-Balushi" and "al balushi" must produce the same hash.
    name = re.sub(r"[^a-z؀-ۿ]", "", str(value or "").strip().lower())
    return _hash(name) if name else ""


def _norm_city(value):
    city = re.sub(r"[^a-z؀-ۿ]", "", str(value or "").strip().lower())
    return _hash(city) if city else ""


def _norm_zip(value):
    zip_code = re.sub(r"[^a-z0-9]", "", str(value or "").strip().lower())
    return _hash(zip_code) if zip_code else ""


def _norm_country(value):
    """Meta wants a lowercase ISO 3166-1 alpha-2 code, not a country name."""
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    code = COUNTRY_NAME_TO_ISO.get(raw, raw if len(raw) == 2 else "")
    return _hash(code) if code else ""


# Order.country stores a display name typed at checkout, not a code. Only the
# markets the store actually ships to are listed; an unmapped country yields no
# hash rather than a wrong one, which costs one match field instead of poisoning
# the signal.
COUNTRY_NAME_TO_ISO = {
    "oman": "om",
    "sultanate of oman": "om",
    "united arab emirates": "ae",
    "uae": "ae",
    "saudi arabia": "sa",
    "kingdom of saudi arabia": "sa",
    "ksa": "sa",
    "kuwait": "kw",
    "qatar": "qa",
    "bahrain": "bh",
}


def get_capi_config():
    """
    Resolve CAPI credentials: admin settings first, environment as fallback.

    The admin panel wins so the client can rotate the token or change the test
    event code without a redeploy — Meta reissues the test code every time the
    Test Events tab is opened, so a hardcoded one is stale within the hour.
    """
    site = SiteSettings.objects.first()

    def _pick(field, env_name):
        value = str(getattr(site, field, "") or "").strip() if site else ""
        return value or str(getattr(django_settings, env_name, "") or "").strip()

    token = _pick("meta_capi_access_token", "META_CAPI_ACCESS_TOKEN")
    dataset_id = _pick("meta_capi_dataset_id", "META_CAPI_DATASET_ID")
    if not dataset_id and site:
        # The dataset is the pixel unless Meta split them, so default to it
        # rather than making the client copy the same number into two fields.
        dataset_id = str(site.facebook_pixel_id or "").strip()

    enabled = bool(getattr(site, "meta_capi_enabled", False)) if site else False
    if not site:
        enabled = bool(getattr(django_settings, "META_CAPI_ENABLED", False))

    return {
        "enabled": enabled and bool(token) and bool(dataset_id),
        "access_token": token,
        "dataset_id": dataset_id,
        "test_event_code": _pick("meta_capi_test_event_code", "META_CAPI_TEST_EVENT_CODE"),
    }


def build_user_data(
    *,
    email="",
    phone="",
    first_name="",
    last_name="",
    city="",
    postcode="",
    country="",
    region_code="",
    external_id="",
    fbp="",
    fbc="",
    client_ip="",
    client_user_agent="",
):
    """
    Assemble Meta's ``user_data`` block, dropping every field we cannot fill.

    Empty keys are omitted rather than sent blank: Meta counts a present-but-
    empty field against match quality, and the Events Manager warning the client
    reported ("Set up manual advanced matching") is driven by exactly that score.

    ``fbp``/``fbc`` are the highest-value identifiers here — they tie the event
    to the very click that Meta already attributed — which is why the storefront
    reads them from cookies and forwards them explicitly.
    """
    data = {
        "em": _norm_email(email),
        "ph": _norm_phone(phone, region_code),
        "fn": _norm_name(first_name),
        "ln": _norm_name(last_name),
        "ct": _norm_city(city),
        "zp": _norm_zip(postcode),
        "country": _norm_country(country),
        "external_id": _hash(str(external_id).strip().lower()) if external_id else "",
    }
    # Meta expects single hashed values as one-element arrays.
    user_data = {key: [value] for key, value in data.items() if value}

    # Not hashed — Meta matches these verbatim.
    if fbp:
        user_data["fbp"] = str(fbp)
    if fbc:
        user_data["fbc"] = str(fbc)
    if client_ip:
        user_data["client_ip_address"] = str(client_ip)
    if client_user_agent:
        user_data["client_user_agent"] = str(client_user_agent)

    return user_data


def split_name(full_name):
    """Order stores one ``customer_name``; Meta matches on fn/ln separately."""
    parts = [part for part in str(full_name or "").strip().split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def send_event(
    *,
    event_name,
    event_id,
    user_data,
    custom_data=None,
    event_source_url="",
    event_time=None,
    order=None,
    action_source="website",
):
    """
    Deliver one event and record the outcome in ``MetaCapiEvent``.

    Returns the log row. Never raises for delivery problems — a tracking outage
    must not break checkout — but configuration mistakes are logged loudly
    because they are silent otherwise: Meta answers 200 to a well-formed event
    that matches nobody.
    """
    if event_name not in SUPPORTED_EVENTS:
        raise ValueError(f"Unsupported Meta CAPI event: {event_name!r}")
    if not event_id:
        raise ValueError("event_id is required — it is the deduplication key")

    config = get_capi_config()

    # get_or_create is the duplicate guard. The unique constraint on event_id
    # means a retried task, a refreshed thank-you page and a replayed payment
    # webhook all land on the same row instead of sending the event again.
    log, created = MetaCapiEvent.objects.get_or_create(
        event_id=event_id,
        defaults={
            "event_name": event_name,
            "order": order,
            "event_source_url": event_source_url[:500],
            "test_event_code": config["test_event_code"][:50],
        },
    )
    if not created and log.status == MetaCapiEvent.STATUS_SENT:
        logger.info("Meta CAPI event %s already sent — skipping duplicate", event_id)
        return log

    if not config["enabled"]:
        log.status = MetaCapiEvent.STATUS_SKIPPED
        log.error_message = "Meta CAPI is disabled or missing token/dataset ID"
        log.save(update_fields=["status", "error_message"])
        return log

    event_time = event_time or timezone.now()
    if timezone.now() - event_time > MAX_EVENT_AGE:
        log.status = MetaCapiEvent.STATUS_SKIPPED
        log.error_message = f"Event older than {MAX_EVENT_AGE.days} days — Meta would reject it"
        log.save(update_fields=["status", "error_message"])
        logger.warning("Dropping stale Meta CAPI event %s (%s)", event_id, event_time)
        return log

    # Count only the hashed identity fields; IP and user agent are always
    # present and would flatter the score without improving matching.
    log.match_field_count = sum(
        1 for key in user_data if key not in {"client_ip_address", "client_user_agent"}
    )

    event = {
        "event_name": event_name,
        "event_time": int(event_time.timestamp()),
        "event_id": event_id,
        "action_source": action_source,
        "user_data": user_data,
    }
    if event_source_url:
        event["event_source_url"] = event_source_url
    if custom_data:
        event["custom_data"] = custom_data

    payload = {"data": [event], "access_token": config["access_token"]}
    if config["test_event_code"]:
        payload["test_event_code"] = config["test_event_code"]

    url = f"{_graph_base_url()}/{config['dataset_id']}/events"
    log.attempts += 1

    try:
        response = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
        log.response_body = response.text[:2000]
        if response.ok:
            log.status = MetaCapiEvent.STATUS_SENT
            log.sent_at = timezone.now()
            log.error_message = ""
        else:
            log.status = MetaCapiEvent.STATUS_FAILED
            log.error_message = f"HTTP {response.status_code}"
            logger.error(
                "Meta CAPI rejected %s (%s): HTTP %s %s",
                event_name,
                event_id,
                response.status_code,
                response.text[:500],
            )
    except requests.RequestException as exc:
        log.status = MetaCapiEvent.STATUS_FAILED
        log.error_message = str(exc)[:500]
        logger.warning("Meta CAPI request failed for %s (%s): %s", event_name, event_id, exc)

    log.save()
    return log


def purchase_event_id(order):
    """
    The dedup key, mirroring ``PurchaseEventTracker``'s ``purchase-{number}``.

    Both sides must derive this the same way from the same value or Meta counts
    the browser and server copies as two separate purchases.
    """
    return f"purchase-{order.order_number}"


# Mirrors PURCHASE_BLOCKED_* in frontend/lib/analytics.js. If these two lists
# drift apart the browser and server stop agreeing on which orders are real
# conversions, and Meta ends up with an unpaired event it counts on its own.
PURCHASE_BLOCKED_ORDER_STATUSES = frozenset({"cancelled", "failed", "returned", "refunded"})
PURCHASE_BLOCKED_PAYMENT_STATUSES = frozenset({"failed", "refunded"})


def should_send_purchase(order):
    """
    Whether this order counts as a conversion right now.

    Two rules, both matching the storefront:

    - Never for an order in an explicit failure state.
    - For online payments, only once the money has actually arrived. The order
      row exists from the moment checkout is submitted, but the customer may
      still abandon or be declined at the provider — firing then would report
      purchases that never happened. COD and bank-transfer orders are
      legitimately unpaid at this point and do count.
    """
    if str(order.status or "").lower() in PURCHASE_BLOCKED_ORDER_STATUSES:
        return False
    if str(order.payment_status or "").lower() in PURCHASE_BLOCKED_PAYMENT_STATUSES:
        return False
    if order.payment_method == order.PAYMENT_ONLINE:
        return order.payment_status == order.PAYMENT_PAID
    return True


def enqueue_purchase_event(order):
    """
    Queue the server-side Purchase if the order qualifies.

    Safe to call from several places — order creation and the payment webhook
    both do — because the unique ``event_id`` makes a second delivery
    impossible.
    """
    if not should_send_purchase(order):
        return False

    from ..tasks import send_meta_purchase_event_async

    try:
        send_meta_purchase_event_async.delay(order.pk)
        return True
    except Exception:
        # A broker outage must never break checkout or a payment webhook.
        logger.exception("Could not enqueue Meta CAPI purchase for order=%s", order.pk)
        return False


def send_purchase_for_order(order):
    """
    Send the server-side Purchase for an order.

    This is the event that most needs a server copy: the browser Pixel fires on
    the thank-you page, which an online-payment customer may never reach if the
    provider redirect fails or they close the tab — while the order itself is
    perfectly real.
    """
    first_name, last_name = split_name(order.customer_name)
    region_code = getattr(order.region, "code", "") or ""

    user_data = build_user_data(
        email=order.customer_email,
        phone=order.customer_phone,
        first_name=first_name,
        last_name=last_name,
        city=order.city,
        postcode=order.postcode,
        country=order.country,
        region_code=region_code,
        external_id=order.order_number,
        fbp=order.meta_fbp,
        fbc=order.meta_fbc,
        client_ip=order.meta_client_ip or "",
        client_user_agent=order.meta_client_user_agent,
    )

    items = list(order.items.all())
    custom_data = {
        "currency": order.currency_code,
        "value": float(order.grand_total),
        "content_type": "product",
        # product_slug, matching the browser Pixel's content_ids exactly —
        # see buildAnalyticsItem() on the storefront.
        "content_ids": [item.product_slug for item in items if item.product_slug],
        "contents": [
            {
                "id": item.product_slug,
                "quantity": item.quantity,
                "item_price": float(item.unit_price),
            }
            for item in items
            if item.product_slug
        ],
        "num_items": sum(item.quantity for item in items),
        "order_id": order.order_number,
    }
    if order.coupon_code:
        custom_data["coupon"] = order.coupon_code

    return send_event(
        event_name="Purchase",
        event_id=purchase_event_id(order),
        user_data=user_data,
        custom_data=custom_data,
        event_source_url=order.meta_event_source_url,
        event_time=order.created_at,
        order=order,
    )


def _graph_base_url():
    return str(
        getattr(django_settings, "META_GRAPH_BASE_URL", DEFAULT_GRAPH_BASE_URL)
    ).rstrip("/")


def client_ip_from_request(request):
    """
    The real visitor IP, as Meta needs it for geo matching.

    Behind nginx ``REMOTE_ADDR`` is the proxy, so the first hop of
    X-Forwarded-For is used when present. This is spoofable in principle, but a
    forged value only degrades that visitor's own match quality — it cannot
    reach anything security-sensitive here.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        candidate = forwarded.split(",")[0].strip()
        if candidate:
            return candidate
    return request.META.get("REMOTE_ADDR", "") or ""
