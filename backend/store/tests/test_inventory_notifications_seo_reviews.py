from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from store.models import AdminAuditLog, Product, ProductPrice, ProductStock, Region, Review, Warehouse
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles
from store.services.reviews import recalculate_product_review_aggregates
from store.services.sms_router import _normalize_phone


User = get_user_model()


def make_region(code, currency):
    return Region.objects.create(
        code=code,
        name_en=code.upper(),
        currency_code=currency,
        shipping_fee=Decimal("2.00"),
        shipping_threshold=Decimal("0.00"),
        contact_phone="12345678",
        address_en="Test Address",
    )


class InventoryNotificationsSeoReviewsTests(TestCase):
    def setUp(self):
        ensure_default_admin_roles()
        self.client = APIClient()
        self.staff_user = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="Pass12345!",
            is_staff=True,
        )
        self.staff_user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.om = make_region("om", "OMR")
        self.ae = make_region("ae", "AED")
        self.product = Product.objects.create(
            slug="regional-cream",
            name_en="Regional Cream",
            name_ar="كريم إقليمي",
            is_published=True,
            track_inventory=True,
            seo_title_en="Admin SEO title",
            seo_description_en="Admin SEO description",
            og_title_en="Admin OG title",
            og_description_en="Admin OG description",
            canonical_url="https://example.com/custom-canonical",
            meta_robots_index=False,
        )
        ProductPrice.objects.create(product=self.product, region=self.om, price=Decimal("3.00"))
        ProductPrice.objects.create(product=self.product, region=self.ae, price=Decimal("12.00"))
        self.om_warehouse = Warehouse.objects.create(
            code="om-main",
            name_en="Oman Main",
            name_ar="Oman Main",
            region=self.om,
            priority=1,
        )
        self.ae_warehouse = Warehouse.objects.create(
            code="ae-main",
            name_en="UAE Main",
            name_ar="UAE Main",
            region=self.ae,
            priority=1,
        )

    def test_admin_stock_update_rejects_below_reserved_and_logs_adjustment(self):
        self.client.force_authenticate(self.staff_user)
        stock = ProductStock.objects.create(
            product=self.product,
            warehouse=self.om_warehouse,
            quantity=5,
            reserved_quantity=2,
        )

        response = self.client.patch(
            f"/api/admin/product-stocks/{stock.pk}/",
            {"quantity": 1, "adjustment_reason": "bad count"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.patch(
            f"/api/admin/product-stocks/{stock.pk}/",
            {"quantity": 7, "adjustment_reason": "cycle count"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["quantity"], 7)
        self.assertEqual(response.data["reserved_quantity"], 2)
        self.assertEqual(response.data["available_quantity"], 5)
        self.assertTrue(
            AdminAuditLog.objects.filter(
                action="stock_adjusted",
                resource_type="product_stock",
                resource_id=str(stock.pk),
                after_snapshot__adjustment_reason="cycle count",
            ).exists()
        )

    def test_direct_regional_product_url_reports_out_of_stock_not_unavailable(self):
        ProductStock.objects.create(product=self.product, warehouse=self.om_warehouse, quantity=4)
        ProductStock.objects.create(product=self.product, warehouse=self.ae_warehouse, quantity=0)

        response = self.client.get("/api/products/regional-cream/", {"locale": "en", "region": "ae"})
        self.assertEqual(response.status_code, 200)
        # "Unavailable for region" means the market does not sell it. Running out
        # of stock is a different thing, and is reported by stock_status.
        self.assertFalse(response.data["unavailable_for_region"])
        self.assertFalse(response.data["product"]["stock_status"]["is_in_stock"])

    def test_a_product_not_sold_in_the_region_is_still_a_404_there(self):
        unsold = Product.objects.create(
            slug="oman-only-balm", name_en="Oman Only Balm", name_ar="بلسم", is_published=True,
        )
        ProductPrice.objects.create(product=unsold, region=self.om, price=Decimal("3.000"))

        response = self.client.get("/api/products/oman-only-balm/", {"locale": "en", "region": "ae"})
        self.assertEqual(response.status_code, 404)

    def test_product_detail_exposes_saved_seo_payload(self):
        ProductStock.objects.create(product=self.product, warehouse=self.om_warehouse, quantity=4)

        response = self.client.get("/api/products/regional-cream/", {"locale": "en", "region": "om"})
        self.assertEqual(response.status_code, 200)
        seo = response.data["product"]["seo"]
        self.assertEqual(seo["title"], "Admin SEO title")
        self.assertEqual(seo["description"], "Admin SEO description")
        self.assertEqual(seo["og_title"], "Admin OG title")
        self.assertFalse(seo["index"])

    def test_review_aggregates_use_approved_reviews_only(self):
        Review.objects.create(
            product=self.product,
            customer_name="Approved",
            rating=4,
            comment="Approved review",
            is_approved=True,
        )
        Review.objects.create(
            product=self.product,
            customer_name="Pending",
            rating=1,
            comment="Pending review",
            is_approved=False,
        )
        recalculate_product_review_aggregates(self.product.pk)
        self.product.refresh_from_db()
        self.assertEqual(self.product.review_count, 1)
        self.assertEqual(str(self.product.rating), "4.0")

    def test_region_phone_normalization(self):
        self.assertEqual(_normalize_phone("91234567", region_code="om"), "+96891234567")
        self.assertEqual(_normalize_phone("0501234567", region_code="ae"), "+971501234567")
        self.assertEqual(_normalize_phone("0501234567", region_code="sa"), "+966501234567")

    @override_settings(
        DEBUG=False,
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        DEFAULT_FROM_EMAIL="orders@example.com",
        EMAIL_HOST="smtp.example.com",
        EMAIL_PORT=587,
        EMAIL_HOST_USER="smtp-user",
        EMAIL_HOST_PASSWORD="smtp-pass",
        SMS_DEFAULT_PROVIDER="unifonic",
        UNIFONIC_APP_SID="app",
        UNIFONIC_SENDER_ID="ENFANT",
    )
    def test_notification_health_reports_configured_channels_without_secrets(self):
        self.client.force_authenticate(self.staff_user)
        response = self.client.get("/api/admin/notification-health/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["email"]["configured"])
        self.assertTrue(response.data["sms"]["configured"])
        self.assertNotIn("smtp-pass", str(response.data))
