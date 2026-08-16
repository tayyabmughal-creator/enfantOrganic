import json
import re
import tempfile
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from store.models import CmsPage, Product, ProductPrice, Region


class SeedCmsPagesTestCase(TestCase):
    """Contact and the Why Choose Us pages had no CmsPage row, so the admin could
    open the Pages screen and simply not find them."""

    def setUp(self):
        self.source = Path(tempfile.mkdtemp()) / "pages.json"
        self.source.write_text(
            json.dumps({
                "contact": {
                    "title_en": "Contact Us",
                    "title_ar": "اتصل بنا",
                    "body_en": "<h2>We're Here to Help</h2>",
                    "body_ar": "<h2>نحن هنا للمساعدة</h2>",
                },
            }, ensure_ascii=False),
            encoding="utf-8",
        )

    def _run(self, **options):
        call_command("seed_cms_pages", source=str(self.source), verbosity=0, **options)

    def test_a_missing_page_is_created(self):
        self._run()

        page = CmsPage.objects.get(slug="contact")
        self.assertEqual(page.title_en, "Contact Us")
        self.assertEqual(page.title_ar, "اتصل بنا")
        self.assertIn("We're Here to Help", page.body_en)

    def test_an_existing_page_is_never_overwritten(self):
        CmsPage.objects.create(slug="contact", title_en="Reach us", body_en="<p>Admin wrote this</p>")

        self._run()

        page = CmsPage.objects.get(slug="contact")
        self.assertEqual(page.title_en, "Reach us")
        self.assertIn("Admin wrote this", page.body_en)

    def test_running_twice_creates_one_page(self):
        self._run()
        self._run()

        self.assertEqual(CmsPage.objects.filter(slug="contact").count(), 1)

    def test_dry_run_writes_nothing(self):
        self._run(dry_run=True)

        self.assertFalse(CmsPage.objects.filter(slug="contact").exists())

    def test_a_seeded_page_is_published(self):
        # is_published defaults to False and the storefront only serves published
        # pages, so an unpublished seed leaves the hardcoded frontend copy live
        # and every admin edit silently does nothing.
        self._run()

        self.assertTrue(CmsPage.objects.get(slug="contact").is_published)

    def test_an_existing_unpublished_page_is_published_without_losing_its_copy(self):
        CmsPage.objects.create(
            slug="contact", title_en="Reach us", body_en="<p>Admin wrote this</p>", is_published=False,
        )

        self._run()

        page = CmsPage.objects.get(slug="contact")
        self.assertTrue(page.is_published)
        self.assertIn("Admin wrote this", page.body_en)

    def test_dry_run_does_not_publish(self):
        CmsPage.objects.create(slug="contact", title_en="Reach us", is_published=False)

        self._run(dry_run=True)

        self.assertFalse(CmsPage.objects.get(slug="contact").is_published)

    def test_a_seeded_page_reaches_the_storefront(self):
        self._run()

        response = APIClient().get("/api/pages/contact/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Contact Us")

    def test_the_shipped_seed_file_covers_the_pages_that_had_none(self):
        shipped = Path(settings.BASE_DIR) / "store" / "data" / "cms_seed_pages.json"
        payload = json.loads(shipped.read_text(encoding="utf-8"))

        # The Why Choose Us dropdown points at these, and the client could not
        # edit any of them.
        for slug in ("contact", "our-standards", "ingredients", "certifications"):
            self.assertIn(slug, payload)

        for slug, row in payload.items():
            for field in ("title_en", "title_ar", "body_en", "body_ar"):
                self.assertTrue(str(row.get(field) or "").strip(), f"{slug}.{field} is empty")
            # An Arabic body that is still English would put us back where we started.
            self.assertFalse(
                re.fullmatch(r"[\sA-Za-z0-9<>/\"'=,\.\-–—:;&%\(\)\+!\?]+", row["body_ar"]),
                f"{slug} has an English Arabic body",
            )


class DeliveryEstimateTestCase(TestCase):
    """Checkout showed no delivery estimate: it came only from shipping rules,
    and there are none configured."""

    def setUp(self):
        self.client_api = APIClient()
        self.region = Region.objects.create(
            code="om", name_en="Oman", name_ar="عمان", currency_code="OMR",
            fx_rate=Decimal("1.000000"), is_active=True, is_default=True,
            shipping_fee=Decimal("2.00"), shipping_threshold=Decimal("0.00"),
            contact_phone="12345678", address_en="Test Address",
        )
        self.product = Product.objects.create(
            slug="lotion", name_en="Lotion", name_ar="لوشن", is_published=True, track_inventory=False,
        )
        ProductPrice.objects.create(product=self.product, region=self.region, price=Decimal("5.000"))

    def _preview(self):
        response = self.client_api.post(
            "/api/coupons/validate/",
            {
                "region": "om",
                "coupon_code": "",
                "items": [{"slug": "lotion", "quantity": 1}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_the_regions_promise_is_used_when_no_shipping_rule_states_one(self):
        self.region.delivery_eta_min_days = 1
        self.region.delivery_eta_max_days = 2
        self.region.save(update_fields=["delivery_eta_min_days", "delivery_eta_max_days"])

        data = self._preview()

        self.assertEqual(data["eta_min_days"], 1)
        self.assertEqual(data["eta_max_days"], 2)

    def test_no_promise_set_shows_no_estimate(self):
        data = self._preview()

        self.assertIsNone(data["eta_min_days"])
        self.assertIsNone(data["eta_max_days"])
