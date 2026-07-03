from decimal import Decimal

from django.test import TestCase

from store.api_serializers.catalog import ProductCardSerializer
from store.models import Product, ProductPrice, ProductStock, Region, Warehouse


class StockStatusLowStockTests(TestCase):
    """is_low_stock must never be True for an out-of-stock product."""

    def setUp(self):
        self.region = Region.objects.create(
            code="om",
            name_en="Oman",
            currency_code="OMR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Test Address",
            address_ar="Test Address AR",
        )
        self.product = Product.objects.create(
            slug="bye-bye-insect-repellent",
            name_en="Bye Bye Insect Repellent Lotion",
            track_inventory=True,
            stock_quantity=0,
            is_published=True,
        )
        ProductPrice.objects.create(
            product=self.product, region=self.region, price=Decimal("2.50")
        )

    def _stock_status(self):
        serializer = ProductCardSerializer(
            self.product, context={"region": self.region, "locale": "en"}
        )
        return serializer.data["stock_status"]

    def test_out_of_stock_product_is_not_low_stock(self):
        status = self._stock_status()
        self.assertFalse(status["is_in_stock"])
        self.assertFalse(status["is_low_stock"])

    def test_low_quantity_product_is_low_stock(self):
        Product.objects.filter(pk=self.product.pk).update(stock_quantity=3)
        self.product.refresh_from_db()
        status = self._stock_status()
        self.assertTrue(status["is_in_stock"])
        self.assertTrue(status["is_low_stock"])

    def test_high_quantity_product_is_not_low_stock(self):
        Product.objects.filter(pk=self.product.pk).update(stock_quantity=50)
        self.product.refresh_from_db()
        status = self._stock_status()
        self.assertTrue(status["is_in_stock"])
        self.assertFalse(status["is_low_stock"])

    def test_out_of_stock_warehouse_product_is_not_low_stock(self):
        warehouse = Warehouse.objects.create(
            code="om-main",
            name_en="Oman Main",
            name_ar="Oman Main",
            region=self.region,
            active=True,
        )
        ProductStock.objects.create(
            product=self.product,
            warehouse=warehouse,
            quantity=0,
            reserved_quantity=0,
            low_stock_threshold=10,
        )
        status = self._stock_status()
        self.assertFalse(status["is_in_stock"])
        self.assertFalse(status["is_low_stock"])

    def test_all_variants_out_of_stock_is_not_low_stock(self):
        Product.objects.filter(pk=self.product.pk).update(
            variants=[
                {"id": "v1", "title_en": "100ml", "price": "2.5", "stock_quantity": 0},
                {"id": "v2", "title_en": "200ml", "price": "4.5", "stock_quantity": 0},
            ]
        )
        self.product.refresh_from_db()
        status = self._stock_status()
        self.assertFalse(status["is_in_stock"])
        self.assertFalse(status["is_low_stock"])

    def test_low_stock_variant_is_low_stock(self):
        Product.objects.filter(pk=self.product.pk).update(
            variants=[
                {"id": "v1", "title_en": "100ml", "price": "2.5", "stock_quantity": 3},
                {"id": "v2", "title_en": "200ml", "price": "4.5", "stock_quantity": 0},
            ]
        )
        self.product.refresh_from_db()
        status = self._stock_status()
        self.assertTrue(status["is_in_stock"])
        self.assertTrue(status["is_low_stock"])
