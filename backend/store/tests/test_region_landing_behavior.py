from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from store.api_serializers.catalog import ProductCardSerializer
from store.models import Category, Order, OrderItem, Product, ProductPrice, Region, SiteSettings


def create_region(code, name, currency, *, is_default=False):
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


class RegionDetectEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.om = create_region("om", "Oman", "OMR")
        self.ae = create_region("ae", "United Arab Emirates", "AED")
        self.sa = create_region("sa", "Saudi Arabia", "SAR", is_default=True)

    def test_detect_endpoint_uses_default_region_when_detection_fails(self):
        response = self.client.get(
            "/api/regions/detect/",
            REMOTE_ADDR="10.10.10.10",
            HTTP_X_FORWARDED_FOR="not-an-ip, 10.0.0.7",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["region_code"], "sa")
        self.assertEqual(response.data["source"], "default")
        self.assertNotIn("ip", response.data)
        self.assertNotIn("client_ip", response.data)

    def test_detect_endpoint_maps_supported_country_headers(self):
        response = self.client.get(
            "/api/regions/detect/",
            HTTP_CF_IPCOUNTRY="AE",
            HTTP_X_FORWARDED_FOR="203.0.113.7",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["region_code"], "ae")
        self.assertEqual(response.data["source"], "ip")
        self.assertEqual(response.data["country_code"], "AE")
        self.assertNotIn("client_ip", response.data)

    def test_detect_endpoint_falls_back_for_unsupported_country(self):
        response = self.client.get(
            "/api/regions/detect/",
            HTTP_CF_IPCOUNTRY="US",
            HTTP_X_REAL_IP="198.51.100.9",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["region_code"], "sa")
        self.assertEqual(response.data["source"], "default")


class StorefrontRegionBehaviorTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        create_site_settings()
        self.om = create_region("om", "Oman", "OMR", is_default=True)
        self.ae = create_region("ae", "United Arab Emirates", "AED")
        self.category = Category.objects.create(
            slug="baby-care",
            name_en="Baby Care",
            name_ar="عناية الطفل",
            image="https://example.com/category.jpg",
        )

    def create_product(self, slug, *, show_in_new_arrivals=False):
        return Product.objects.create(
            slug=slug,
            name_en=slug.replace("-", " ").title(),
            name_ar=slug,
            short_description_en="Gentle care",
            short_description_ar="عناية لطيفة",
            description_en="Description",
            description_ar="وصف",
            category=self.category,
            image="https://example.com/product.jpg",
            is_published=True,
            show_in_new_arrivals=show_in_new_arrivals,
        )

    def create_paid_order_with_item(self, product, *, quantity):
        order = Order.objects.create(
            region=self.om,
            customer_name="Test Customer",
            customer_email="customer@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("10.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("12.00"),
            currency_code=self.om.currency_code,
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_PAID,
            status=Order.STATUS_PAID,
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            product_slug=product.slug,
            product_name=product.name_en,
            quantity=quantity,
            unit_price=Decimal("2.00"),
            line_total=Decimal("2.00") * Decimal(quantity),
        )

    def test_product_card_serializer_does_not_fallback_to_other_region_price(self):
        product = self.create_product("oman-only")
        ProductPrice.objects.create(product=product, region=self.om, price=Decimal("2.50"))

        data = ProductCardSerializer(product, context={"locale": "en", "region": self.ae}).data

        self.assertIsNone(data["pricing"])

    def test_home_filters_products_without_selected_region_price(self):
        oman_only = self.create_product("oman-only", show_in_new_arrivals=True)
        ae_ready = self.create_product("uae-ready", show_in_new_arrivals=True)
        ProductPrice.objects.create(product=oman_only, region=self.om, price=Decimal("2.50"))
        ProductPrice.objects.create(product=ae_ready, region=self.ae, price=Decimal("10.00"))

        response = self.client.get("/api/home/", {"locale": "en", "region": "ae"})

        self.assertEqual(response.status_code, 200)
        new_arrivals = next(item for item in response.data["sections"] if item["key"] == "new-arrivals")
        slugs = [item["slug"] for item in new_arrivals["products"]]
        self.assertIn("uae-ready", slugs)
        self.assertNotIn("oman-only", slugs)

    def test_product_detail_404s_without_selected_region_price(self):
        product = self.create_product("oman-detail-only")
        ProductPrice.objects.create(product=product, region=self.om, price=Decimal("2.50"))

        response = self.client.get(
            f"/api/products/{product.slug}/",
            {"locale": "en", "region": "ae"},
        )

        self.assertEqual(response.status_code, 404)

    def test_catalog_collection_filter_returns_new_arrivals_only(self):
        new_product = self.create_product("new-product", show_in_new_arrivals=True)
        old_product = self.create_product("classic-product", show_in_new_arrivals=False)
        ProductPrice.objects.create(product=new_product, region=self.om, price=Decimal("3.25"))
        ProductPrice.objects.create(product=old_product, region=self.om, price=Decimal("4.50"))

        response = self.client.get(
            "/api/catalog/",
            {"locale": "en", "region": "om", "collection": "new_arrivals"},
        )

        self.assertEqual(response.status_code, 200)
        slugs = [item["slug"] for item in response.data["products"]]
        self.assertIn("new-product", slugs)
        self.assertNotIn("classic-product", slugs)

    def test_catalog_collection_filter_returns_best_sellers_from_paid_orders(self):
        top_product = self.create_product("top-seller")
        other_product = self.create_product("regular-seller")
        unsold_product = self.create_product("unsold-product")
        ProductPrice.objects.create(product=top_product, region=self.om, price=Decimal("5.00"))
        ProductPrice.objects.create(product=other_product, region=self.om, price=Decimal("5.00"))
        ProductPrice.objects.create(product=unsold_product, region=self.om, price=Decimal("5.00"))

        self.create_paid_order_with_item(top_product, quantity=5)
        self.create_paid_order_with_item(other_product, quantity=2)

        response = self.client.get(
            "/api/catalog/",
            {"locale": "en", "region": "om", "collection": "best_sellers"},
        )

        self.assertEqual(response.status_code, 200)
        slugs = [item["slug"] for item in response.data["products"]]
        self.assertEqual(slugs[:2], ["top-seller", "regular-seller"])
        self.assertNotIn("unsold-product", slugs)
