from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from store.models import Category, Product, ProductPrice, ProductStock, Region, Warehouse


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


class RelatedProductsTestCase(TestCase):
    """"You may also like" offered the same four products on every product page."""

    def setUp(self):
        self.client_api = APIClient()
        self.region = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.category = Category.objects.create(slug="lotions", name_en="Lotions", name_ar="لوشن")
        self.subject = self._product("subject", "Subject", category=self.category)
        # Two in the subject's category, ten elsewhere: the category alone cannot
        # fill a row of eight.
        for index in range(2):
            self._product(f"same-cat-{index}", f"Same {index}", category=self.category)
        for index in range(10):
            self._product(f"other-{index}", f"Other {index}")

    def _product(self, slug, name, category=None):
        product = Product.objects.create(
            slug=slug, name_en=name, name_ar=name, is_published=True, track_inventory=False,
        )
        ProductPrice.objects.create(product=product, region=self.region, price=Decimal("5.000"))
        if category:
            product.categories.add(category)
        return product

    def _related(self):
        response = self.client_api.get("/api/products/subject/", {"region": "om"})
        self.assertEqual(response.status_code, 200)
        return [row["slug"] for row in response.data["related_products"]]

    def test_offers_eight_suggestions_not_four(self):
        self.assertEqual(len(self._related()), 8)

    def test_never_suggests_the_product_being_viewed(self):
        self.assertNotIn("subject", self._related())

    def test_tops_up_from_the_wider_catalogue_when_the_category_is_small(self):
        related = self._related()
        self.assertTrue(any(slug.startswith("other-") for slug in related))

    def test_suggestions_are_not_the_same_list_every_time(self):
        seen = {tuple(self._related()) for _ in range(12)}
        self.assertGreater(len(seen), 1)


class TopChoicesCollectionTestCase(TestCase):
    """Parents Top Choices had no collection, so its "View all" pointed at Best Sellers."""

    def setUp(self):
        self.client_api = APIClient()
        self.region = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.chosen = self._product("chosen", "Chosen", top_choice=True)
        self.other = self._product("ordinary", "Ordinary", top_choice=False)

    def _product(self, slug, name, *, top_choice):
        product = Product.objects.create(
            slug=slug, name_en=name, name_ar=name, is_published=True,
            track_inventory=False, show_in_top_choices=top_choice,
        )
        ProductPrice.objects.create(product=product, region=self.region, price=Decimal("5.000"))
        return product

    def test_the_collection_returns_only_top_choices(self):
        response = self.client_api.get(
            "/api/products/", {"region": "om", "collection": "top_choices"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["slug"] for row in response.data], ["chosen"])

    def test_the_collection_page_names_itself(self):
        response = self.client_api.get(
            "/api/catalog/", {"region": "om", "collection": "top_choices", "locale": "en"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["hero"]["title"], "Parents Top Choices")


class CartRecommendationsTestCase(TestCase):
    """An empty cart offered only "Continue shopping"; a full one suggested nothing."""

    def setUp(self):
        self.client_api = APIClient()
        self.region = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.hair = Category.objects.create(slug="hair", name_en="Hair", name_ar="شعر")
        self.wipes = Category.objects.create(slug="wipes", name_en="Wipes", name_ar="مناديل")

        self.shampoo = self._product("shampoo", "Shampoo", self.hair)
        self.conditioner = self._product("conditioner", "Conditioner", self.hair)
        self.oil = self._product("hair-oil", "Hair Oil", self.hair)
        for index in range(6):
            self._product(f"wipe-{index}", f"Wipe {index}", self.wipes)

    def _product(self, slug, name, category):
        product = Product.objects.create(
            slug=slug, name_en=name, name_ar=name, is_published=True, track_inventory=False,
        )
        ProductPrice.objects.create(product=product, region=self.region, price=Decimal("5.000"))
        product.categories.add(category)
        return product

    def _recommend(self, slugs="", limit=6):
        response = self.client_api.get(
            "/api/cart-recommendations/", {"region": "om", "slugs": slugs, "limit": limit}
        )
        self.assertEqual(response.status_code, 200)
        return [row["slug"] for row in response.data["products"]]

    def test_an_empty_cart_still_gets_suggestions(self):
        self.assertEqual(len(self._recommend()), 6)

    def test_never_suggests_what_is_already_in_the_cart(self):
        slugs = self._recommend(slugs="shampoo,conditioner")
        self.assertNotIn("shampoo", slugs)
        self.assertNotIn("conditioner", slugs)

    def test_prefers_the_categories_already_in_the_cart(self):
        # Only three hair products exist and one is in the cart, so the two
        # remaining ones must lead before wipes are used to top the row up.
        slugs = self._recommend(slugs="shampoo", limit=3)
        self.assertIn("conditioner", slugs)
        self.assertIn("hair-oil", slugs)

    def test_tops_up_beyond_a_small_category(self):
        slugs = self._recommend(slugs="shampoo", limit=6)
        self.assertEqual(len(slugs), 6)
        self.assertTrue(any(slug.startswith("wipe-") for slug in slugs))

    def test_limit_is_capped(self):
        self.assertLessEqual(len(self._recommend(limit=999)), 12)
