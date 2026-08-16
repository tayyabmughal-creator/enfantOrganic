"""Categories must come back in the order the admin numbered them.

Category is an OrderedModel, so Meta.ordering is ("sort_order", "id") — but
since Django 3.1 a GROUP BY query discards Meta.ordering, and both category
surfaces annotate a product count. The homepage therefore returned rows in
whatever order the database chose, and the header dropdown deliberately sorted
by product count, so the "Sort order" field on the Categories screen changed
nothing anywhere.
"""

from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from store.models import Category, Product, ProductPrice, Region, SiteSettings

# Deliberately created in an order that matches neither sort_order nor id, and
# given product counts that would sort differently again.
FIXTURES = [
    # (slug, name, sort_order, product_count)
    ("hot-deals", "Hot Deals", 14, 3),
    ("all-products", "All Products", 1, 5),
    ("baby-powder", "Baby Powder", 12, 1),
    ("baby-safe-cleaning", "Baby Safe Cleaning", 3, 2),
]


class CategoryOrderingTests(TestCase):
    def setUp(self):
        # HomePageView is @cache_page'd, and locmem survives between tests in a
        # run — without this every case after the first reads the first one's
        # response.
        cache.clear()
        self.api_client = APIClient()
        SiteSettings.objects.create()
        self.region = Region.objects.create(
            code="ae", name_en="UAE", name_ar="الإمارات", currency_code="AED",
            fx_rate=Decimal("1.000000"), is_active=True, is_default=True,
            shipping_fee=Decimal("2.00"), shipping_threshold=Decimal("0.00"),
            contact_phone="12345678", address_en="Dubai", address_ar="دبي",
        )
        for slug, name, sort_order, product_count in FIXTURES:
            category = Category.objects.create(slug=slug, name_en=name, name_ar=name, sort_order=sort_order)
            for index in range(product_count):
                product = Product.objects.create(
                    slug=f"{slug}-{index}", name_en=f"{name} {index}", name_ar=f"{name} {index}",
                    is_published=True, track_inventory=False,
                )
                product.categories.add(category)
                ProductPrice.objects.create(product=product, region=self.region, price=Decimal("5.00"))

    @property
    def expected(self):
        return [slug for slug, _, _, _ in sorted(FIXTURES, key=lambda row: row[2])]

    def test_the_homepage_carousel_follows_the_admins_numbers(self):
        response = self.api_client.get("/api/home/?locale=en&region=ae")

        self.assertEqual(response.status_code, 200)
        slugs = [row["slug"] for row in response.data["categories"]]
        self.assertEqual(slugs, self.expected)

    def test_the_header_dropdown_follows_the_admins_numbers(self):
        response = self.api_client.get("/api/navigation/?locale=en&region=ae")

        self.assertEqual(response.status_code, 200)
        slugs = [row["slug"] for row in response.data["menus"]["product_categories"]]
        self.assertEqual(slugs, self.expected)

    def test_the_product_count_survives_the_ordering(self):
        # Ordering by a field that is not in the GROUP BY is the classic way to
        # break the counts while fixing the sort.
        response = self.api_client.get("/api/home/?locale=en&region=ae")

        counts = {row["slug"]: row["product_count"] for row in response.data["categories"]}
        for slug, _, _, product_count in FIXTURES:
            self.assertEqual(counts[slug], product_count, slug)

    def test_renumbering_a_category_moves_it(self):
        Category.objects.filter(slug="hot-deals").update(sort_order=0)

        response = self.api_client.get("/api/home/?locale=en&region=ae")

        self.assertEqual(response.data["categories"][0]["slug"], "hot-deals")
