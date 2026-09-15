"""The Reviews screen can select, import and export.

Moderating a review meant opening it, ticking Approved and saving — 1,563 times,
25 rows to a page. There was no way to select rows, no way to get the reviews out
of the store, and the only way in was a management command on the server that the
client cannot run.

This covers the three endpoints behind the new screen: the export (same filters
as the list, not paginated), the importer (our own file round-tripped, plus a
Judge.me export), and the bulk action (ticked ids, or everything matching the
filters). The search box the screen has always sent is covered too — it was
reaching a queryset that ignored it.
"""
import csv
import io

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from store.models import Product, Review
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles
from store.services.review_io import REVIEW_EXPORT_HEADERS

User = get_user_model()

LIST_URL = "/api/admin/reviews/"
EXPORT_URL = "/api/admin/reviews/export/"
IMPORT_URL = "/api/admin/reviews/import/"
BULK_URL = "/api/admin/reviews/bulk/"


def csv_upload(text, name="reviews.csv"):
    return SimpleUploadedFile(name, text.encode("utf-8"), content_type="text/csv")


class ReviewAdminToolsTests(TestCase):
    def setUp(self):
        ensure_default_admin_roles()
        self.api_client = APIClient()
        self.staff_user = User.objects.create_user(
            username="manager", password="Pass12345!", is_staff=True
        )
        self.staff_user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.api_client.force_authenticate(self.staff_user)

        self.shampoo = Product.objects.create(
            slug="moisture-shampoo", name_en="ENFANT Organic Baby Moisture Shampoo"
        )
        self.powder = Product.objects.create(
            slug="sweet-dream-powder", name_en="ENFANT Organic Sweet Dream Baby Powder"
        )

        self.approved = Review.objects.create(
            product=self.shampoo,
            customer_name="Aisha",
            rating=5,
            title="Lovely",
            comment="Gentle on my baby's skin.",
            is_approved=True,
        )
        self.pending = Review.objects.create(
            product=self.powder,
            customer_name="Fatima",
            rating=4,
            title="Good",
            comment="Nice scent, no rash.",
            is_approved=False,
        )

    def export_rows(self, params=""):
        response = self.api_client.get(f"{EXPORT_URL}{params}")
        self.assertEqual(response.status_code, 200)
        return list(csv.DictReader(io.StringIO(response.content.decode("utf-8"))))

    # ─── Search / filters ────────────────────────────────────────────────────

    def test_search_box_filters_the_list(self):
        """The screen has always sent ?search=; the queryset used to ignore it."""
        response = self.api_client.get(f"{LIST_URL}?search=Fatima")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["customer_name"] for row in response.data["results"]], ["Fatima"])

    def test_search_matches_the_product_a_review_is_on(self):
        response = self.api_client.get(f"{LIST_URL}?search=Sweet Dream")
        self.assertEqual([row["id"] for row in response.data["results"]], [self.pending.id])

    def test_status_and_rating_filters(self):
        pending = self.api_client.get(f"{LIST_URL}?status=pending")
        self.assertEqual([row["id"] for row in pending.data["results"]], [self.pending.id])

        five_star = self.api_client.get(f"{LIST_URL}?rating=5")
        self.assertEqual([row["id"] for row in five_star.data["results"]], [self.approved.id])

    # ─── Export ──────────────────────────────────────────────────────────────

    def test_export_csv_carries_every_review_and_column(self):
        response = self.api_client.get(EXPORT_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment; filename=", response["Content-Disposition"])
        self.assertEqual(response["X-Export-Reviews"], "2")

        rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8"))))
        self.assertEqual(list(rows[0].keys()), list(REVIEW_EXPORT_HEADERS))
        self.assertEqual({row["customer_name"] for row in rows}, {"Aisha", "Fatima"})
        self.assertEqual(rows[0]["product_slug"], "moisture-shampoo")
        self.assertEqual(rows[0]["is_approved"], "yes")

    def test_export_obeys_the_screen_filters(self):
        rows = self.export_rows("?status=pending")
        self.assertEqual([row["customer_name"] for row in rows], ["Fatima"])

    def test_export_can_be_limited_to_ticked_rows(self):
        rows = self.export_rows(f"?ids={self.approved.id}")
        self.assertEqual([row["customer_name"] for row in rows], ["Aisha"])

    def test_export_excel_is_a_workbook(self):
        response = self.api_client.get(f"{EXPORT_URL}?export_format=xlsx")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Disposition"].endswith('.xlsx"'))
        self.assertEqual(response.content[:2], b"PK")

    # ─── Import ──────────────────────────────────────────────────────────────

    def test_import_creates_reviews_and_updates_the_product_average(self):
        upload = csv_upload(
            "product_slug,customer_name,rating,title,comment\n"
            "moisture-shampoo,Layla,3,Okay,Does the job but the cap leaks.\n"
            "sweet-dream-powder,Noor,5,Perfect,Smells lovely.\n"
        )
        response = self.api_client.post(IMPORT_URL, {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["created"], 2)
        self.assertEqual(response.data["skipped_no_product"], 0)

        layla = Review.objects.get(customer_name="Layla")
        self.assertTrue(layla.is_approved)

        self.shampoo.refresh_from_db()
        self.assertEqual(self.shampoo.review_count, 2)  # Aisha 5★ + Layla 3★
        self.assertEqual(str(self.shampoo.rating), "4.0")

    def test_import_can_leave_new_reviews_pending(self):
        upload = csv_upload(
            "product_slug,customer_name,rating,comment\nmoisture-shampoo,Layla,3,Cap leaks.\n"
        )
        response = self.api_client.post(
            IMPORT_URL, {"file": upload, "default_approved": "0"}, format="multipart"
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Review.objects.get(customer_name="Layla").is_approved)

    def test_a_status_column_beats_the_default(self):
        upload = csv_upload(
            "product_slug,customer_name,rating,comment,is_approved\n"
            "moisture-shampoo,Layla,3,Cap leaks.,no\n"
        )
        self.api_client.post(IMPORT_URL, {"file": upload}, format="multipart")
        self.assertFalse(Review.objects.get(customer_name="Layla").is_approved)

    def test_reimporting_the_same_file_does_not_duplicate(self):
        text = "product_slug,customer_name,rating,title,comment\nmoisture-shampoo,Layla,3,Okay,Cap leaks.\n"
        self.api_client.post(IMPORT_URL, {"file": csv_upload(text)}, format="multipart")
        second = self.api_client.post(IMPORT_URL, {"file": csv_upload(text)}, format="multipart")

        self.assertEqual(second.data["created"], 0)
        self.assertEqual(second.data["skipped_duplicate"], 1)
        self.assertEqual(Review.objects.filter(customer_name="Layla").count(), 1)

    def test_exported_file_imports_back_as_edits(self):
        """Export, fix a rating in Excel, import: the same rows, edited."""
        response = self.api_client.get(EXPORT_URL)
        rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8"))))
        for row in rows:
            if row["customer_name"] == "Fatima":
                row["rating"] = "2"
                row["is_approved"] = "yes"

        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=list(REVIEW_EXPORT_HEADERS))
        writer.writeheader()
        writer.writerows(rows)

        result = self.api_client.post(
            IMPORT_URL, {"file": csv_upload(buffer.getvalue())}, format="multipart"
        )
        self.assertEqual(result.data["created"], 0)
        self.assertEqual(result.data["updated"], 2)
        self.assertEqual(Review.objects.count(), 2)

        self.pending.refresh_from_db()
        self.assertEqual(self.pending.rating, 2)
        self.assertTrue(self.pending.is_approved)

    def test_judge_me_headers_are_understood(self):
        upload = csv_upload(
            "Product Handle,Reviewer Name,Rating,Title,Body,Status,Media URLs,Date\n"
            "moisture-shampoo,r***a,5,Great,Baby loves it.,Published,"
            "https://cdn.example.com/a.jpg,2025-03-04\n"
            "sweet-dream-powder,n***r,4,Fine,No rash at all.,Unpublished,,2025-03-05\n"
        )
        response = self.api_client.post(IMPORT_URL, {"file": upload}, format="multipart")
        self.assertEqual(response.data["created"], 2)

        published = Review.objects.get(customer_name="r***a")
        self.assertTrue(published.is_approved)
        self.assertEqual(published.images, ["https://cdn.example.com/a.jpg"])
        self.assertEqual(timezone.localtime(published.created_at).date().isoformat(), "2025-03-04")
        # "Unpublished" in the file must not go live just because the default says so.
        self.assertFalse(Review.objects.get(customer_name="n***r").is_approved)

    def test_rows_for_unknown_products_are_reported_not_silently_dropped(self):
        upload = csv_upload(
            "product_slug,customer_name,rating,comment\n"
            "no-such-product,Layla,5,Great stuff.\n"
            "moisture-shampoo,Noor,5,Great stuff too.\n"
        )
        response = self.api_client.post(IMPORT_URL, {"file": upload}, format="multipart")
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["skipped_no_product"], 1)
        self.assertEqual(
            response.data["unmatched_products"], [{"value": "no-such-product", "rows": 1}]
        )

    def test_dry_run_reports_without_writing(self):
        upload = csv_upload(
            "product_slug,customer_name,rating,comment\nmoisture-shampoo,Layla,3,Cap leaks.\n"
        )
        response = self.api_client.post(
            IMPORT_URL, {"file": upload, "dry_run": "1"}, format="multipart"
        )
        self.assertEqual(response.data["created"], 1)
        self.assertTrue(response.data["dry_run"])
        self.assertFalse(Review.objects.filter(customer_name="Layla").exists())

    def test_a_file_with_no_product_column_is_refused_with_a_reason(self):
        upload = csv_upload("customer_name,rating,comment\nLayla,5,Great.\n")
        response = self.api_client.post(IMPORT_URL, {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertIn("product", response.data["detail"].lower())

    def test_unsupported_file_type_is_refused(self):
        upload = SimpleUploadedFile("reviews.pdf", b"%PDF-1.4 nonsense", content_type="application/pdf")
        response = self.api_client.post(IMPORT_URL, {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, 400)

    # ─── Bulk actions ────────────────────────────────────────────────────────

    def test_bulk_approve_selected_ids(self):
        response = self.api_client.post(
            BULK_URL, {"action": "approve", "ids": [self.pending.id]}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["changed"], 1)

        self.pending.refresh_from_db()
        self.assertTrue(self.pending.is_approved)
        self.powder.refresh_from_db()
        self.assertEqual(self.powder.review_count, 1)

    def test_bulk_unapprove_pulls_the_stars_back_off_the_product(self):
        self.shampoo.refresh_from_db()
        self.api_client.post(
            BULK_URL, {"action": "unapprove", "ids": [self.approved.id]}, format="json"
        )
        self.shampoo.refresh_from_db()
        self.assertEqual(self.shampoo.review_count, 0)

    def test_bulk_delete_removes_the_rows(self):
        response = self.api_client.post(
            BULK_URL, {"action": "delete", "ids": [self.approved.id, self.pending.id]}, format="json"
        )
        self.assertEqual(response.data["changed"], 2)
        self.assertEqual(Review.objects.count(), 0)

    def test_select_all_applies_to_everything_matching_the_filters(self):
        """Not just the 25 rows on screen — the filtered set, whatever its size."""
        Review.objects.create(
            product=self.shampoo, customer_name="Huda", rating=2, comment="Too runny.", is_approved=False
        )
        response = self.api_client.post(
            BULK_URL, {"action": "approve", "select_all": True, "status": "pending"}, format="json"
        )
        self.assertEqual(response.data["matched"], 2)
        self.assertFalse(Review.objects.filter(is_approved=False).exists())

    def test_bulk_with_no_selection_is_refused(self):
        response = self.api_client.post(BULK_URL, {"action": "approve", "ids": []}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_unknown_bulk_action_is_refused(self):
        response = self.api_client.post(
            BULK_URL, {"action": "destroy", "ids": [self.pending.id]}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    # ─── Permissions ─────────────────────────────────────────────────────────

    def test_a_signed_out_admin_gets_nothing(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get(EXPORT_URL).status_code, 401)
        self.assertEqual(anonymous.post(IMPORT_URL, {}, format="multipart").status_code, 401)
        self.assertEqual(anonymous.post(BULK_URL, {}, format="json").status_code, 401)
