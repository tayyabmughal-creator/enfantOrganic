import shutil
import tempfile
from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from store.api_serializers.localization import resolve_reviews_showcase
from store.models import Product, ProductPrice, Region, Review, SiteSettings
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

from store.api_serializers.catalog import resolve_page_sections
from store.domain_models.catalog import default_social_proof_items


class ResolvePageSectionsTests(SimpleTestCase):
    RAW = {
        "features": {
            "image": "https://cdn.example/f.jpg",
            "title_en": "Skin that bounces back.",
            "title_ar": "بشرة تستعيد نضارتها.",
            "items": [
                {"icon": "leaf", "title_en": "Natural", "title_ar": "طبيعي", "text_en": "Plant based", "text_ar": ""},
                {"icon": "not-an-icon", "title_en": "Gentle", "text_en": "Safe daily"},
                {"title_en": "", "text_en": ""},
                {"icon": "drop", "title_en": "Hydrating", "text_en": "24h"},
                {"icon": "heart", "title_en": "Loved", "text_en": "By parents"},
                {"icon": "star", "title_en": "Fifth", "text_en": "Dropped"},
            ],
        },
        "how_it_works": {
            "title_en": "How it works",
            "subtitle_en": "Three steps",
            "steps": [
                {"image_en": "https://cdn.example/s1-en.jpg", "image_ar": "https://cdn.example/s1-ar.jpg"},
                {"image_en": "https://cdn.example/s2-en.jpg"},
                {"image_en": ""},
            ],
        },
        "comparison": {
            "title_en": "How we stack up",
            "us_label_en": "Enfant",
            "other_label_en": "Others",
            "rows": [
                {"label_en": "Organic", "label_ar": "عضوي", "us": True, "other": False},
                {"label_en": "Tested", "us": True, "other": "Sometimes"},
                {"label_en": ""},
            ],
        },
    }

    def test_english_resolution(self):
        result = resolve_page_sections(self.RAW, "en")
        self.assertEqual(result["features"]["title"], "Skin that bounces back.")
        items = result["features"]["items"]
        self.assertEqual([i["title"] for i in items], ["Natural", "Gentle", "Hydrating", "Loved"])
        self.assertEqual(items[1]["icon"], "leaf")
        self.assertEqual(len(result["how_it_works"]["steps"]), 2)
        self.assertEqual(result["how_it_works"]["steps"][0]["image"], "https://cdn.example/s1-en.jpg")
        rows = result["comparison"]["rows"]
        self.assertEqual(len(rows), 2)
        self.assertIs(rows[0]["other"], False)
        self.assertEqual(rows[1]["other"], "Sometimes")

    def test_arabic_uses_arabic_values_with_english_fallback(self):
        result = resolve_page_sections(self.RAW, "ar")
        self.assertEqual(result["features"]["title"], "بشرة تستعيد نضارتها.")
        self.assertEqual(result["features"]["items"][0]["title"], "طبيعي")
        self.assertEqual(result["features"]["items"][1]["title"], "Gentle")
        self.assertEqual(result["how_it_works"]["steps"][0]["image"], "https://cdn.example/s1-ar.jpg")
        self.assertEqual(result["how_it_works"]["steps"][1]["image"], "https://cdn.example/s2-en.jpg")
        self.assertEqual(result["comparison"]["rows"][0]["label"], "عضوي")

    def test_disabled_and_malformed_sections_are_dropped(self):
        raw = {
            "features": {"enabled": False, "items": [{"title_en": "x"}]},
            "how_it_works": {"steps": "nope"},
            "comparison": {"rows": [None, 3]},
        }
        self.assertEqual(resolve_page_sections(raw, "en"), {})
        self.assertEqual(resolve_page_sections(None, "en"), {})
        self.assertEqual(resolve_page_sections([], "en"), {})

    def test_default_social_proof_items_match_client_doc(self):
        texts = [item["text_en"] for item in default_social_proof_items()]
        self.assertEqual(len(texts), 4)
        self.assertIn("300,000+ Happy parents", texts)
        self.assertIn("4.7 Average rating", texts)


