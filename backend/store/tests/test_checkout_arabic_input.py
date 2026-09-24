from decimal import Decimal

from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from store.api_serializers.checkout import CheckoutCreateSerializer, resolve_shipping_rule
from store.models import AbandonedCart, Coupon, Order, Product, ProductPrice, Region, ShippingRule
from store.services.sms_router import _normalize_phone as sms_normalize_phone
from store.text_input import (
    is_valid_name,
    is_valid_phone,
    location_key,
    normalize_code,
    normalize_name,
    normalize_phone,
    to_ascii_digits,
)


class TextInputNormalisationTests(SimpleTestCase):
    def test_arabic_persian_and_fullwidth_digits_map_to_ascii(self):
        self.assertEqual(to_ascii_digits("٠١٢٣٤٥٦٧٨٩"), "0123456789")
        self.assertEqual(to_ascii_digits("۰۱۲۳۴۵۶۷۸۹"), "0123456789")
        self.assertEqual(to_ascii_digits("０１２３"), "0123")

    def test_phone_normalisation(self):
        cases = {
            "+٩٦٨ ٩١٢٣ ٤٥٦٧": "+968 9123 4567",
            "۰۳۰۰۱۲۳۴۵۶۷": "03001234567",
            "\u202a+968 9123 4567\u202c": "+968 9123 4567",  # pasted from contacts
            "+971\u00a050\u2011123\u20114567": "+971 50-123-4567",  # NBSP + non-breaking hyphen
            "＋９６８９１２３４５６７": "+96891234567",
            "  9123 4567  ": "9123 4567",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize_phone(raw), expected)
                self.assertTrue(is_valid_phone(normalize_phone(raw)))

    def test_phone_rejects_junk(self):
        for raw in ("--------", "(((( ))))", "1234567", "abcdefghij", "+968 1234 5678 9012 34", "9123+4567"):
            with self.subTest(raw=raw):
                self.assertFalse(is_valid_phone(normalize_phone(raw)))

    def test_names_in_english_and_arabic(self):
        for raw in (
            "Fatima Al-Balushi",
            "فاطمة البلوشي",
            "مُحَمَّد",
            "Sara O’Brien",  # iOS smart apostrophe
            "Ahmed (Abu Ali)",
            "Dr. Omar, Jr.",
            "\u200fعلي\u200f",
        ):
            with self.subTest(raw=raw):
                self.assertTrue(is_valid_name(normalize_name(raw)))
        for raw in ("<script>", "12345", "Ali 😀"):
            with self.subTest(raw=raw):
                self.assertFalse(is_valid_name(normalize_name(raw)))

    def test_codes_and_locations(self):
        self.assertEqual(normalize_code(" save١٠ "), "SAVE10")
        self.assertEqual(normalize_code("ＳＡＶＥ１０"), "SAVE10")
        self.assertEqual(location_key("مسقط"), location_key(" مَسْقَط "))
        self.assertEqual(location_key("السيب الجديدة"), location_key("السيب الجديده"))
        self.assertEqual(location_key("Al  Qurum"), location_key("al qurum"))

    def test_sms_normaliser_accepts_arabic_digits(self):
        self.assertEqual(sms_normalize_phone("٩١٢٣٤٥٦٧", region_code="om"), "+96891234567")


class CheckoutArabicInputTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(
            code="om",
            name_en="Oman",
            currency_code="OMR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
        )
        self.product = Product.objects.create(
            slug="apple-puree",
            name_en="Apple Puree",
            stock_quantity=10,
            is_published=True,
        )
        ProductPrice.objects.create(product=self.product, region=self.region, price=Decimal("2.50"))

    def _payload(self, **customer):
        base = {
            "name": "فاطمة البلوشي",
            "phone": "+٩٦٨ ٩١٢٣ ٤٥٦٧",
            "address_line_1": "شارع ١٨ نوفمبر",
            "city": "مسقط",
            "country": "عُمان",
        }
        base.update(customer)
        return {
            "region": "om",
            "locale": "ar",
            "customer": base,
            "payment_method": "cod",
            "items": [{"slug": self.product.slug, "quantity": 1}],
        }

    def test_order_with_arabic_digits_is_placed_and_stored_with_ascii_digits(self):
        serializer = CheckoutCreateSerializer(data=self._payload())
        self.assertTrue(serializer.is_valid(), serializer.errors)
        order = serializer.save()
        self.assertEqual(order.customer_phone, "+968 9123 4567")
        self.assertEqual(order.customer_name, "فاطمة البلوشي")

    def test_persian_digits_smart_apostrophe_and_fullwidth_email(self):
        serializer = CheckoutCreateSerializer(
            data=self._payload(
                name="Sara O’Brien",
                phone="\u202a۰۹۱۲۳۴۵۶۷۸\u202c",
                email="ｓａｒａ@example.com",
            )
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        order = serializer.save()
        self.assertEqual(order.customer_phone, "0912345678")
        self.assertEqual(order.customer_email, "sara@example.com")

    def test_invalid_phone_still_rejected(self):
        serializer = CheckoutCreateSerializer(data=self._payload(phone="--------"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("phone", serializer.errors["customer"])

    def test_coupon_typed_with_arabic_digits_applies(self):
        Coupon.objects.create(
            code="SAVE10",
            discount_type=Coupon.DISCOUNT_FIXED,
            value=Decimal("1.00"),
            is_active=True,
        )
        payload = self._payload()
        payload["coupon_code"] = "save١٠"
        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        order = serializer.save()
        self.assertEqual(order.coupon_code, "SAVE10")
        self.assertGreater(order.discount_total, Decimal("0.00"))

    def test_shipping_rule_matches_city_typed_with_diacritics(self):
        rule = ShippingRule.objects.create(
            region=self.region,
            city="مسقط",
            shipping_fee=Decimal("1.00"),
            active=True,
        )
        self.assertEqual(resolve_shipping_rule(self.region, Decimal("5.00"), city="مَسْقَط"), rule)

    def test_guest_lookup_and_abandoned_cart_accept_arabic_digits(self):
        order = CheckoutCreateSerializer(data=self._payload())
        self.assertTrue(order.is_valid(), order.errors)
        order = order.save()
        client = APIClient()

        from store.api_views.orders import find_order_for_guest

        self.assertEqual(
            find_order_for_guest(order.order_number, email_or_phone="+٩٦٨ ٩١٢٣ ٤٥٦٧"),
            order,
        )

        response = client.post(
            "/api/abandoned-carts/",
            {"session_token": "s-1", "customer_phone": "+٩٦٨ ٩١٢٣ ٤٥٦٧", "region": "om"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(AbandonedCart.objects.get(session_token="s-1").customer_phone, "+968 9123 4567")
        self.assertTrue(Order.objects.filter(customer_phone="+968 9123 4567").exists())
