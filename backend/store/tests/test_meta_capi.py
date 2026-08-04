"""
Tests for Meta Conversions API delivery.

The failure mode these guard against is specifically a *silent* one: Meta
answers ``events_received: 1`` to a perfectly well-formed event whose hashes
match nobody, so a normalisation bug looks exactly like success in production.
The only place it can be caught is here, against known digests.
"""

import hashlib
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from store.models import MetaCapiEvent, Order, Region, SiteSettings
from store.services import meta_capi


def sha256(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class MetaCapiNormalisationTests(TestCase):
    def test_email_is_trimmed_and_lowercased_before_hashing(self):
        self.assertEqual(
            meta_capi._norm_email("  John.Smith@Gmail.COM "),
            sha256("john.smith@gmail.com"),
        )

    def test_invalid_email_yields_no_hash(self):
        # Better to lose one match field than to send a hash of garbage, which
        # Meta counts as a present-but-unmatchable identifier.
        self.assertEqual(meta_capi._norm_email("not-an-email"), "")
        self.assertEqual(meta_capi._norm_email(""), "")

    def test_phone_is_reduced_to_digits_with_country_code(self):
        # Meta wants digits only — no "+", spaces or dashes.
        expected = sha256("96891234567")
        self.assertEqual(meta_capi._norm_phone("+968 9123 4567"), expected)
        self.assertEqual(meta_capi._norm_phone("00968-9123-4567"), expected)

    def test_local_phone_gains_its_region_country_code(self):
        self.assertEqual(
            meta_capi._norm_phone("91234567", region_code="om"),
            sha256("96891234567"),
        )

    def test_too_short_phone_yields_no_hash(self):
        self.assertEqual(meta_capi._norm_phone("1234"), "")

    def test_name_strips_punctuation_and_case(self):
        # "Al-Balushi", "al balushi" and "AL BALUSHI" are the same person.
        expected = sha256("albalushi")
        for variant in ("Al-Balushi", "al balushi", "  AL BALUSHI  "):
            self.assertEqual(meta_capi._norm_name(variant), expected, variant)

    def test_city_strips_spaces(self):
        self.assertEqual(meta_capi._norm_city("Abu Dhabi"), sha256("abudhabi"))

    def test_country_name_is_converted_to_iso_alpha_2(self):
        # Order.country holds a display name typed at checkout; Meta matches on
        # the two-letter code, so hashing the name outright would never match.
        self.assertEqual(meta_capi._norm_country("United Arab Emirates"), sha256("ae"))
        self.assertEqual(meta_capi._norm_country("Oman"), sha256("om"))
        self.assertEqual(meta_capi._norm_country("om"), sha256("om"))

    def test_unknown_country_yields_no_hash(self):
        self.assertEqual(meta_capi._norm_country("Atlantis"), "")

    def test_split_name_handles_single_and_multi_part_names(self):
        self.assertEqual(meta_capi.split_name("Fatima Al Balushi"), ("Fatima", "Al Balushi"))
        self.assertEqual(meta_capi.split_name("Fatima"), ("Fatima", ""))
        self.assertEqual(meta_capi.split_name("   "), ("", ""))


class MetaCapiUserDataTests(TestCase):
    def test_empty_fields_are_omitted_not_sent_blank(self):
        # A present-but-empty field counts against Meta's match quality score —
        # the exact metric behind the "manual advanced matching" warning.
        user_data = meta_capi.build_user_data(email="shopper@example.com")
        self.assertIn("em", user_data)
        for absent in ("ph", "fn", "ln", "ct", "zp", "country"):
            self.assertNotIn(absent, user_data)

    def test_hashed_fields_are_wrapped_in_lists(self):
        user_data = meta_capi.build_user_data(email="shopper@example.com")
        self.assertEqual(user_data["em"], [sha256("shopper@example.com")])

    def test_click_identifiers_and_request_context_are_not_hashed(self):
        # fbp/fbc/IP/user-agent are matched verbatim by Meta; hashing them
        # would silently destroy the strongest signal we have.
        user_data = meta_capi.build_user_data(
            fbp="fb.1.1700000000.1234567890",
            fbc="fb.1.1700000000.IwAR0abc",
            client_ip="1.2.3.4",
            client_user_agent="Mozilla/5.0",
        )
        self.assertEqual(user_data["fbp"], "fb.1.1700000000.1234567890")
        self.assertEqual(user_data["fbc"], "fb.1.1700000000.IwAR0abc")
        self.assertEqual(user_data["client_ip_address"], "1.2.3.4")
        self.assertEqual(user_data["client_user_agent"], "Mozilla/5.0")


class MetaCapiConfigTests(TestCase):
    def test_disabled_without_a_token_even_when_flag_is_on(self):
        SiteSettings.objects.create(
            brand_name="Enfant",
            announcement_en="", announcement_ar="",
            footer_about_en="", footer_about_ar="",
            meta_capi_enabled=True,
            meta_capi_dataset_id="2127480041027733",
            meta_capi_access_token="",
        )
        self.assertFalse(meta_capi.get_capi_config()["enabled"])

    def test_dataset_id_falls_back_to_the_pixel_id(self):
        SiteSettings.objects.create(
            brand_name="Enfant",
            announcement_en="", announcement_ar="",
            footer_about_en="", footer_about_ar="",
            meta_capi_enabled=True,
            meta_capi_access_token="tok",
            facebook_pixel_id="2127480041027733",
        )
        config = meta_capi.get_capi_config()
        self.assertEqual(config["dataset_id"], "2127480041027733")
        self.assertTrue(config["enabled"])


class FakeResponse:
    def __init__(self, ok=True, status_code=200, text='{"events_received":1}'):
        self.ok = ok
        self.status_code = status_code
        self.text = text


class MetaCapiSendEventTests(TestCase):
    def setUp(self):
        SiteSettings.objects.create(
            brand_name="Enfant",
            announcement_en="", announcement_ar="",
            footer_about_en="", footer_about_ar="",
            meta_capi_enabled=True,
            meta_capi_access_token="test-token",
            meta_capi_dataset_id="2127480041027733",
        )

    def test_successful_send_is_logged_with_the_payload_meta_expects(self):
        with patch("store.services.meta_capi.requests.post", return_value=FakeResponse()) as post:
            log = meta_capi.send_event(
                event_name="AddToCart",
                event_id="add-to-cart-abc",
                user_data={"em": [sha256("a@b.com")]},
                custom_data={"currency": "OMR", "value": 6.0},
                event_source_url="https://om.enfantorganic.com/en/products/x",
            )

        self.assertEqual(log.status, MetaCapiEvent.STATUS_SENT)
        body = post.call_args.kwargs["json"]
        event = body["data"][0]
        self.assertEqual(event["event_name"], "AddToCart")
        self.assertEqual(event["event_id"], "add-to-cart-abc")
        self.assertEqual(event["action_source"], "website")
        # The om. subdomain must survive verbatim: the storefront geo-redirects,
        # and a rewritten host would not match what the Pixel reported.
        self.assertEqual(event["event_source_url"], "https://om.enfantorganic.com/en/products/x")
        self.assertEqual(body["access_token"], "test-token")

    def test_a_repeat_send_of_a_delivered_event_is_not_sent_again(self):
        with patch("store.services.meta_capi.requests.post", return_value=FakeResponse()) as post:
            meta_capi.send_event(
                event_name="AddToCart", event_id="dup-1", user_data={}
            )
            meta_capi.send_event(
                event_name="AddToCart", event_id="dup-1", user_data={}
            )

        # Double-sending a conversion does not merely inflate a report — it
        # trains Meta's optimiser on volume that never happened.
        self.assertEqual(post.call_count, 1)
        self.assertEqual(MetaCapiEvent.objects.filter(event_id="dup-1").count(), 1)

    def test_test_event_code_is_sent_when_configured(self):
        SiteSettings.objects.update(meta_capi_test_event_code="TEST66434")
        with patch("store.services.meta_capi.requests.post", return_value=FakeResponse()) as post:
            meta_capi.send_event(event_name="ViewContent", event_id="vc-1", user_data={})
        self.assertEqual(post.call_args.kwargs["json"]["test_event_code"], "TEST66434")

    def test_http_error_is_recorded_as_failed_and_never_raises(self):
        with patch(
            "store.services.meta_capi.requests.post",
            return_value=FakeResponse(ok=False, status_code=400, text="bad token"),
        ):
            log = meta_capi.send_event(event_name="ViewContent", event_id="vc-2", user_data={})
        self.assertEqual(log.status, MetaCapiEvent.STATUS_FAILED)
        self.assertIn("400", log.error_message)

    def test_network_failure_is_recorded_and_never_raises(self):
        import requests

        with patch(
            "store.services.meta_capi.requests.post",
            side_effect=requests.ConnectionError("graph unreachable"),
        ):
            log = meta_capi.send_event(event_name="ViewContent", event_id="vc-3", user_data={})
        self.assertEqual(log.status, MetaCapiEvent.STATUS_FAILED)

    def test_events_are_skipped_when_capi_is_disabled(self):
        SiteSettings.objects.update(meta_capi_enabled=False)
        with patch("store.services.meta_capi.requests.post") as post:
            log = meta_capi.send_event(event_name="ViewContent", event_id="vc-4", user_data={})
        post.assert_not_called()
        self.assertEqual(log.status, MetaCapiEvent.STATUS_SKIPPED)

    def test_unknown_event_names_are_rejected(self):
        # Meta silently accepts a typo as a *custom* event, where it no longer
        # feeds standard-event optimisation.
        with self.assertRaises(ValueError):
            meta_capi.send_event(event_name="AddToCarts", event_id="x", user_data={})

    def test_missing_event_id_is_rejected(self):
        with self.assertRaises(ValueError):
            meta_capi.send_event(event_name="AddToCart", event_id="", user_data={})

    def test_match_field_count_ignores_ip_and_user_agent(self):
        with patch("store.services.meta_capi.requests.post", return_value=FakeResponse()):
            log = meta_capi.send_event(
                event_name="AddToCart",
                event_id="mq-1",
                user_data={
                    "em": [sha256("a@b.com")],
                    "ph": [sha256("96891234567")],
                    "client_ip_address": "1.2.3.4",
                    "client_user_agent": "Mozilla/5.0",
                },
            )
        self.assertEqual(log.match_field_count, 2)


class PurchaseEligibilityTests(TestCase):
    """
    These rules must stay in step with isPurchaseTrackable() on the storefront.
    If they drift, the browser and server disagree about which orders are
    conversions and Meta counts an unpaired event on its own.
    """

    def setUp(self):
        self.region = Region.objects.create(
            code="om",
            name_en="Oman",
            currency_code="OMR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Test Address",
            address_ar="Test Address AR",
        )

    def _order(self, **kwargs):
        defaults = dict(
            region=self.region,
            customer_name="Fatima Al Balushi",
            customer_email="fatima@example.com",
            customer_phone="+96891234567",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            currency_code="OMR",
            grand_total=Decimal("12.500"),
        )
        defaults.update(kwargs)
        return Order.objects.create(**defaults)

    def test_cod_order_counts_immediately(self):
        # COD is legitimately unpaid at thank-you time but is a real conversion.
        order = self._order(
            payment_method=Order.PAYMENT_COD, payment_status=Order.PAYMENT_UNPAID
        )
        self.assertTrue(meta_capi.should_send_purchase(order))

    def test_unpaid_online_order_does_not_count_yet(self):
        # The order row exists from checkout submit, but the customer may still
        # abandon or be declined at the provider.
        order = self._order(
            payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_UNPAID
        )
        self.assertFalse(meta_capi.should_send_purchase(order))

    def test_paid_online_order_counts(self):
        order = self._order(
            payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_PAID
        )
        self.assertTrue(meta_capi.should_send_purchase(order))

    def test_cancelled_order_never_counts(self):
        order = self._order(
            payment_method=Order.PAYMENT_COD, status=Order.STATUS_CANCELLED
        )
        self.assertFalse(meta_capi.should_send_purchase(order))

    def test_refunded_payment_never_counts(self):
        order = self._order(
            payment_method=Order.PAYMENT_COD, payment_status=Order.PAYMENT_REFUNDED
        )
        self.assertFalse(meta_capi.should_send_purchase(order))

    def test_purchase_event_id_matches_the_browser_pixel(self):
        # PurchaseEventTracker.jsx builds `purchase-${order.order_number}`.
        order = self._order(payment_method=Order.PAYMENT_COD)
        self.assertEqual(
            meta_capi.purchase_event_id(order), f"purchase-{order.order_number}"
        )


class MetaCapiRelayEndpointTests(TestCase):
    def setUp(self):
        self.url = reverse("analytics-meta-event")
        SiteSettings.objects.create(
            brand_name="Enfant",
            announcement_en="", announcement_ar="",
            footer_about_en="", footer_about_ar="",
            meta_capi_enabled=True,
            meta_capi_access_token="test-token",
            meta_capi_dataset_id="2127480041027733",
        )

    def test_relayed_event_is_queued_with_server_side_ip_and_user_agent(self):
        with patch("store.api_views.meta_capi.send_meta_capi_event_async.delay") as delay:
            response = self.client.post(
                self.url,
                {
                    "event_name": "AddToCart",
                    "event_id": "add-to-cart-1",
                    "event_source_url": "https://ae.enfantorganic.com/en/products/x",
                    "fbp": "fb.1.1700000000.1234567890",
                    "user_data": {"email": "Shopper@Example.com"},
                    "custom_data": {"currency": "AED", "value": 42},
                },
                content_type="application/json",
                HTTP_USER_AGENT="Mozilla/5.0 (iPhone)",
                HTTP_X_FORWARDED_FOR="203.0.113.9, 10.0.0.1",
            )

        self.assertEqual(response.status_code, 202)
        payload = delay.call_args.args[0]
        self.assertEqual(payload["user_data"]["em"], [sha256("shopper@example.com")])
        self.assertEqual(payload["user_data"]["fbp"], "fb.1.1700000000.1234567890")
        # Taken from the request, never from the body — a client could otherwise
        # claim any IP it liked.
        self.assertEqual(payload["user_data"]["client_ip_address"], "203.0.113.9")
        self.assertEqual(payload["user_data"]["client_user_agent"], "Mozilla/5.0 (iPhone)")

    def test_guest_browse_event_still_carries_a_matching_key(self):
        # Meta counts only matching keys (em/ph/fbp/external_id/...) — client_ip_address
        # and client_user_agent do not qualify. A guest viewing a product has no
        # email yet, and `_fbp` is absent whenever the Pixel is blocked, which is
        # exactly the traffic CAPI exists to recover. Without external_id these
        # events were rejected for attribution.
        with patch("store.api_views.meta_capi.send_meta_capi_event_async.delay") as delay:
            response = self.client.post(
                self.url,
                {
                    "event_name": "ViewContent",
                    "event_id": "view-content-1",
                    "external_id": "session-abc-123",
                },
                content_type="application/json",
                HTTP_USER_AGENT="Mozilla/5.0 (iPhone)",
                HTTP_X_FORWARDED_FOR="203.0.113.9",
            )

        self.assertEqual(response.status_code, 202)
        user_data = delay.call_args.args[0]["user_data"]
        self.assertEqual(user_data["external_id"], [sha256("session-abc-123")])
        matching_keys = {"em", "ph", "fn", "ln", "ct", "zp", "country", "external_id", "fbp", "fbc"}
        self.assertTrue(matching_keys & set(user_data))

    def test_region_supplies_country_when_no_checkout_details_exist(self):
        # Events Manager asks specifically for customer-information keys (email,
        # phone, city, state, zip, country); fbp and external_id alone did not
        # clear the warning. A visitor on a regional store is in that market by
        # definition, so country is knowable even on a browse event.
        with patch("store.api_views.meta_capi.send_meta_capi_event_async.delay") as delay:
            self.client.post(
                self.url,
                {
                    "event_name": "AddToCart",
                    "event_id": "add-to-cart-region-1",
                    "region_code": "ae",
                },
                content_type="application/json",
            )

        user_data = delay.call_args.args[0]["user_data"]
        self.assertEqual(user_data["country"], [sha256("ae")])

    def test_explicit_country_beats_the_region_fallback(self):
        with patch("store.api_views.meta_capi.send_meta_capi_event_async.delay") as delay:
            self.client.post(
                self.url,
                {
                    "event_name": "AddToCart",
                    "event_id": "add-to-cart-region-2",
                    "region_code": "ae",
                    "user_data": {"country": "om"},
                },
                content_type="application/json",
            )

        user_data = delay.call_args.args[0]["user_data"]
        self.assertEqual(user_data["country"], [sha256("om")])

    def test_session_external_id_never_overrides_a_signed_in_user(self):
        user = get_user_model().objects.create_user(username="shopper", password="pw12345!")
        self.client.force_login(user)
        with patch("store.api_views.meta_capi.send_meta_capi_event_async.delay") as delay:
            self.client.post(
                self.url,
                {
                    "event_name": "ViewContent",
                    "event_id": "view-content-2",
                    "external_id": "spoofed-session",
                },
                content_type="application/json",
            )

        user_data = delay.call_args.args[0]["user_data"]
        self.assertEqual(user_data["external_id"], [sha256(str(user.pk))])

    def test_purchase_cannot_be_relayed_through_the_open_endpoint(self):
        # Purchase is sent from the order record instead, so nobody can post a
        # conversion of their own choosing and corrupt ad optimisation.
        with patch("store.api_views.meta_capi.send_meta_capi_event_async.delay") as delay:
            response = self.client.post(
                self.url,
                {"event_name": "Purchase", "event_id": "purchase-EO-1", "custom_data": {"value": 99999}},
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 400)
        delay.assert_not_called()

    def test_event_id_is_required(self):
        response = self.client.post(
            self.url,
            {"event_name": "AddToCart"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unexpected_custom_data_keys_are_dropped(self):
        with patch("store.api_views.meta_capi.send_meta_capi_event_async.delay") as delay:
            self.client.post(
                self.url,
                {
                    "event_name": "ViewContent",
                    "event_id": "vc-9",
                    "custom_data": {"currency": "OMR", "value": 3, "evil": {"a": "b"}},
                },
                content_type="application/json",
            )
        custom = delay.call_args.args[0]["custom_data"]
        self.assertNotIn("evil", custom)
        self.assertEqual(custom["currency"], "OMR")

    def test_endpoint_no_ops_quietly_when_capi_is_disabled(self):
        SiteSettings.objects.update(meta_capi_enabled=False)
        with patch("store.api_views.meta_capi.send_meta_capi_event_async.delay") as delay:
            response = self.client.post(
                self.url,
                {"event_name": "AddToCart", "event_id": "x-1"},
                content_type="application/json",
            )
        # 200, not an error: the storefront should not log console noise for a
        # feature the client simply has not switched on.
        self.assertEqual(response.status_code, 200)
        delay.assert_not_called()
