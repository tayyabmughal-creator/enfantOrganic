import json
import re
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase

from store.models import CmsPage


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
