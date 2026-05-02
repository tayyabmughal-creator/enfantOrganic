from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from rest_framework.test import APIClient

from store.models import Region, Category, Product, ProductPrice, Coupon, Order
from store.api_serializers.checkout import CheckoutCreateSerializer
from store.api_views.admin_ops import IsStaffUser

User = get_user_model()


class CheckoutAndPermsTestCase(TestCase):
    def setUp(self):
        self.region = Region.objects.create(
            code="om", 
            name_en="Oman", 
            currency_code="OMR", 
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Test Address",
            address_ar="Test Address AR"
        )
        self.category = Category.objects.create(slug="baby-food", name_en="Baby Food")
        self.product = Product.objects.create(
            slug="apple-puree",
            name_en="Apple Puree",
            category=self.category,
            track_inventory=True,
            stock_quantity=10,
            is_published=True,
        )
        self.price = ProductPrice.objects.create(
            product=self.product, region=self.region, price=Decimal("2.50")
        )
        self.coupon = Coupon.objects.create(
            code="DISCOUNT10",
            discount_type=Coupon.DISCOUNT_FIXED,
            value=Decimal("1.00"),
            is_active=True,
            minimum_subtotal=Decimal("0.00"),
        )
        self.factory = APIRequestFactory()
        self.api_client = APIClient()

    def coupon_validation_payload(self, coupon_code="DISCOUNT10", region=None, quantity=2):
        return {
            "region": region or self.region.code,
            "coupon_code": coupon_code,
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": quantity,
                }
            ],
        }

    def test_checkout_inventory_deduction_and_pricing(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Test User",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 2,
                }
            ],
        }

        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        
        order = serializer.save()

        # Check pricing (2 * 2.50 = 5.00 subtotal, + 2.00 shipping = 7.00 grand total)
        self.assertEqual(order.subtotal, Decimal("5.00"))
        self.assertEqual(order.shipping_total, Decimal("2.00"))
        self.assertEqual(order.discount_total, Decimal("0.00"))
        self.assertEqual(order.grand_total, Decimal("7.00"))

        # Check inventory deduction
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 8)

    def test_checkout_valid_coupon(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Test User",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "coupon_code": "DISCOUNT10",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 2,
                }
            ],
        }

        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        
        order = serializer.save()

        # Check pricing (5.00 subtotal - 1.00 discount + 2.00 shipping = 6.00 grand total)
        self.assertEqual(order.subtotal, Decimal("5.00"))
        self.assertEqual(order.discount_total, Decimal("1.00"))
        self.assertEqual(order.grand_total, Decimal("6.00"))

        # Check coupon used count
        self.coupon.refresh_from_db()
        self.assertEqual(self.coupon.used_count, 1)

    def test_checkout_email_failure_does_not_block_order(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Test User",
                "email": "customer@example.com",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 1,
                }
            ],
        }

        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with self.assertLogs("store.api_serializers.checkout", level="ERROR"):
            with patch("store.emails.send_mail", side_effect=Exception("SMTP unavailable")):
                order = serializer.save()

        self.assertEqual(order.customer_email, "customer@example.com")
        self.assertEqual(Order.objects.count(), 1)

    def test_checkout_invalid_coupon(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Test User",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "coupon_code": "FAKECOUPON",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 2,
                }
            ],
        }

        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError) as context:
            serializer.save()
            
        self.assertIn("coupon_code", context.exception.detail)

    def test_coupon_validation_endpoint_valid_coupon(self):
        response = self.api_client.post(
            "/api/coupons/validate/",
            self.coupon_validation_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["valid"])
        self.assertEqual(response.data["discount_amount"], "1.00")
        self.assertEqual(response.data["shipping_amount"], "2.00")
        self.assertEqual(response.data["final_total"], "6.00")

        self.coupon.refresh_from_db()
        self.assertEqual(self.coupon.used_count, 0)

    def test_coupon_validation_endpoint_invalid_coupon(self):
        response = self.api_client.post(
            "/api/coupons/validate/",
            self.coupon_validation_payload(coupon_code="FAKECOUPON"),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["valid"])
        self.assertIn("Invalid coupon", response.data["error"])

    def test_coupon_validation_endpoint_inactive_coupon(self):
        self.coupon.is_active = False
        self.coupon.save(update_fields=["is_active"])

        response = self.api_client.post(
            "/api/coupons/validate/",
            self.coupon_validation_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["valid"])
        self.assertIn("Invalid coupon", response.data["error"])

    def test_coupon_validation_endpoint_expired_coupon(self):
        self.coupon.ends_at = timezone.now() - timedelta(days=1)
        self.coupon.save(update_fields=["ends_at"])

        response = self.api_client.post(
            "/api/coupons/validate/",
            self.coupon_validation_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["valid"])
        self.assertIn("expired", response.data["error"])

    def test_coupon_validation_endpoint_minimum_subtotal(self):
        self.coupon.minimum_subtotal = Decimal("10.00")
        self.coupon.save(update_fields=["minimum_subtotal"])

        response = self.api_client.post(
            "/api/coupons/validate/",
            self.coupon_validation_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["valid"])
        self.assertIn("Minimum subtotal", response.data["error"])

    def test_coupon_validation_endpoint_region_mismatch(self):
        ae_region = Region.objects.create(
            code="ae",
            name_en="United Arab Emirates",
            currency_code="AED",
            shipping_fee=Decimal("12.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Test Address AE",
            address_ar="Test Address AR AE",
        )
        ProductPrice.objects.create(
            product=self.product, region=ae_region, price=Decimal("25.00")
        )
        self.coupon.regions.add(self.region)

        response = self.api_client.post(
            "/api/coupons/validate/",
            self.coupon_validation_payload(region=ae_region.code),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["valid"])
        self.assertIn("not valid for this region", response.data["error"])

    def test_order_detail_requires_email_or_phone(self):
        order = Order.objects.create(
            region=self.region,
            customer_name="Test User",
            customer_email="customer@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("7.00"),
            currency_code=self.region.currency_code,
        )

        response = self.api_client.get(f"/api/orders/{order.order_number}/")

        self.assertEqual(response.status_code, 404)

    def test_order_detail_allows_matching_email_or_phone(self):
        order = Order.objects.create(
            region=self.region,
            customer_name="Test User",
            customer_email="customer@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("7.00"),
            currency_code=self.region.currency_code,
        )

        email_response = self.api_client.get(
            f"/api/orders/{order.order_number}/",
            {"email_or_phone": "customer@example.com"},
        )
        phone_response = self.api_client.get(
            f"/api/orders/{order.order_number}/",
            {"email_or_phone": "12345678"},
        )
        wrong_response = self.api_client.get(
            f"/api/orders/{order.order_number}/",
            {"email_or_phone": "wrong@example.com"},
        )

        self.assertEqual(email_response.status_code, 200)
        self.assertEqual(phone_response.status_code, 200)
        self.assertEqual(wrong_response.status_code, 404)

    def test_is_staff_user_permission(self):
        permission = IsStaffUser()
        
        user = User.objects.create(username="normal", is_staff=False)
        request = self.factory.get("/")
        request.user = user
        self.assertFalse(permission.has_permission(request, None))

        staff_user = User.objects.create(username="staff", is_staff=True)
        request = self.factory.get("/")
        request.user = staff_user
        self.assertTrue(permission.has_permission(request, None))
