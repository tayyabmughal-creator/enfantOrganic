import json
import os
from datetime import timedelta
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

from store.models import AnalyticsEvent, BlogPost, Category, HeroPromoCard, Order, OrderItem, Product, ProductStock, Warehouse, Region
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
        self.region_sa = Region.objects.create(
            code="sa",
            name_en="Saudi Arabia",
            currency_code="SAR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Test Address",
        )
        self.region_ae = Region.objects.create(
            code="ae",
            name_en="UAE",
            currency_code="AED",
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
        self.assertIn("payment_success_rate", response.data)
        self.assertEqual(response.data["payment_success_rate"], response.data["conversion_rate"])
        self.assertIn("analytics_currency_normalization", response.data)
        self.assertTrue(response.data["analytics_currency_normalization"].get("applied"))

        filtered = self.api_client.get(
            "/api/admin/dashboard/",
            {
                "top_metric": "orders",
                "top_date_range": "all_time",
                "top_market": "sa",
            },
        )
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(filtered.data.get("top_products_metric"), "orders")
        self.assertEqual(filtered.data.get("top_products_date_range"), "all_time")
        self.assertEqual(filtered.data.get("top_products_market"), "sa")
        self.assertEqual(filtered.data.get("currency_code"), "SAR")
        self.assertEqual(filtered.data.get("payment_success_rate"), filtered.data.get("conversion_rate"))
        self.assertFalse(filtered.data.get("analytics_currency_normalization", {}).get("applied"))

    def test_dashboard_repeat_rate_and_customer_counts_use_user_id_fallback(self):
        self.api_client.force_authenticate(self.staff_user)
        customer = User.objects.create_user(username="repeat-customer", password="Pass12345!")

        common_order_data = {
            "region": self.region,
            "user": customer,
            "customer_name": "Repeat Customer",
            "customer_email": "",
            "customer_phone": "12345678",
            "address_line_1": "Street 1",
            "city": "Muscat",
            "country": "Oman",
            "subtotal": Decimal("10.00"),
            "shipping_total": Decimal("0.00"),
            "grand_total": Decimal("10.00"),
            "currency_code": "OMR",
        }
        Order.objects.create(**common_order_data)
        Order.objects.create(**common_order_data)

        response = self.api_client.get("/api/admin/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("customers"), 1)
        self.assertEqual(response.data.get("repeat_rate"), 100.0)
        self.assertEqual(response.data.get("payment_success_rate"), response.data.get("conversion_rate"))

    def test_dashboard_all_time_conversion_breakdown_uses_all_historical_events(self):
        self.api_client.force_authenticate(self.staff_user)
        old_created_at = timezone.now() - timedelta(days=45)
        order = Order.objects.create(
            region=self.region,
            customer_name="Historical Customer",
            customer_email="historical@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("10.00"),
            shipping_total=Decimal("0.00"),
            grand_total=Decimal("10.00"),
            currency_code="OMR",
            payment_status=Order.PAYMENT_PAID,
        )
        Order.objects.filter(pk=order.pk).update(created_at=old_created_at, updated_at=old_created_at)
        for event_type in (
            AnalyticsEvent.EVENT_PAGE_VIEW,
            AnalyticsEvent.EVENT_ADD_TO_CART,
            AnalyticsEvent.EVENT_CHECKOUT_INITIATED,
        ):
            event = AnalyticsEvent.objects.create(
                event_type=event_type,
                session_key="historical-session-1",
                region=self.region,
            )
            AnalyticsEvent.objects.filter(pk=event.pk).update(created_at=old_created_at)

        response = self.api_client.get(
            "/api/admin/dashboard/",
            {"top_date_range": "all_time", "top_market": "om"},
        )

        self.assertEqual(response.status_code, 200)
        breakdown = response.data.get("conversion_breakdown") or {}
        steps = {step["key"]: step for step in breakdown.get("steps") or []}
        self.assertEqual(steps["sessions"]["count"], 1)
        self.assertEqual(steps["added_to_cart"]["count"], 1)
        self.assertEqual(steps["checkout"]["count"], 1)
        self.assertEqual(steps["completed"]["count"], 1)
        self.assertEqual(breakdown.get("overall_rate"), 100.0)
        self.assertIsNone(breakdown.get("overall_delta"))
        self.assertIn("All-time session-based funnel", breakdown.get("note", ""))
        health = response.data.get("analytics_health") or {}
        self.assertEqual(health.get("source"), "storefront_events")
        self.assertEqual(health.get("event_count"), 3)
        self.assertTrue(health.get("has_page_views"))
        self.assertTrue(health.get("has_checkout_events"))

    def test_dashboard_conversion_breakdown_surfaces_missing_event_collection(self):
        self.api_client.force_authenticate(self.staff_user)

        response = self.api_client.get("/api/admin/dashboard/", {"top_date_range": "all_time"})

        self.assertEqual(response.status_code, 200)
        breakdown = response.data.get("conversion_breakdown") or {}
        self.assertIn("No storefront analytics events were captured", breakdown.get("note", ""))
        health = response.data.get("analytics_health") or {}
        self.assertEqual(health.get("event_count"), 0)
        self.assertFalse(health.get("has_page_views"))

    def test_dashboard_repeat_purchase_metric_uses_user_id_fallback(self):
        self.api_client.force_authenticate(self.staff_user)
        customer = User.objects.create_user(username="repeat-product-user", password="Pass12345!")
        category = Category.objects.create(
            slug="repeat-products",
            name_en="Repeat Products",
            name_ar="Repeat Products",
            image="https://example.com/repeat.jpg",
        )
        product = Product.objects.create(
            slug="repeat-product",
            name_en="Repeat Product",
            name_ar="Repeat Product",
            category=category,
            is_published=True,
            stock_quantity=10,
        )
        common_order_data = {
            "region": self.region,
            "user": customer,
            "customer_name": "Repeat Customer",
            "customer_email": "",
            "customer_phone": "12345678",
            "address_line_1": "Street 1",
            "city": "Muscat",
            "country": "Oman",
            "subtotal": Decimal("5.00"),
            "shipping_total": Decimal("0.00"),
            "grand_total": Decimal("5.00"),
            "currency_code": "OMR",
            "payment_status": Order.PAYMENT_PAID,
        }
        order_one = Order.objects.create(**common_order_data)
        order_two = Order.objects.create(**common_order_data)

        for order in (order_one, order_two):
            OrderItem.objects.create(
                order=order,
                product=product,
                product_slug=product.slug,
                product_name=product.name_en,
                quantity=1,
                unit_price=Decimal("5.00"),
                line_total=Decimal("5.00"),
            )

        response = self.api_client.get("/api/admin/dashboard/", {"top_metric": "repeat_purchase"})
        self.assertEqual(response.status_code, 200)
        top_products = response.data.get("top_products") or []
        self.assertTrue(top_products)
        self.assertEqual(top_products[0].get("slug"), product.slug)
        self.assertEqual(top_products[0].get("repeat_purchase_count"), 1)
        self.assertEqual(top_products[0].get("metric_value"), 1)

    def test_dashboard_inventory_health_payload(self):
        self.api_client.force_authenticate(self.staff_user)
        category = Category.objects.create(
            slug="baby-care",
            name_en="Baby Care",
            name_ar="Baby Care",
            image="https://example.com/category.jpg",
        )
        Product.objects.create(slug="out", name_en="Out Product", name_ar="Out Product", category=category, track_inventory=True, stock_quantity=0)
        Product.objects.create(slug="critical", name_en="Critical Product", name_ar="Critical Product", category=category, track_inventory=True, stock_quantity=3)
        Product.objects.create(slug="low", name_en="Low Product", name_ar="Low Product", category=category, track_inventory=True, stock_quantity=8)
        Product.objects.create(slug="healthy", name_en="Healthy Product", name_ar="Healthy Product", category=category, track_inventory=True, stock_quantity=12)

        response = self.api_client.get("/api/admin/dashboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("inventory_health_threshold"), 10)
        self.assertEqual(response.data.get("inventory_health_count"), 3)
        rows = response.data.get("inventory_health_products")
        self.assertEqual([row["slug"] for row in rows], ["out", "critical", "low"])
        self.assertEqual([row["status_label"] for row in rows], ["Out of Stock", "Critical", "Low Stock"])

    def test_dashboard_sales_by_channel_payload(self):
        self.api_client.force_authenticate(self.staff_user)
        Order.objects.create(
            region=self.region,
            sales_channel=Order.SALES_CHANNEL_ONLINE_STORE,
            customer_name="Online Customer",
            customer_email="online@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("10.00"),
            shipping_total=Decimal("0.00"),
            grand_total=Decimal("10.00"),
            currency_code="OMR",
        )
        Order.objects.create(
            region=self.region,
            sales_channel=Order.SALES_CHANNEL_DRAFT_ORDER,
            customer_name="Draft Customer",
            customer_email="draft@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("0.00"),
            grand_total=Decimal("5.00"),
            currency_code="OMR",
        )

        response = self.api_client.get("/api/admin/dashboard/")

        self.assertEqual(response.status_code, 200)
        sales_by_channel = response.data.get("sales_by_channel")
        self.assertEqual(sales_by_channel.get("total_sales"), 15.0)
        self.assertEqual(sales_by_channel.get("total_orders"), 2)
        rows = {row["key"]: row for row in sales_by_channel.get("channels")}
        self.assertEqual(rows["online_store"]["orders"], 1)
        self.assertEqual(rows["online_store"]["sales"], 10.0)
        self.assertEqual(rows["draft_order"]["orders"], 1)
        self.assertEqual(rows["draft_order"]["sales"], 5.0)

    def test_analytics_api_exposes_regional_payload(self):
        self.api_client.force_authenticate(self.staff_user)

        response = self.api_client.get("/api/admin/analytics/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("regional_revenue", response.data)
        self.assertIn("region_om", response.data)
        self.assertIsInstance(response.data["region_om"], dict)
        self.assertEqual(response.data["region_om"].get("currency_code"), "OMR")
        self.assertIn("revenue_omr", response.data["region_om"])
        self.assertEqual(response.data.get("payment_success_rate"), response.data.get("conversion_rate"))
        normalization = response.data.get("analytics_currency_normalization", {})
        self.assertTrue(normalization.get("applied"))
        self.assertEqual(normalization.get("base_currency"), "OMR")
        self.assertIn("AED", normalization.get("rates_to_omr", {}))

    def test_dashboard_rating_metric_label_clarifies_sold_products_scope(self):
        self.api_client.force_authenticate(self.staff_user)
        category = Category.objects.create(
            slug="rated-products",
            name_en="Rated Products",
            name_ar="Rated Products",
            image="https://example.com/rated.jpg",
        )
        product = Product.objects.create(
            slug="rated-product",
            name_en="Rated Product",
            name_ar="Rated Product",
            category=category,
            is_published=True,
            rating=Decimal("4.9"),
            review_count=25,
        )
        order = Order.objects.create(
            region=self.region,
            customer_name="Rated Customer",
            customer_email="rated@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("10.00"),
            shipping_total=Decimal("0.00"),
            grand_total=Decimal("10.00"),
            currency_code="OMR",
            payment_status=Order.PAYMENT_PAID,
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            product_slug=product.slug,
            product_name=product.name_en,
            quantity=1,
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        )

        response = self.api_client.get("/api/admin/dashboard/", {"top_metric": "rating"})
        self.assertEqual(response.status_code, 200)
        top_products = response.data.get("top_products") or []
        self.assertTrue(top_products)
        self.assertEqual(top_products[0].get("metric_label"), "By rating (sold products)")

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
