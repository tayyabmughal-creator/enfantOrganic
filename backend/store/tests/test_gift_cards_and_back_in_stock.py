from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from store.api_serializers.admin_ops import AdminSiteSettingsSerializer
from store.models import (
    BackInStockRequest,
    Category,
    GiftCard,
    GiftCardRedemption,
    Product,
    ProductPrice,
    Region,
    SiteSettings,
)


def create_region(code="om", name="Oman", currency="OMR", *, is_default=True):
    return Region.objects.create(
        code=code,
        name_en=name,
        name_ar=name,
        currency_code=currency,
        shipping_fee=Decimal("2.00"),
        shipping_threshold=Decimal("0.00"),
        contact_phone="12345678",
        address_en=f"{name} Address",
        address_ar=f"{name} Address AR",
        is_default=is_default,
    )


def create_site_settings():
    return SiteSettings.objects.create(
        brand_name="Enfant Organics",
        announcement_en="Free delivery offers",
        announcement_ar="عروض توصيل",
        footer_about_en="Gentle baby care",
        footer_about_ar="عناية لطيفة",
        newsletter_title_en="Join our newsletter",
        newsletter_title_ar="اشترك في النشرة",
        newsletter_subtitle_en="Updates and offers",
        newsletter_subtitle_ar="تحديثات وعروض",
        instagram_title_en="Follow us",
        instagram_title_ar="تابعونا",
        instagram_cta_en="Instagram",
        instagram_cta_ar="إنستغرام",
        blog_title_en="Blog",
        blog_title_ar="المدونة",
        free_gift_title_en="Gift",
        free_gift_title_ar="هدية",
        free_gift_subtitle_en="Gift with order",
        free_gift_subtitle_ar="هدية مع الطلب",
    )


class GiftCardCheckoutTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.region = create_region()
        self.category = Category.objects.create(
            slug="baby-care",
            name_en="Baby Care",
            name_ar="عناية الطفل",
            image="https://example.com/category.jpg",
        )
        self.product = Product.objects.create(
            slug="daily-lotion",
            name_en="Daily Lotion",
            name_ar="لوشن يومي",
            short_description_en="Gentle care",
            short_description_ar="عناية لطيفة",
            description_en="Description",
            description_ar="وصف",
            category=self.category,
            image="https://example.com/product.jpg",
            is_published=True,
            track_inventory=False,
        )
        ProductPrice.objects.create(product=self.product, region=self.region, price=Decimal("5.00"))
        self.gift_card = GiftCard.objects.create(
            code="EOG-TEST-0001",
            initial_balance=Decimal("10.00"),
            remaining_balance=Decimal("10.00"),
            currency_code="OMR",
            region=self.region,
            status=GiftCard.STATUS_ACTIVE,
        )

    def _checkout_payload(self):
        return {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Test Customer",
                "email": "customer@example.com",
                "phone": "+96812345678",
                "address_line_1": "Street 1",
                "area": "Qurum",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "online",
            "coupon_code": "",
            "gift_card_code": self.gift_card.code,
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 1,
                    "selected_options_text": "",
                }
            ],
        }

    def test_gift_card_validation_endpoint_returns_redeemable_amount(self):
        response = self.client.post(
            "/api/gift-cards/validate/",
            {
                "region": self.region.code,
                "coupon_code": "",
                "gift_card_code": self.gift_card.code,
                "city": "Muscat",
                "area": "Qurum",
                "items": [{"slug": self.product.slug, "quantity": 1}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["valid"])
        self.assertEqual(response.data["gift_card_code"], self.gift_card.code)
        self.assertEqual(response.data["gift_card_amount"], "7.00")
        self.assertEqual(response.data["final_total"], "0.00")

    def test_online_checkout_creates_pending_redemption_without_deducting_balance(self):
        response = self.client.post("/api/checkout/", self._checkout_payload(), format="json")
        self.assertEqual(response.status_code, 201)

        self.gift_card.refresh_from_db()
        self.assertEqual(self.gift_card.remaining_balance, Decimal("10.00"))

        redemption = GiftCardRedemption.objects.get(order__order_number=response.data["order_number"])
        self.assertEqual(redemption.status, GiftCardRedemption.STATUS_PENDING)
        self.assertEqual(redemption.requested_amount, Decimal("7.00"))


class BackInStockRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.region = create_region()
        self.category = Category.objects.create(
            slug="baby-care-2",
            name_en="Baby Care",
            name_ar="عناية الطفل",
            image="https://example.com/category.jpg",
        )
        self.product = Product.objects.create(
            slug="out-of-stock-product",
            name_en="Out Product",
            name_ar="منتج",
            short_description_en="Gentle care",
            short_description_ar="عناية لطيفة",
            description_en="Description",
            description_ar="وصف",
            category=self.category,
            image="https://example.com/product.jpg",
            is_published=True,
            track_inventory=True,
            stock_quantity=0,
        )
        ProductPrice.objects.create(product=self.product, region=self.region, price=Decimal("3.00"))

    def test_create_and_block_duplicate_back_in_stock_request(self):
        payload = {
            "product_slug": self.product.slug,
            "region_code": self.region.code,
            "email": "notify@example.com",
            "phone": "+96811112222",
        }
        first = self.client.post("/api/stock-notify/", payload, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(BackInStockRequest.objects.count(), 1)

        second = self.client.post("/api/stock-notify/", payload, format="json")
        self.assertEqual(second.status_code, 400)
        self.assertIn("already requested", str(second.data))


class PaymentProviderStatusSerializerTests(TestCase):
    def test_admin_settings_serializer_exposes_provider_statuses(self):
        settings = create_site_settings()
        data = AdminSiteSettingsSerializer(settings).data

        self.assertIn("payment_provider_statuses", data)
        statuses = data["payment_provider_statuses"]
        self.assertIn("paytabs", statuses)
        self.assertIn("hyperpay", statuses)
        self.assertIn("thawani", statuses)
        self.assertIn("omannet", statuses)
        self.assertIn("status", statuses["paytabs"])
