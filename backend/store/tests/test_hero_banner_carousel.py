"""The homepage banner is a multi-image carousel the admin fills itself.

It used to be a single ``HeroPromoCard`` with ``size="large"``, so running a
second promo meant re-uploading over the first one's artwork. These pin down the
admin CRUD the Hero Banner screen drives and the storefront payload the carousel
reads, including the ordering and visibility rules an admin relies on.
"""

from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from store.models import HeroBannerSlide, Region, SiteSettings
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

User = get_user_model()


def make_image_upload(name="banner.jpg", size=(12, 4)):
    buffer = BytesIO()
    Image.new("RGB", size, "green").save(buffer, format="JPEG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/jpeg")


class HeroBannerSlideAdminTests(TestCase):
    def setUp(self):
        ensure_default_admin_roles()
        self.api_client = APIClient()
        self.staff_user = User.objects.create_user(
            username="manager", password="Pass12345!", is_staff=True
        )
        self.staff_user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.api_client.force_authenticate(self.staff_user)

    def test_a_slide_is_created_from_an_upload(self):
        response = self.api_client.post(
            "/api/admin/hero-banner-slides/",
            {
                "image_file": make_image_upload(),
                "href": "/collections",
                "alt_text_en": "Hot deals",
                "sort_order": 0,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201, response.data)
        slide = HeroBannerSlide.objects.get()
        self.assertTrue(slide.image_file)
        self.assertEqual(slide.href, "/collections")
        self.assertTrue(slide.is_visible)
        # The panel renders straight from this, so it must be a usable URL and
        # not the bare storage path the ImageField would otherwise serialize.
        self.assertIn("/media/hero-banner/", response.data["image"])

    def test_an_upload_records_its_dimensions(self):
        # The storefront sizes the carousel from these, so an upload that does not
        # report its shape puts the banner back on the old fixed-height crop.
        response = self.api_client.post(
            "/api/admin/hero-banner-slides/",
            {"image_file": make_image_upload(size=(1920, 400))},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201, response.data)
        slide = HeroBannerSlide.objects.get()
        self.assertEqual((slide.image_width, slide.image_height), (1920, 400))
        self.assertEqual(response.data["image_width"], 1920)
        self.assertEqual(response.data["image_height"], 400)

    def test_website_and_mobile_artwork_keep_their_own_shapes(self):
        # The whole point of the split: a wide desktop banner alongside a tall
        # portrait one for phones, neither forced into the other's proportions.
        response = self.api_client.post(
            "/api/admin/hero-banner-slides/",
            {
                "image_file": make_image_upload("wide.jpg", size=(1920, 400)),
                "image_file_mobile": make_image_upload("tall.jpg", size=(1080, 1920)),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201, response.data)
        slide = HeroBannerSlide.objects.get()
        self.assertEqual((slide.image_width, slide.image_height), (1920, 400))
        self.assertEqual((slide.image_mobile_width, slide.image_mobile_height), (1080, 1920))

    def test_dimensions_cannot_be_set_by_hand(self):
        # They describe the file, so a client claiming otherwise must not be able
        # to make the carousel reserve the wrong height.
        slide = HeroBannerSlide.objects.create(image="https://cdn.test/a.jpg")

        response = self.api_client.patch(
            f"/api/admin/hero-banner-slides/{slide.id}/",
            {"image_width": 9999, "image_height": 1},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        slide.refresh_from_db()
        self.assertIsNone(slide.image_width)
        self.assertIsNone(slide.image_height)

    def test_mobile_artwork_can_be_added_to_an_existing_slide(self):
        # The panel offers this per row; without it the only way to give a live
        # slide a phone graphic was to delete it and lose its place in the deck.
        slide = HeroBannerSlide.objects.create(image_file=make_image_upload(size=(1920, 400)))

        response = self.api_client.patch(
            f"/api/admin/hero-banner-slides/{slide.id}/",
            {"image_file_mobile": make_image_upload("tall.jpg", size=(1080, 1920))},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200, response.data)
        slide.refresh_from_db()
        self.assertTrue(slide.image_file_mobile)
        self.assertEqual((slide.image_mobile_width, slide.image_mobile_height), (1080, 1920))
        # Replacing one image must leave the other one alone.
        self.assertEqual((slide.image_width, slide.image_height), (1920, 400))

    def test_a_slide_needs_artwork(self):
        response = self.api_client.post(
            "/api/admin/hero-banner-slides/",
            {"href": "/collections", "alt_text_en": "No image"},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("image", response.data)

    def test_a_slide_can_be_hidden_without_deleting_it(self):
        slide = HeroBannerSlide.objects.create(image="https://cdn.test/a.jpg")

        response = self.api_client.patch(
            f"/api/admin/hero-banner-slides/{slide.id}/",
            {"is_visible": False},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        slide.refresh_from_db()
        self.assertFalse(slide.is_visible)

    def test_a_slide_can_be_deleted(self):
        slide = HeroBannerSlide.objects.create(image="https://cdn.test/a.jpg")

        response = self.api_client.delete(f"/api/admin/hero-banner-slides/{slide.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(HeroBannerSlide.objects.exists())

    def test_the_list_follows_sort_order(self):
        HeroBannerSlide.objects.create(image="https://cdn.test/second.jpg", sort_order=5)
        HeroBannerSlide.objects.create(image="https://cdn.test/first.jpg", sort_order=1)

        response = self.api_client.get("/api/admin/hero-banner-slides/")

        self.assertEqual(response.status_code, 200)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual(
            [row["image"] for row in rows],
            ["https://cdn.test/first.jpg", "https://cdn.test/second.jpg"],
        )

    def test_staff_login_is_required(self):
        anonymous = APIClient()

        response = anonymous.get("/api/admin/hero-banner-slides/")

        self.assertIn(response.status_code, (401, 403))


class HeroBannerStorefrontTests(TestCase):
    def setUp(self):
        # HomePageView is @cache_page'd and locmem survives between tests, so
        # without this every case after the first reads the first one's response.
        cache.clear()
        self.api_client = APIClient()
        SiteSettings.objects.create()
        Region.objects.create(
            code="om", name_en="Oman", name_ar="عمان", currency_code="OMR",
            fx_rate=Decimal("1.000000"), is_active=True, is_default=True,
            shipping_fee=Decimal("2.00"), shipping_threshold=Decimal("0.00"),
            contact_phone="12345678", address_en="Muscat", address_ar="مسقط",
        )

    def get_slides(self, locale="en"):
        response = self.api_client.get("/api/home/", {"locale": locale, "region": "om"})
        self.assertEqual(response.status_code, 200)
        return response.data["hero_banner_slides"]

    def test_visible_slides_come_back_in_sort_order(self):
        HeroBannerSlide.objects.create(image="https://cdn.test/b.jpg", sort_order=2)
        HeroBannerSlide.objects.create(image="https://cdn.test/a.jpg", sort_order=1)

        self.assertEqual(
            [slide["image"] for slide in self.get_slides()],
            ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
        )

    def test_hidden_slides_are_left_out(self):
        HeroBannerSlide.objects.create(image="https://cdn.test/live.jpg")
        HeroBannerSlide.objects.create(image="https://cdn.test/hidden.jpg", is_visible=False)

        self.assertEqual([slide["image"] for slide in self.get_slides()], ["https://cdn.test/live.jpg"])

    def test_alt_text_follows_the_locale(self):
        HeroBannerSlide.objects.create(
            image="https://cdn.test/a.jpg", alt_text_en="Hot deals", alt_text_ar="عروض ساخنة",
        )

        self.assertEqual(self.get_slides("en")[0]["alt"], "Hot deals")
        self.assertEqual(self.get_slides("ar")[0]["alt"], "عروض ساخنة")

    def test_arabic_falls_back_to_english_alt_text(self):
        HeroBannerSlide.objects.create(image="https://cdn.test/a.jpg", alt_text_en="Hot deals")

        self.assertEqual(self.get_slides("ar")[0]["alt"], "Hot deals")

    def test_mobile_artwork_is_blank_when_unset(self):
        # Blank is the signal the frontend uses to reuse the desktop crop, so it
        # must not fall back to the desktop URL here.
        HeroBannerSlide.objects.create(image="https://cdn.test/a.jpg")

        self.assertEqual(self.get_slides()[0]["image_mobile"], "")

    def test_no_slides_means_an_empty_list(self):
        self.assertEqual(self.get_slides(), [])

    def test_artwork_dimensions_reach_the_storefront(self):
        # The carousel derives its aspect ratio from these during the server
        # render, so the banner reserves the right height on the first paint.
        HeroBannerSlide.objects.create(
            image_file=make_image_upload(size=(1920, 400)),
            image_file_mobile=make_image_upload("tall.jpg", size=(1080, 1920)),
        )

        slide = self.get_slides()[0]

        self.assertEqual(slide["image_width"], 1920)
        self.assertEqual(slide["image_height"], 400)
        self.assertEqual(slide["image_mobile_width"], 1080)
        self.assertEqual(slide["image_mobile_height"], 1920)

    def test_dimensions_are_null_for_a_url_only_slide(self):
        # Nothing to measure without a file — the frontend then keeps its default
        # banner shape rather than guessing one.
        HeroBannerSlide.objects.create(image="https://cdn.test/a.jpg")

        slide = self.get_slides()[0]

        self.assertIsNone(slide["image_width"])
        self.assertIsNone(slide["image_height"])
