from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase

from store.models import Category, Product, ProductPrice, Region


class EnsureRegionalProductPricesCommandTestCase(TestCase):
    def setUp(self):
        self.category = Category.objects.create(
            slug="baby-lotions",
            name_en="Baby Lotions",
            name_ar="لوشن الأطفال",
        )
        self.om = Region.objects.create(
            code="om",
            name_en="Oman",
            currency_code="OMR",
            shipping_threshold=Decimal("20.00"),
        )
        self.ae = Region.objects.create(
            code="ae",
            name_en="United Arab Emirates",
            currency_code="AED",
            shipping_threshold=Decimal("220.00"),
        )
        self.sa = Region.objects.create(
            code="sa",
            name_en="Saudi Arabia",
            currency_code="SAR",
            shipping_threshold=Decimal("220.00"),
        )
        self.product = Product.objects.create(
            slug="extra-mild-moisture-lotion",
            name_en="Existing Product",
            name_ar="منتج موجود",
            category=self.category,
        )
        ProductPrice.objects.create(
            product=self.product,
            region=self.om,
            price=Decimal("99.99"),
            compare_at_price=Decimal("120.00"),
            price_prefix_en="live",
            price_prefix_ar="مباشر",
            unit_price_text_en="existing",
            unit_price_text_ar="موجود",
        )

    def test_command_creates_only_missing_prices_and_is_idempotent(self):
        self.assertEqual(ProductPrice.objects.count(), 1)

        call_command("ensure_regional_product_prices")

        prices = {
            price.region.code: price
            for price in ProductPrice.objects.filter(product=self.product).select_related("region")
        }
        self.assertEqual(set(prices), {"om", "ae", "sa"})
        self.assertEqual(prices["om"].price, Decimal("99.99"))
        self.assertEqual(prices["om"].price_prefix_en, "live")
        self.assertEqual(prices["ae"].price, Decimal("42.00"))
        self.assertEqual(prices["sa"].price, Decimal("43.00"))

        call_command("ensure_regional_product_prices")
        self.assertEqual(ProductPrice.objects.filter(product=self.product).count(), 3)
