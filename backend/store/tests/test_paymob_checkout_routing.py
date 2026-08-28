"""
Which Paymob flow a region is sent down — Unified Checkout or the legacy iframe.

This is not a cosmetic choice. The UAE integrations are MIGS (gateway_type VPC),
and a MIGS integration *renders* the legacy iframe but cannot take a payment
through it: the customer fills in the card, presses pay, and Paymob records no
transaction at all. UAE sat pinned to legacy for three months — 10 online orders,
zero transactions on integration 118534 — while Oman ran Unified Checkout over
the same gateway type and converted 16 of 29. Nothing in the code errored, so
only a test on the routing itself can keep it from happening again.
"""
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings

from store.models import Order, Region
from store.services import paymob

UNIFIED_SETTINGS = dict(
    PAYMOB_USE_UNIFIED_CHECKOUT="1",
    PAYMOB_SECRET_KEY_AE="are_sk_live_test",
    PAYMOB_PUBLIC_KEY_AE="are_pk_live_test",
    PAYMOB_API_KEY_AE="ae-api-key",
    PAYMOB_INTEGRATION_ID_AE="118534",
    PAYMOB_IFRAME_ID_AE="43861",
    PAYMOB_HMAC_SECRET_AE="ae-hmac-secret",
    PAYMOB_BASE_URL_AE="https://uae.paymob.com/api",
    PAYMOB_CURRENCY_AE="AED",
    PAYMOB_PUBLIC_BASE_URL="https://www.enfantorganic.com",
)


class _FakeResponse:
    """Just enough of requests.Response for the intention call."""

    status_code = 201
    text = ""

    def raise_for_status(self):
        pass

    def json(self):
        return {"client_secret": "are_csk_live_test", "intention_order_id": 30284586}


@override_settings(**UNIFIED_SETTINGS)
class PaymobUaeRoutingTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(
            code="ae",
            name_en="United Arab Emirates",
            name_ar="الإمارات",
            currency_code="AED",
            locale_code="en",
            shipping_threshold=Decimal("0.00"),
            contact_phone="123",
            address_en="A",
            address_ar="ب",
            payment_enabled_providers=["paymob"],
            default_payment_provider="paymob",
        )
        self.order = Order.objects.create(
            region=self.region,
            customer_name="Ayesha Al Suwaidi",
            customer_email="shopper@example.com",
            customer_phone="971501234567",
            address_line_1="Sheikh Zayed Road",
            city="Dubai",
            country="United Arab Emirates",
            subtotal=Decimal("38.10"),
            shipping_total=Decimal("19.10"),
            grand_total=Decimal("57.20"),
            currency_code="AED",
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_UNPAID,
        )

    def test_uae_is_not_pinned_to_the_legacy_iframe(self):
        cfg = paymob.get_paymob_config("ae")
        self.assertFalse(paymob._region_forced_legacy(cfg))
        self.assertTrue(paymob._unified_checkout_enabled(cfg))

    def test_uae_card_payment_goes_to_unified_checkout(self):
        with patch("store.services.paymob.requests.post", return_value=_FakeResponse()) as post:
            result = paymob.initiate_payment(self.order)

        self.assertIn("/unifiedcheckout/", result["redirect_url"])
        # The legacy path would have called /auth/tokens first; Unified Checkout
        # authenticates with the secret key on the intention call itself.
        self.assertEqual(post.call_count, 1)
        url, kwargs = post.call_args[0][0], post.call_args[1]
        self.assertTrue(url.endswith("/v1/intention/"))
        # AED has two decimals: 57.20 is 5720 minor units, not 57200.
        self.assertEqual(kwargs["json"]["amount"], 5720)
        self.assertEqual(kwargs["json"]["currency"], "AED")
        # Without these Paymob falls back to the dashboard callback, which on the
        # wallet integrations points at its own post_pay and never reaches us.
        self.assertEqual(
            kwargs["json"]["notification_url"],
            "https://www.enfantorganic.com/api/payments/webhook/",
        )

    def test_apple_pay_tap_uses_the_same_hosted_page(self):
        """
        While UAE was pinned to legacy, an Apple Pay tap degraded to the card
        iframe because the region had no usable Apple Pay iframe of its own.
        Unified Checkout presents both, so the tap should stay on the hosted page.
        """
        with patch("store.services.paymob.requests.post", return_value=_FakeResponse()):
            result = paymob.initiate_apple_pay_payment(self.order)

        self.assertIn("/unifiedcheckout/", result["redirect_url"])

    @override_settings(PAYMOB_LEGACY_REGIONS="ae")
    def test_a_region_can_still_be_pinned_back_to_legacy(self):
        """The escape hatch stays usable if Paymob ever de-registers a region."""
        cfg = paymob.get_paymob_config("ae")
        self.assertTrue(paymob._region_forced_legacy(cfg))
        self.assertFalse(paymob._unified_checkout_enabled(cfg))