class PageSectionsApiTests(TestCase):
    def setUp(self):
        ensure_default_admin_roles()
        self.client = APIClient()
        self.region = Region.objects.create(
            code="om",
            name_en="Oman",
            currency_code="OMR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Test Address",
        )
        self.product = Product.objects.create(
            slug="sections-cream",
            name_en="Sections Cream",
            name_ar="كريم",
            is_published=True,
            page_sections={
                "features": {"title_en": "Bounce", "items": [{"icon": "leaf", "title_en": "Natural", "text_en": "Yes"}]},
                "comparison": {"rows": [{"label_en": "Organic", "us": True, "other": False}]},
            },
        )
        ProductPrice.objects.create(product=self.product, region=self.region, price=Decimal("3.00"))

    def test_product_detail_returns_resolved_sections(self):
        response = self.client.get("/api/products/sections-cream/", {"locale": "en", "region": "om"})
        self.assertEqual(response.status_code, 200)
        sections = response.data["product"]["page_sections"]
        self.assertEqual(sections["features"]["items"][0]["title"], "Natural")
        self.assertEqual(sections["comparison"]["rows"][0]["label"], "Organic")
        self.assertNotIn("how_it_works", sections)

    def test_product_without_sections_returns_empty_object(self):
        Product.objects.filter(pk=self.product.pk).update(page_sections={})
        response = self.client.get("/api/products/sections-cream/", {"locale": "en", "region": "om"})
        self.assertEqual(response.data["product"]["page_sections"], {})

    def test_admin_can_save_sections_and_rejects_non_objects(self):
        user = get_user_model().objects.create_user(username="mgr", password="Pass12345!", is_staff=True)
        user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.client.force_authenticate(user)
        ok = self.client.patch(
            f"/api/admin/products/{self.product.slug}/",
            {"page_sections": {"how_it_works": {"steps": [{"image_en": "/media/x.jpg"}]}}},
            format="json",
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        self.product.refresh_from_db()
        self.assertIn("how_it_works", self.product.page_sections)
        bad = self.client.patch(f"/api/admin/products/{self.product.slug}/", {"page_sections": ["nope"]}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_navigation_exposes_social_proof_ticker(self):
        SiteSettings.objects.get_or_create(pk=1)
        response = self.client.get("/api/navigation/", {"locale": "en", "region": "om"})
        self.assertEqual(response.status_code, 200)
        texts = [item["text"] for item in response.data["settings"]["social_proof_items"]]
        self.assertIn("4.7 Average rating", texts)
        arabic = self.client.get("/api/navigation/", {"locale": "ar", "region": "om"})
        self.assertTrue(all(item["text"] for item in arabic.data["settings"]["social_proof_items"]))


class ReviewsShowcaseTests(TestCase):
    RAW = {
        "count_text_en": "20,000+ happy customers",
        "count_text_ar": "أكثر من 20,000 عميل سعيد",
        "title_en": "Real Reviews",
        "images": [
            {"image_en": "/media/en1.jpg", "image_ar": "/media/ar1.jpg"},
            {"image_en": "/media/en2.jpg"},
            {"image_en": ""},
            "bad",
        ],
        "photos": [{"image": "/media/p1.jpg"}, {"image": ""}, {"image": "/media/p2.jpg"}],
    }

    def test_resolves_language_specific_images_and_falls_back(self):
        en = resolve_reviews_showcase(self.RAW, "en")
        ar = resolve_reviews_showcase(self.RAW, "ar")
        self.assertEqual(en["images"], ["/media/en1.jpg", "/media/en2.jpg"])
        self.assertEqual(ar["images"], ["/media/ar1.jpg", "/media/en2.jpg"])
        self.assertEqual(ar["count_text"], "أكثر من 20,000 عميل سعيد")
        self.assertEqual(ar["title"], "Real Reviews")
        self.assertEqual(en["photos"], ["/media/p1.jpg", "/media/p2.jpg"])

    def test_disabled_or_invalid_is_empty(self):
        self.assertEqual(resolve_reviews_showcase({"enabled": False, "images": [{"image_en": "/x.jpg"}]}, "en"), {})
        self.assertEqual(resolve_reviews_showcase(None, "en"), {})
        self.assertEqual(resolve_reviews_showcase([], "en"), {})


class ReviewListApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.product = Product.objects.create(slug="rev-cream", name_en="Rev Cream", name_ar="كريم", is_published=True)
        self.hidden = Product.objects.create(slug="rev-hidden", name_en="Hidden", name_ar="مخفي", is_published=False)
        for index in range(15):
            Review.objects.create(
                product=self.product, customer_name=f"Mom {index}", rating=5 if index % 3 else 4,
                comment="Lovely", is_approved=True,
            )
        Review.objects.create(product=self.product, customer_name="Pending", rating=1, comment="x", is_approved=False)
        Review.objects.create(product=self.hidden, customer_name="Ghost", rating=5, comment="x", is_approved=True)

    def test_lists_only_approved_reviews_of_published_products_with_pagination(self):
        first = self.client.get("/api/reviews/all/", {"locale": "en"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["total"], 15)
        self.assertEqual(len(first.data["reviews"]), 12)
        self.assertTrue(first.data["has_next"])
        self.assertEqual(first.data["reviews"][0]["product"]["slug"], "rev-cream")
        second = self.client.get("/api/reviews/all/", {"locale": "en", "page": 2})
        self.assertEqual(len(second.data["reviews"]), 3)
        self.assertFalse(second.data["has_next"])
        names = {row["customer_name"] for row in first.data["reviews"] + second.data["reviews"]}
        self.assertNotIn("Pending", names)
        self.assertNotIn("Ghost", names)

    def test_page_size_is_capped_and_bad_params_are_tolerated(self):
        response = self.client.get("/api/reviews/all/", {"page_size": "9999", "page": "abc"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["page_size"], 30)

    def test_filter_by_product_and_localised_name(self):
        response = self.client.get("/api/reviews/all/", {"product": "rev-cream", "locale": "ar"})
        self.assertEqual(response.data["total"], 15)
        self.assertEqual(response.data["reviews"][0]["product"]["name"], "كريم")
        self.assertEqual(self.client.get("/api/reviews/all/", {"product": "nope"}).data["total"], 0)


def _image_file(name="photo.png", size=(64, 48), fmt="PNG", color=(200, 30, 30)):
    buffer = BytesIO()
    Image.new("RGB", size, color).save(buffer, format=fmt)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=f"image/{fmt.lower()}")


class ReviewPhotoUploadTests(TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        self.override = override_settings(MEDIA_ROOT=self.media, MEDIA_URL="/media/")
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.client = APIClient()
        self.product = Product.objects.create(slug="photo-cream", name_en="Photo Cream", name_ar="كريم", is_published=True)
        self.url = "/api/products/photo-cream/reviews/"
        self.fields = {"customer_name": "Sara", "rating": 5, "comment": "Lovely cream for baby skin."}

    def test_review_with_photos_is_stored_reencoded_and_waits_for_approval(self):
        response = self.client.post(
            self.url,
            {**self.fields, "images": [_image_file("a.png"), _image_file("b.jpg", fmt="JPEG")]},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        review = Review.objects.get(pk=response.data["id"])
        self.assertFalse(review.is_approved)
        self.assertEqual(len(review.images), 2)
        for url in review.images:
            self.assertTrue(url.startswith("/media/reviews/customer/"))
            self.assertTrue(url.endswith(".webp"))
        stored = [p for p in __import__("pathlib").Path(self.media, "reviews", "customer").glob("*.webp")]
        self.assertEqual(len(stored), 2)
        self.assertEqual(Image.open(stored[0]).format, "WEBP")

    def test_review_without_photos_still_works_as_json(self):
        response = self.client.post(self.url, self.fields, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Review.objects.get(pk=response.data["id"]).images, [])

    def test_too_many_photos_are_rejected_and_nothing_is_saved(self):
        files = [_image_file(f"{i}.png") for i in range(5)]
        response = self.client.post(self.url, {**self.fields, "images": files}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Review.objects.count(), 0)

    def test_non_image_is_rejected_and_good_photos_before_it_are_not_kept(self):
        bad = SimpleUploadedFile("evil.png", b"<?php echo 1; ?>", content_type="image/png")
        response = self.client.post(
            self.url, {**self.fields, "images": [_image_file("ok.png"), bad]}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("images", response.data)
        self.assertEqual(Review.objects.count(), 0)
        self.assertFalse(__import__("pathlib").Path(self.media, "reviews", "customer").exists())

    def test_oversized_photo_is_rejected(self):
        from store.services import review_photos

        original = review_photos.MAX_PHOTO_BYTES
        review_photos.MAX_PHOTO_BYTES = 100
        self.addCleanup(setattr, review_photos, "MAX_PHOTO_BYTES", original)
        response = self.client.post(self.url, {**self.fields, "images": [_image_file(size=(400, 400))]}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertIn("MB", str(response.data["images"][0]))

    def test_invalid_text_does_not_store_photos(self):
        response = self.client.post(
            self.url, {"customer_name": "S", "rating": 5, "comment": "x", "images": [_image_file()]}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(__import__("pathlib").Path(self.media, "reviews", "customer").exists())
