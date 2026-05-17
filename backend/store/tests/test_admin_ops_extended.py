import json
import os
from decimal import Decimal
from unittest.mock import patch

from django.conf import settings
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APIClient

from store.models import BlogPost, Order, Product, ProductStock, Warehouse, Region
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

