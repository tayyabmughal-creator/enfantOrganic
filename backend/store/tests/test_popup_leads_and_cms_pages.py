import io

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from store.models import CmsPage, NewsletterSubscription, Region
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

User = get_user_model()


class PopupLeadCaptureApiTestCase(TestCase):
    """Public POST /api/newsletter/ — the discount popup submission endpoint."""

    def setUp(self):
        self.client_api = APIClient()
        self.om = Region.objects.create(
            code="om", name_en="Oman", currency_code="OMR",
            shipping_fee=2, shipping_threshold=0, contact_phone="12345678", address_en="x",
        )
        self.ae = Region.objects.create(
            code="ae", name_en="UAE", currency_code="AED",
            shipping_fee=2, shipping_threshold=0, contact_phone="12345678", address_en="x",
        )

    def test_valid_oman_submission_saves_country_code_region_and_timestamp(self):
        response = self.client_api.post(
            "/api/newsletter/",
            {"phone": "91234567", "country_code": "+968", "locale": "en", "source": "discount_popup", "page_path": "/en/"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        lead = NewsletterSubscription.objects.get(phone="91234567")
        self.assertEqual(lead.country_code, "+968")
        self.assertEqual(lead.region.code, "om")
        self.assertEqual(lead.source, "discount_popup")
        self.assertEqual(lead.page_path, "/en/")
        self.assertIsNotNone(lead.created_at)

    def test_uae_number_derives_uae_region_regardless_of_client_supplied_region(self):
        response = self.client_api.post(
            "/api/newsletter/",
            {"phone": "501234567", "country_code": "+971", "region": "om", "source": "discount_popup"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        lead = NewsletterSubscription.objects.get(phone="501234567")
        # Region must be derived from the verified country code, not the client-sent region.
        self.assertEqual(lead.region.code, "ae")

    def test_rejects_unsupported_country_code(self):
        response = self.client_api.post(
            "/api/newsletter/",
            {"phone": "5551234", "country_code": "+1", "source": "discount_popup"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("country_code", response.data)

    def test_rejects_invalid_phone_length_for_country(self):
        response = self.client_api.post(
            "/api/newsletter/",
            {"phone": "5123", "country_code": "+971", "source": "discount_popup"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("phone", response.data)

    def test_accepts_common_pasted_formats_per_region(self):
        # People paste numbers with the dial code, 00 prefix, leading zero, or
        # spaces — every one of these must normalize to the clean local number.
        cases = [
            ("+968", "968 9123 4567", "91234567"),      # dial code + spaces (Oman)
            ("+968", "0096891234567", "91234567"),      # 00 international prefix
            ("+971", "971501234567", "501234567"),      # dial code glued on (UAE)
            ("+971", "+971 50 123 4567", "501234567"),  # full international format
            ("+971", "0501234567", "501234567"),        # local leading zero
            ("+966", "966501234567", "501234567"),      # dial code glued on (KSA)
            ("+966", "00966 50 123 4567", "501234567"), # 00 prefix + spaces
        ]
        for country_code, typed, expected in cases:
            with self.subTest(country_code=country_code, typed=typed):
                NewsletterSubscription.objects.all().delete()
                response = self.client_api.post(
                    "/api/newsletter/",
                    {"phone": typed, "country_code": country_code, "source": "discount_popup"},
                    format="json",
                )
                self.assertEqual(response.status_code, 201, response.data)
                self.assertTrue(
                    NewsletterSubscription.objects.filter(phone=expected, country_code=country_code).exists(),
                    f"{typed} should normalize to {expected}",
                )

    def test_oman_number_starting_with_dial_digits_is_kept_intact(self):
        # An 8-digit Omani mobile can legitimately start with 968 — the dial
        # code strip must not mangle it into an invalid 5-digit number.
        response = self.client_api.post(
            "/api/newsletter/",
            {"phone": "96871234", "country_code": "+968", "source": "discount_popup"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(NewsletterSubscription.objects.filter(phone="96871234", country_code="+968").exists())

    def test_resubmitting_same_number_updates_instead_of_duplicating(self):
        payload = {"phone": "91234567", "country_code": "+968", "source": "discount_popup"}
        self.client_api.post("/api/newsletter/", payload, format="json")
        self.client_api.post("/api/newsletter/", {**payload, "locale": "ar"}, format="json")
        self.assertEqual(NewsletterSubscription.objects.filter(phone="91234567", country_code="+968").count(), 1)

    def test_same_national_number_different_country_codes_are_distinct_leads(self):
        self.client_api.post("/api/newsletter/", {"phone": "501234567", "country_code": "+971", "source": "discount_popup"}, format="json")
        self.client_api.post("/api/newsletter/", {"phone": "501234567", "country_code": "+966", "source": "discount_popup"}, format="json")
        self.assertEqual(NewsletterSubscription.objects.filter(phone="501234567").count(), 2)

    def test_email_only_newsletter_form_still_works_without_country_code(self):
        response = self.client_api.post(
            "/api/newsletter/", {"email": "shopper@example.com", "region": "om"}, format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(NewsletterSubscription.objects.get(email="shopper@example.com").country_code, "")


class PopupLeadAdminApiTestCase(TestCase):
    """Admin-facing list + CSV/Excel export for popup phone leads."""

    def setUp(self):
        ensure_default_admin_roles()
        self.api_client = APIClient()
        self.staff_user = User.objects.create_user(username="manager", password="Pass12345!", is_staff=True)
        self.staff_user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.api_client.force_authenticate(self.staff_user)

        self.om = Region.objects.create(
            code="om", name_en="Oman", currency_code="OMR",
            shipping_fee=2, shipping_threshold=0, contact_phone="1", address_en="x",
        )
        self.ae = Region.objects.create(
            code="ae", name_en="UAE", currency_code="AED",
            shipping_fee=2, shipping_threshold=0, contact_phone="1", address_en="x",
        )
        NewsletterSubscription.objects.create(
            phone="91234567", country_code="+968", region=self.om, source="discount_popup", page_path="/en/",
        )
        NewsletterSubscription.objects.create(
            phone="501234567", country_code="+971", region=self.ae, source="discount_popup", page_path="/en/collections",
        )
        NewsletterSubscription.objects.create(email="footer@example.com", source="newsletter", region=self.om)

    def test_unauthenticated_request_is_rejected(self):
        anon_client = APIClient()
        response = anon_client.get("/api/admin/newsletter-subscribers/")
        self.assertEqual(response.status_code, 401)

    def test_list_includes_country_code_and_page_path(self):
        response = self.api_client.get("/api/admin/newsletter-subscribers/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)
        popup_rows = [r for r in response.data if r["source"] == "discount_popup"]
        self.assertEqual(len(popup_rows), 2)
        self.assertTrue(all("country_code" in r and "page_path" in r for r in popup_rows))

    def test_source_filter_scopes_to_popup_leads_only(self):
        response = self.api_client.get("/api/admin/newsletter-subscribers/?source=discount_popup")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertTrue(all(r["source"] == "discount_popup" for r in response.data))

    def test_region_filter(self):
        response = self.api_client.get("/api/admin/newsletter-subscribers/?source=discount_popup&region=ae")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["phone"], "501234567")

    def test_csv_export_matches_applied_filters(self):
        response = self.api_client.get("/api/admin/reports/newsletter/?source=discount_popup&region=om")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        body = response.content.decode("utf-8")
        self.assertIn("91234567", body)
        self.assertNotIn("501234567", body)
        self.assertIn("country_code", body)

    def test_xlsx_export_matches_applied_filters(self):
        import openpyxl

        response = self.api_client.get("/api/admin/reports/newsletter/?source=discount_popup&region=ae&export_format=xlsx")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        workbook = openpyxl.load_workbook(io.BytesIO(response.content))
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        self.assertEqual(rows[0][0], "Phone")
        phones = [row[0] for row in rows[1:]]
        self.assertEqual(phones, ["501234567"])

    def test_reports_export_requires_reports_capability_not_just_moderation(self):
        limited_user = User.objects.create_user(username="modonly", password="Pass12345!", is_staff=True)
        from store.services.admin_roles import ROLE_MARKETING

        limited_user.groups.add(Group.objects.get(name=ROLE_MARKETING))
        client = APIClient()
        client.force_authenticate(limited_user)
        # Can see the leads list (moderation.view)...
        self.assertEqual(client.get("/api/admin/newsletter-subscribers/").status_code, 200)
        # ...but cannot export the report (reports.view required).
        self.assertEqual(client.get("/api/admin/reports/newsletter/").status_code, 403)


class CmsPageAdminApiTestCase(TestCase):
    """Admin CRUD for policy/About pages — slug validation, sanitization, AR-optional, drafts."""

    def setUp(self):
        ensure_default_admin_roles()
        self.api_client = APIClient()
        self.staff_user = User.objects.create_user(username="manager", password="Pass12345!", is_staff=True)
        self.staff_user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.api_client.force_authenticate(self.staff_user)
        self.anon_client = APIClient()

        self.om = Region.objects.create(
            code="om", name_en="Oman", currency_code="OMR",
            shipping_fee=2, shipping_threshold=0, contact_phone="1", address_en="x",
        )
        # Migration 0064 already seeds a global "about" CmsPage row — reuse it
        # instead of creating a duplicate (would violate the global slug constraint).
        self.about = CmsPage.objects.get(slug="about", region=None)

    def test_anonymous_cannot_edit_pages(self):
        response = self.anon_client.patch(f"/api/admin/cms-pages/{self.about.id}/", {"title_en": "hack"}, format="json")
        self.assertIn(response.status_code, (401, 403))

    def test_can_create_page_without_arabic_content(self):
        response = self.api_client.post(
            "/api/admin/cms-pages/",
            {"slug": "exchange-policy", "title_en": "Exchange Policy", "body_en": "<p>Body</p>", "is_published": True},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(CmsPage.objects.get(slug="exchange-policy").title_ar, "")

    def test_duplicate_global_slug_is_rejected_with_400_not_500(self):
        response = self.api_client.post(
            "/api/admin/cms-pages/",
            {"slug": "about", "title_en": "Duplicate", "body_en": "<p>x</p>"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("slug", response.data)

    def test_same_slug_different_region_is_allowed(self):
        response = self.api_client.post(
            "/api/admin/cms-pages/",
            {"slug": "about", "region": self.om.id, "title_en": "About (Oman)", "body_en": "<p>om</p>"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_updating_a_page_with_its_own_unchanged_slug_is_allowed(self):
        response = self.api_client.patch(
            f"/api/admin/cms-pages/{self.about.id}/", {"title_en": "About Enfant Organics Updated"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_body_is_sanitized_on_save(self):
        response = self.api_client.patch(
            f"/api/admin/cms-pages/{self.about.id}/",
            {"body_en": "<p>Safe</p><script>alert(1)</script><img src=x onerror=alert(1)>"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.about.refresh_from_db()
        self.assertNotIn("<script", self.about.body_en)
        self.assertNotIn("onerror", self.about.body_en)
        self.assertIn("<p>Safe</p>", self.about.body_en)

    def test_draft_page_not_returned_by_public_endpoint(self):
        CmsPage.objects.create(slug="draft-page", title_en="Draft", body_en="<p>x</p>", is_published=False)
        response = self.anon_client.get("/api/pages/draft-page/")
        self.assertEqual(response.status_code, 404)

    def test_published_about_page_returned_by_public_endpoint(self):
        response = self.anon_client.get("/api/pages/about/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["slug"], "about")
