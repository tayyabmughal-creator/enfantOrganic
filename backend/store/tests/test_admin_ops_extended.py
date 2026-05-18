import json
import os
from decimal import Decimal
import tempfile
from unittest.mock import patch

from django.conf import settings
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from store.models import BlogPost, HeroPromoCard, Order, Product, ProductStock, Warehouse, Region
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

User = get_user_model()


class AdminOpsExtendedTestCase(TestCase):
    def setUp(self):
        ensure_default_admin_roles()
        self.api_client = APIClient()

        # Create a manager staff user with capabilities
        self.staff_user = User.objects.create_user(
            username="manager", password="Pass12345!", is_staff=True
        )
        manager_group = Group.objects.get(name=ROLE_MANAGER)
        self.staff_user.groups.add(manager_group)

        # Setup blog post
        self.blog_post = BlogPost.objects.create(
            slug="test-blog-post",
            title_en="Test Blog Post",
            body_en="Content here",
            is_published=True,
            published_at=timezone.now().date(),
        )

        self.region = Region.objects.create(
            code="om",
            name_en="Oman",
            currency_code="OMR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Test Address",
        )

    def test_blog_post_crud_and_pagination(self):
        self.api_client.force_authenticate(self.staff_user)

        # Test list endpoint (paginated)
        response = self.api_client.get("/api/admin/blog-posts/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["slug"], "test-blog-post")

        # Test retrieve endpoint
        response = self.api_client.get("/api/admin/blog-posts/test-blog-post/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title_en"], "Test Blog Post")

        # Test update endpoint
        response = self.api_client.patch(
            "/api/admin/blog-posts/test-blog-post/",
            {"title_en": "Updated Test Blog Post"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.blog_post.refresh_from_db()
        self.assertEqual(self.blog_post.title_en, "Updated Test Blog Post")

        # Test create endpoint
        response = self.api_client.post(
            "/api/admin/blog-posts/",
            {
                "slug": "new-post",
                "title_en": "New Post",
                "is_published": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(BlogPost.objects.filter(slug="new-post").exists())

        # Test delete endpoint
        response = self.api_client.delete("/api/admin/blog-posts/test-blog-post/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(BlogPost.objects.filter(slug="test-blog-post").exists())

    def test_dashboard_api(self):
        self.api_client.force_authenticate(self.staff_user)

        response = self.api_client.get("/api/admin/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("revenue", response.data)
        self.assertIn("orders", response.data)
        self.assertIn("revenue_delta", response.data)

    def test_token_refresh(self):
        # Authenticate and get token
        response = self.api_client.post(
            "/api/auth/token/",
            {"username": "manager", "password": "Pass12345!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("refresh", response.data)
        self.assertIn("access", response.data)

        refresh_token = response.data["refresh"]

        # Test refresh
        refresh_response = self.api_client.post(
            "/api/auth/token/refresh/",
            {"refresh": refresh_token},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, 200)
        self.assertIn("access", refresh_response.data)

    def test_admin_me_modules_drive_capabilities(self):
        self.api_client.force_authenticate(self.staff_user)
        response = self.api_client.get("/api/admin/me/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("orders.view", response.data.get("capabilities", []))
        self.assertTrue(response.data.get("modules", {}).get("orders", {}).get("view"))

    def test_guest_order_lookup_views_use_order_lookup_throttle_scope(self):
        from store.api_views.orders import GuestOrderLookupView, OrderDetailView

        self.assertEqual(GuestOrderLookupView.throttle_scope, "order_lookup")
        self.assertEqual(OrderDetailView.throttle_scope, "order_lookup")

    def test_order_lookup_throttle_rate_configured(self):
        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertIn("order_lookup", rates)
        self.assertTrue(rates["order_lookup"])

    def test_revalidation_secret_required_when_debug_off(self):
        from store.revalidation import RevalidationNotConfiguredError, get_revalidation_secret

        with patch.dict(os.environ, {"REVALIDATION_SECRET": ""}, clear=False):
            with self.settings(DEBUG=False):
                with self.assertRaises(RevalidationNotConfiguredError):
                    get_revalidation_secret(required=True)
            self.assertEqual(get_revalidation_secret(), "")

    def test_hero_promo_card_admin_api_supports_crud_and_image_upload(self):
        self.api_client.force_authenticate(self.staff_user)

        card = HeroPromoCard.objects.create(
            title_en="Hero Seed",
            title_ar="بطاقة رئيسية",
            subtitle_en="Seed subtitle",
            subtitle_ar="وصف",
            cta_en="Shop now",
            cta_ar="تسوق الآن",
            href="/collections",
            image="/enfant/extra-mild-moisture-lotion.jpg",
            size="small",
            accent="soft",
            sort_order=5,
        )

        list_response = self.api_client.get("/api/admin/hero-promo-cards/")
        self.assertEqual(list_response.status_code, 200)
        self.assertIn("results", list_response.data)
        self.assertEqual(list_response.data["results"][0]["title_en"], "Hero Seed")

        create_response = self.api_client.post(
            "/api/admin/hero-promo-cards/",
            {
                "title_en": "Gift Box Offer",
                "title_ar": "عرض صندوق الهدايا",
                "subtitle_en": "Gift bundles",
                "subtitle_ar": "باقات هدايا",
                "cta_en": "Explore",
                "cta_ar": "اكتشف",
                "href": "/collections",
                "image": "/enfant/complete-care-cream.jpg",
                "size": "large",
                "accent": "gift",
                "sort_order": 1,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertTrue(HeroPromoCard.objects.filter(title_en="Gift Box Offer").exists())

        with tempfile.TemporaryDirectory() as tmp_media:
            with override_settings(MEDIA_ROOT=tmp_media):
                image_bytes = (
                    b"GIF87a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00"
                    b"\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00"
                    b"\x00\x00\x01\x00\x01\x00\x00\x02\x02L\x01\x00;"
                )
                upload = SimpleUploadedFile("hero.gif", image_bytes, content_type="image/gif")
                update_response = self.api_client.patch(
                    f"/api/admin/hero-promo-cards/{card.id}/",
                    {"image_file": upload},
                    format="multipart",
                )

        self.assertEqual(update_response.status_code, 200)
        card.refresh_from_db()
        self.assertTrue(bool(card.image_file))
        self.assertIn("/media/hero-cards/", update_response.data["image"])
