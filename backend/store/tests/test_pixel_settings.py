"""Regression tests for admin-managed marketing pixel configuration.

The storefront loads its pixel IDs (Meta, TikTok, Snapchat, GA/GTM) from the
public /api/navigation/ settings payload, so these fields must keep being
serialized from SiteSettings — otherwise the frontend silently falls back to
build-time env vars and admin edits stop taking effect.
"""

from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from store.models import Region, SiteSettings


class PixelSettingsSerializationTests(TestCase):
    def setUp(self):
        # NavigationView is wrapped in cache_page; clear it so each test sees
        # its own SiteSettings row instead of a response cached by a sibling test.
        cache.clear()
        self.client = APIClient()
        Region.objects.create(
            code="om",
            name_en="Oman",
            name_ar="عمان",
            currency_code="OMR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Oman Address",
            address_ar="Oman Address AR",
            is_default=True,
        )
        SiteSettings.objects.create(
            brand_name="Enfant Organics",
            facebook_pixel_id="2127480041027733",
            tiktok_pixel_id="TESTTIKTOKPIXELID123",
            snapchat_pixel_id="a43535d8-5748-44f7-87c4-f712db4a5cb4",
        )

    def get_settings(self):
        response = self.client.get("/api/navigation/", {"locale": "en", "region": "om"})
        self.assertEqual(response.status_code, 200)
        return response.data["settings"]

    def test_navigation_exposes_admin_managed_pixel_ids(self):
        settings = self.get_settings()
        self.assertEqual(settings["facebook_pixel_id"], "2127480041027733")
        self.assertEqual(settings["tiktok_pixel_id"], "TESTTIKTOKPIXELID123")
        self.assertEqual(
            settings["snapchat_pixel_id"], "a43535d8-5748-44f7-87c4-f712db4a5cb4"
        )

    def test_empty_pixel_ids_serialize_as_empty_strings(self):
        SiteSettings.objects.all().update(
            facebook_pixel_id="", tiktok_pixel_id="", snapchat_pixel_id=""
        )
        settings = self.get_settings()
        self.assertEqual(settings["facebook_pixel_id"], "")
        self.assertEqual(settings["tiktok_pixel_id"], "")
        self.assertEqual(settings["snapchat_pixel_id"], "")

    def test_navigation_never_leaks_private_integration_tokens(self):
        # Pixel IDs are public identifiers; access tokens are not and must
        # never appear in the public navigation payload.
        settings = self.get_settings()
        for key in settings:
            self.assertNotIn("token", key.lower())
            self.assertNotIn("secret", key.lower())
            self.assertNotIn("api_key", key.lower())
