from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from store.models import Product, ProductPrice, ProductStock, Region, Warehouse


def _region(code, name, currency, fx, *, is_default=False):
    return Region.objects.create(
        code=code,
        name_en=name,
        currency_code=currency,
        fx_rate=fx,
        is_active=True,
        is_default=is_default,
        shipping_fee=Decimal("0.00"),
        shipping_threshold=Decimal("0.00"),
        contact_phone="12345678",
        address_en="Test Address",
    )


class OutOfStockProductsStayVisibleTestCase(TestCase):
    """A product with no stock in the region used to vanish from the storefront.

    It was published, priced and categorised, the admin panel showed it, and it
    could not be found anywhere on the site — including by searching for it by
    name. Stock now decides how a product is labelled and sorted, never whether
    it is listed.
    """

    def setUp(self):
        self.client_api = APIClient()
        self.region = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.warehouse = Warehouse.objects.create(
            code="om-main",
            name_en="Muscat",
            name_ar="مسقط",
            region=self.region,
            active=True,
        )

        self.in_stock = self._product("in-stock-lotion", "Stocked Lotion", track=True)
        ProductStock.objects.create(
            product=self.in_stock, warehouse=self.warehouse, quantity=25, reserved_quantity=0
        )

        # The exact shape the client hit: freshly created, published, priced,
        # tracked — and no stock row has been made for it yet.
        self.brand_new = self._product("mosquito-patch", "Mosquito Patch", track=True)

        self.untracked = self._product("untracked-wipes", "Untracked Wipes", track=False)

    def _product(self, slug, name, *, track):
        product = Product.objects.create(
            slug=slug, name_en=name, name_ar=name, is_published=True, track_inventory=track,
        )
        ProductPrice.objects.create(product=product, region=self.region, price=Decimal("5.000"))
        return product

    def _listed_slugs(self, response):
        return {row["slug"] for row in response.data}

    def test_a_product_with_no_stock_row_is_still_listed(self):
        response = self.client_api.get("/api/products/", {"region": "om"})

        self.assertEqual(response.status_code, 200)
        self.assertIn("mosquito-patch", self._listed_slugs(response))

    def test_a_product_with_no_stock_row_can_still_be_found_by_search(self):
        response = self.client_api.get("/api/products/", {"region": "om", "search": "mosquito"})

        self.assertEqual(response.status_code, 200)
        self.assertIn("mosquito-patch", self._listed_slugs(response))

    def test_a_product_with_no_stock_row_still_has_a_detail_page(self):
        response = self.client_api.get("/api/products/mosquito-patch/", {"region": "om"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["product"]["slug"], "mosquito-patch")
        # It is out of stock, not unavailable in this market.
        self.assertFalse(response.data["unavailable_for_region"])

    def test_the_listing_says_it_is_out_of_stock(self):
        response = self.client_api.get("/api/products/", {"region": "om"})
        rows = {row["slug"]: row for row in response.data}

        self.assertFalse(rows["mosquito-patch"]["stock_status"]["is_in_stock"])
        self.assertTrue(rows["in-stock-lotion"]["stock_status"]["is_in_stock"])

    def test_stocked_products_are_listed_ahead_of_unstocked_ones(self):
        response = self.client_api.get("/api/products/", {"region": "om"})
        slugs = [row["slug"] for row in response.data]

        self.assertLess(slugs.index("in-stock-lotion"), slugs.index("mosquito-patch"))

    def test_a_product_that_does_not_track_inventory_is_unaffected(self):
        response = self.client_api.get("/api/products/", {"region": "om"})
        rows = {row["slug"]: row for row in response.data}

        self.assertTrue(rows["untracked-wipes"]["stock_status"]["is_in_stock"])

    def test_stock_running_out_does_not_remove_a_product_from_the_catalogue(self):
        ProductStock.objects.filter(product=self.in_stock).update(quantity=0)

        response = self.client_api.get("/api/products/", {"region": "om"})
        rows = {row["slug"]: row for row in response.data}

        self.assertIn("in-stock-lotion", rows)
        self.assertFalse(rows["in-stock-lotion"]["stock_status"]["is_in_stock"])
