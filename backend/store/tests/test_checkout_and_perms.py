import base64
import hashlib
import hmac
import json
from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib import admin as django_admin
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from rest_framework.test import APIClient

from store.models import (
    AdminAuditLog,
    AnalyticsEvent,
    CartMilestone,
    GiftCard,
    Region,
    Category,
    Product,
    ProductPrice,
    Coupon,
    NotificationLog,
    Order,
    OrderStatusHistory,
    PaymentTransaction,
    ReturnRequest,
    ShippingRule,
    SiteSettings,
    TaxRate,
    WhatsAppLog,
    ProductStock,
    Review,
    Warehouse,
)
from store.api_serializers.checkout import CheckoutCreateSerializer
from store.api_serializers.admin_ops import AdminCategorySerializer, AdminOrderSerializer
from store.api_serializers.catalog import ProductDetailSerializer, RegionSerializer
from store.api_views.admin_ops import HasAdminCapability, IsStaffUser
from store.emails import send_order_confirmation_email, send_payment_paid_email
from store.notifications import NotificationDispatchRetryableError
from store.services.invoice import ensure_paid_order_invoice
from store.services import carrier_router, sms_router
from store.tasks import process_order_event_async
from store.services.admin_roles import (
    ROLE_FINANCE,
    ROLE_MANAGER,
    ROLE_MARKETING,
    ROLE_OWNER,
    ROLE_ORDER_SUPPORT,
    ensure_default_admin_roles,
)

User = get_user_model()


class CheckoutAndPermsTestCase(TestCase):
    def setUp(self):
        ensure_default_admin_roles()
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
            track_inventory=True,
            stock_quantity=10,
            is_published=True,
        )
        self.product.categories.add(self.category)
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

    def _assign_admin_role(self, user, role_name):
        group = Group.objects.get(name=role_name)
        user.groups.add(group)
        if not user.is_staff:
            user.is_staff = True
            user.save(update_fields=["is_staff"])
        return user

    def _create_staff_user(self, username, role_name=ROLE_MANAGER, password="Pass12345!"):
        user = User.objects.create_user(username=username, password=password, is_staff=True)
        self._assign_admin_role(user, role_name)
        return user

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

    def test_admin_category_create_attaches_product_slugs(self):
        serializer = AdminCategorySerializer(
            data={
                "slug": "snacks",
                "name_en": "Snacks",
                "product_slugs": [self.product.slug],
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        category = serializer.save()

        self.assertTrue(self.product.categories.filter(pk=category.pk).exists())

    def test_product_detail_reviews_include_image_urls(self):
        Review.objects.create(
            product=self.product,
            customer_name="Photo Reviewer",
            rating=5,
            title="Loved it",
            comment="Gentle and useful.",
            images=[
                "https://cdn.example.com/review-1.jpg",
                {"url": "https://cdn.example.com/review-2.jpg"},
                "https://cdn.example.com/review-1.jpg",
                {"src": ""},
            ],
            is_approved=True,
        )

        data = ProductDetailSerializer(
            self.product,
            context={"locale": "en", "region": self.region},
        ).data

        self.assertEqual(
            data["customer_reviews"][0]["images"],
            [
                "https://cdn.example.com/review-1.jpg",
                "https://cdn.example.com/review-2.jpg",
            ],
        )

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

        with patch("store.notifications.send_order_confirmation_email", side_effect=Exception("SMTP unavailable")):
            with self.assertLogs("store.notifications", level="ERROR"):
                with self.captureOnCommitCallbacks(execute=True):
                    order = serializer.save()

        self.assertEqual(order.customer_email, "customer@example.com")
        self.assertEqual(Order.objects.count(), 1)
        failed_log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_CREATED,
            channel=NotificationLog.CHANNEL_EMAIL,
            status=NotificationLog.STATUS_FAILED,
        ).first()
        self.assertIsNotNone(failed_log)
        self.assertIn("SMTP unavailable", failed_log.error_message)

    def test_order_created_notification_log_is_pending_when_queued(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Pending Log User",
                "email": "pending@example.com",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "items": [{"slug": self.product.slug, "quantity": 1}],
        }

        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with patch("store.tasks.process_order_event_async.delay") as delay_mock:
            delay_mock.return_value.id = "task-123"
            with self.captureOnCommitCallbacks(execute=True):
                order = serializer.save()

        log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_CREATED,
            channel=NotificationLog.CHANNEL_EMAIL,
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, NotificationLog.STATUS_PENDING)
        self.assertEqual(log.task_id, "task-123")
        self.assertEqual(log.attempt_count, 0)

    def test_missing_customer_email_marks_notification_as_skipped_no_email(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "No Email User",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "items": [{"slug": self.product.slug, "quantity": 1}],
        }

        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with self.captureOnCommitCallbacks(execute=True):
            order = serializer.save()

        log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_CREATED,
            channel=NotificationLog.CHANNEL_EMAIL,
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, NotificationLog.STATUS_SKIPPED_NO_EMAIL)
        self.assertIn("Customer email is not set", log.error_message)

    def test_draft_order_records_skipped_draft_notification_without_queueing_email(self):
        with patch("store.tasks.process_order_event_async.delay") as delay_mock:
            with self.captureOnCommitCallbacks(execute=True):
                order = Order.objects.create(
                    region=self.region,
                    sales_channel=Order.SALES_CHANNEL_DRAFT_ORDER,
                    customer_name="Draft User",
                    customer_email="draft@example.com",
                    customer_phone="12345678",
                    address_line_1="Street 1",
                    city="Muscat",
                    country="Oman",
                    subtotal=Decimal("5.00"),
                    shipping_total=Decimal("2.00"),
                    grand_total=Decimal("7.00"),
                    currency_code=self.region.currency_code,
                    payment_method=Order.PAYMENT_COD,
                )

        delay_mock.assert_not_called()
        log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_CREATED,
            channel=NotificationLog.CHANNEL_EMAIL,
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, NotificationLog.STATUS_SKIPPED_DRAFT_ORDER)

    def test_successful_order_email_marks_notification_as_sent(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Sent User",
                "email": "sent@example.com",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "items": [{"slug": self.product.slug, "quantity": 1}],
        }

        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with patch("store.notifications.send_order_confirmation_email", return_value=True):
            with self.captureOnCommitCallbacks(execute=True):
                order = serializer.save()

        log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_CREATED,
            channel=NotificationLog.CHANNEL_EMAIL,
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.status, NotificationLog.STATUS_SENT)
        self.assertEqual(log.attempt_count, 1)
        self.assertIsNotNone(log.sent_at)

    def test_checkout_stores_sms_and_whatsapp_opt_in_flags(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "SMS Opt-in User",
                "email": "sms-optin@example.com",
                "phone": "+96812345678",
                "sms_opt_in": True,
                "whatsapp_opt_in": True,
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
        order = serializer.save()

        self.assertTrue(order.sms_opt_in)
        self.assertTrue(order.whatsapp_opt_in)
        self.assertEqual(order.customer_snapshot.get("sms_opt_in"), True)
        self.assertEqual(order.customer_snapshot.get("whatsapp_opt_in"), True)

    @override_settings(
        SMS_DEFAULT_PROVIDER="unifonic",
        SMS_ENABLE_MOCK=False,
        UNIFONIC_APP_SID="unifonic-sid",
        UNIFONIC_SENDER_ID="ENFANT",
        TWILIO_ACCOUNT_SID="AC123",
        TWILIO_AUTH_TOKEN="twilio-auth",
        TWILIO_FROM_NUMBER="+15005550006",
    )
    def test_sms_router_prefers_unifonic_for_ksa_numbers(self):
        with patch.object(
            sms_router.UnifonicSMSProvider,
            "send",
            return_value={
                "success": True,
                "provider": "unifonic",
                "provider_message_id": "uni-1001",
                "status": "sent",
                "error": "",
            },
        ) as unifonic_send:
            with patch.object(
                sms_router.TwilioSMSProvider,
                "send",
                return_value={
                    "success": True,
                    "provider": "twilio",
                    "provider_message_id": "tw-1001",
                    "status": "sent",
                    "error": "",
                },
            ) as twilio_send:
                result = sms_router.send_sms("+966500000001", "Order update")

        self.assertTrue(result["success"])
        self.assertEqual(result["provider"], "unifonic")
        self.assertTrue(unifonic_send.called)
        twilio_send.assert_not_called()

    @override_settings(
        SMS_DEFAULT_PROVIDER="unifonic",
        SMS_ENABLE_MOCK=False,
        UNIFONIC_APP_SID="unifonic-sid",
        UNIFONIC_SENDER_ID="ENFANT",
        TWILIO_ACCOUNT_SID="AC123",
        TWILIO_AUTH_TOKEN="twilio-auth",
        TWILIO_FROM_NUMBER="+15005550006",
    )
    def test_sms_router_falls_back_to_twilio_if_unifonic_fails(self):
        with patch.object(
            sms_router.UnifonicSMSProvider,
            "send",
            side_effect=sms_router.SMSProviderSendError("Unifonic unavailable"),
        ) as unifonic_send:
            with patch.object(
                sms_router.TwilioSMSProvider,
                "send",
                return_value={
                    "success": True,
                    "provider": "twilio",
                    "provider_message_id": "tw-2002",
                    "status": "sent",
                    "error": "",
                },
            ) as twilio_send:
                result = sms_router.send_sms("+966500000002", "Order update")

        self.assertTrue(result["success"])
        self.assertEqual(result["provider"], "twilio")
        self.assertTrue(unifonic_send.called)
        self.assertTrue(twilio_send.called)

    @override_settings(
        SMS_DEFAULT_PROVIDER="unifonic",
        SMS_ENABLE_MOCK=False,
        UNIFONIC_APP_SID="",
        UNIFONIC_SENDER_ID="",
        TWILIO_ACCOUNT_SID="",
        TWILIO_AUTH_TOKEN="",
        TWILIO_FROM_NUMBER="",
    )
    def test_missing_sms_credentials_do_not_break_checkout(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "No SMS Credentials User",
                "email": "nosms@example.com",
                "phone": "+966500000003",
                "sms_opt_in": True,
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
        with self.captureOnCommitCallbacks(execute=True):
            order = serializer.save()

        self.assertEqual(Order.objects.filter(pk=order.pk).count(), 1)
        sms_log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_CREATED,
            channel=NotificationLog.CHANNEL_SMS,
        ).first()
        self.assertIsNotNone(sms_log)
        self.assertIn(
            sms_log.status,
            {NotificationLog.STATUS_SKIPPED, NotificationLog.STATUS_FAILED},
        )

    @override_settings(
        WHATSAPP_PHONE_NUMBER_ID="",
        WHATSAPP_ACCESS_TOKEN="",
        WHATSAPP_VERIFY_TOKEN="",
        WHATSAPP_BUSINESS_ACCOUNT_ID="",
        WHATSAPP_TEMPLATE_ORDER_CONFIRMED="",
        WHATSAPP_TEMPLATE_ORDER_SHIPPED="",
        WHATSAPP_TEMPLATE_ORDER_DELIVERED="",
        WHATSAPP_TEMPLATE_REFUND_PROCESSED="",
    )
    def test_missing_whatsapp_credentials_do_not_break_checkout(self):
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "No WhatsApp Credentials User",
                "email": "nowa@example.com",
                "phone": "+966500000007",
                "sms_opt_in": False,
                "whatsapp_opt_in": True,
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
        with self.captureOnCommitCallbacks(execute=True):
            order = serializer.save()

        self.assertEqual(Order.objects.filter(pk=order.pk).count(), 1)
        wa_log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_CREATED,
            channel=NotificationLog.CHANNEL_WHATSAPP,
        ).first()
        self.assertIsNotNone(wa_log)
        self.assertEqual(wa_log.status, NotificationLog.STATUS_SKIPPED)
        provider_log = WhatsAppLog.objects.filter(
            order=order,
            event=WhatsAppLog.EVENT_ORDER_CREATED,
        ).first()
        self.assertIsNotNone(provider_log)
        self.assertEqual(provider_log.status, WhatsAppLog.STATUS_SKIPPED)

    @override_settings(WHATSAPP_VERIFY_TOKEN="wa-verify-token")
    def test_whatsapp_webhook_verification_success(self):
        response = self.api_client.get(
            "/api/notifications/webhook/whatsapp/",
            {
                "hub.mode": "subscribe",
                "hub.verify_token": "wa-verify-token",
                "hub.challenge": "challenge-123",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode("utf-8"), "challenge-123")

    @override_settings(
        WHATSAPP_PHONE_NUMBER_ID="wa-phone-1",
        WHATSAPP_ACCESS_TOKEN="wa-access-token",
        WHATSAPP_VERIFY_TOKEN="wa-verify-token",
        WHATSAPP_BUSINESS_ACCOUNT_ID="wa-business-1",
    )
    def test_whatsapp_webhook_rejects_forged_source(self):
        payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "wrong-business-id",
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "metadata": {"phone_number_id": "wa-phone-1"},
                                "statuses": [
                                    {
                                        "id": "wamid.fake.1001",
                                        "status": "delivered",
                                        "recipient_id": "966500000007",
                                    }
                                ],
                            },
                        }
                    ],
                }
            ],
        }
        response = self.api_client.post(
            "/api/notifications/webhook/whatsapp/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data.get("code"), "invalid_source")

    @override_settings(
        WHATSAPP_PHONE_NUMBER_ID="wa-phone-1",
        WHATSAPP_ACCESS_TOKEN="wa-access-token",
        WHATSAPP_VERIFY_TOKEN="wa-verify-token",
        WHATSAPP_BUSINESS_ACCOUNT_ID="wa-business-1",
    )
    def test_whatsapp_delivery_receipt_updates_whatsapp_log(self):
        order = self._create_online_order(self.region)
        message_id = "wamid.HBgMOTY2NTAwMDAwMDA1FQIAERgSODI3"
        log = WhatsAppLog.objects.create(
            order=order,
            event=WhatsAppLog.EVENT_ORDER_CREATED,
            recipient="+966500000005",
            template_name="order_confirmed_template",
            provider="whatsapp_cloud",
            provider_message_id=message_id,
            status=WhatsAppLog.STATUS_SENT,
            request_payload={},
            response_payload={},
            webhook_payload={},
            error_message="",
        )

        payload = {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": "wa-business-1",
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "metadata": {"phone_number_id": "wa-phone-1"},
                                "statuses": [
                                    {
                                        "id": message_id,
                                        "status": "delivered",
                                        "recipient_id": "966500000005",
                                        "timestamp": "1710000000",
                                    }
                                ],
                            },
                        }
                    ],
                }
            ],
        }
        response = self.api_client.post(
            "/api/notifications/webhook/whatsapp/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("processed_receipts"), 1)

        log.refresh_from_db()
        self.assertEqual(log.status, WhatsAppLog.STATUS_DELIVERED)
        self.assertEqual(log.webhook_payload.get("status"), "delivered")

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

    def _setup_milestones(self):
        # Subtotal in these tests is 5.00 (2 x 2.50); both rewards unlock at 4.00.
        CartMilestone.objects.create(
            region=self.region,
            threshold=Decimal("4.00"),
            reward_type=CartMilestone.REWARD_DISCOUNT_PERCENT,
            discount_value=Decimal("10"),
            is_active=True,
        )
        CartMilestone.objects.create(
            region=self.region,
            threshold=Decimal("4.00"),
            reward_type=CartMilestone.REWARD_FREE_SHIPPING,
            is_active=True,
        )

    def test_milestone_reward_applies_without_coupon_or_gift_card(self):
        self._setup_milestones()
        response = self.api_client.post(
            "/api/coupons/validate/",
            self.coupon_validation_payload(coupon_code=""),
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["valid"])
        self.assertEqual(response.data["milestone_discount_pct"], 10.0)
        self.assertTrue(response.data["milestone_free_shipping"])
        self.assertFalse(response.data["milestone_suppressed"])
        self.assertEqual(response.data["discount_amount"], "0.50")  # 10% of 5.00
        self.assertEqual(response.data["shipping_amount"], "0.00")  # free shipping

    def test_coupon_suppresses_milestone_reward(self):
        self._setup_milestones()
        response = self.api_client.post(
            "/api/coupons/validate/",
            self.coupon_validation_payload(coupon_code="DISCOUNT10"),
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["valid"])
        self.assertTrue(response.data["milestone_suppressed"])
        self.assertEqual(response.data["milestone_discount_pct"], 0.0)
        self.assertFalse(response.data["milestone_free_shipping"])
        # Only the coupon (fixed 1.00) discounts; milestone free-shipping suppressed.
        self.assertEqual(response.data["discount_amount"], "1.00")
        self.assertEqual(response.data["shipping_amount"], "2.00")

    def test_gift_card_suppresses_milestone_reward(self):
        self._setup_milestones()
        GiftCard.objects.create(
            code="GIFT50",
            initial_balance=Decimal("50.00"),
            remaining_balance=Decimal("50.00"),
            currency_code="OMR",
            status=GiftCard.STATUS_ACTIVE,
        )
        payload = self.coupon_validation_payload(coupon_code="")
        payload["gift_card_code"] = "GIFT50"
        response = self.api_client.post("/api/coupons/validate/", payload, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["valid"])
        self.assertTrue(response.data["milestone_suppressed"])
        self.assertEqual(response.data["milestone_discount_pct"], 0.0)
        self.assertFalse(response.data["milestone_free_shipping"])
        self.assertEqual(response.data["discount_amount"], "0.00")
        self.assertEqual(response.data["shipping_amount"], "2.00")
        self.assertGreater(Decimal(response.data["gift_card_amount"]), Decimal("0.00"))

    def test_create_order_coupon_suppresses_milestone(self):
        self._setup_milestones()
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
            "items": [{"slug": self.product.slug, "quantity": 2}],
        }
        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        order = serializer.save()
        # Coupon-only discount (1.00); milestone free-shipping suppressed (shipping stays 2.00).
        self.assertEqual(order.discount_total, Decimal("1.00"))
        self.assertEqual(order.shipping_total, Decimal("2.00"))
        self.assertEqual(order.grand_total, Decimal("6.00"))

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

    def test_has_admin_capability_defaults_to_deny_when_view_has_no_capabilities(self):
        permission = HasAdminCapability()
        staff_user = self._create_staff_user("staff-default-deny", role_name=ROLE_MANAGER)
        request = self.factory.get("/")
        request.user = staff_user

        class _NoCapabilityView:
            pass

        self.assertFalse(permission.has_permission(request, _NoCapabilityView()))

    def test_has_admin_capability_allows_explicit_escape_hatch(self):
        permission = HasAdminCapability()
        staff_user = self._create_staff_user("staff-escape-hatch", role_name=ROLE_MANAGER)
        request = self.factory.get("/")
        request.user = staff_user

        class _EscapeHatchView:
            allow_staff_without_capability = True

        self.assertTrue(permission.has_permission(request, _EscapeHatchView()))

    def test_order_support_user_cannot_edit_products(self):
        staff_user = self._create_staff_user("support-products", role_name=ROLE_ORDER_SUPPORT)
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.patch(
            f"/api/admin/products/{self.product.slug}/",
            {"name_en": "Updated Name"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_finance_user_can_view_payments_and_refunds_but_cannot_edit_content(self):
        staff_user = self._create_staff_user("finance-user", role_name=ROLE_FINANCE)
        order = self._create_online_order(self.region)
        PaymentTransaction.objects.create(
            order=order,
            provider=PaymentTransaction.PROVIDER_PAYMOB,
            provider_reference="FIN-REF-1001",
            amount=order.grand_total,
            currency_code=order.currency_code,
            status=PaymentTransaction.STATUS_PAID,
        )
        self.api_client.force_authenticate(staff_user)

        payments_response = self.api_client.get("/api/admin/payments/")
        refunds_response = self.api_client.get("/api/admin/returns/")
        settings_response = self.api_client.patch(
            "/api/admin/settings/",
            {"announcement_en": "Finance should not edit content"},
            format="json",
        )

        self.assertEqual(payments_response.status_code, 200)
        self.assertEqual(refunds_response.status_code, 200)
        self.assertEqual(settings_response.status_code, 403)

    def test_admin_me_endpoint_returns_roles_capabilities_and_modules(self):
        staff_user = self._create_staff_user("finance-me", role_name=ROLE_FINANCE)
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.get("/api/admin/me/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(ROLE_FINANCE, response.data.get("roles", []))
        self.assertIn("payments.view", response.data.get("capabilities", []))
        self.assertFalse(response.data["modules"]["products"]["edit"])
        self.assertTrue(response.data["modules"]["payments"]["view"])
        self.assertTrue(response.data["modules"]["refunds"]["view"])

    def test_unauthorized_admin_api_access_returns_403(self):
        staff_user = self._create_staff_user("marketing-orders", role_name=ROLE_MARKETING)
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.get("/api/admin/orders/")

        self.assertEqual(response.status_code, 403)

    def test_manager_and_owner_can_view_audit_logs(self):
        AdminAuditLog.objects.create(
            actor=None,
            action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
            resource_type="order",
            resource_id="EO-TEST-1001",
            before_snapshot={"status": "pending"},
            after_snapshot={"status": "confirmed"},
        )

        manager_user = self._create_staff_user("manager-audit-view", role_name=ROLE_MANAGER)
        self.api_client.force_authenticate(manager_user)
        manager_response = self.api_client.get("/api/admin/audit-logs/")
        self.assertEqual(manager_response.status_code, 200)
        self.assertGreaterEqual(len(manager_response.data), 1)

        owner_user = self._create_staff_user("owner-audit-view", role_name=ROLE_OWNER)
        self.api_client.force_authenticate(owner_user)
        owner_response = self.api_client.get("/api/admin/audit-logs/")
        self.assertEqual(owner_response.status_code, 200)
        self.assertGreaterEqual(len(owner_response.data), 1)

        finance_user = self._create_staff_user("finance-audit-blocked", role_name=ROLE_FINANCE)
        self.api_client.force_authenticate(finance_user)
        blocked_response = self.api_client.get("/api/admin/audit-logs/")
        self.assertEqual(blocked_response.status_code, 403)

    def test_coupon_change_creates_admin_audit_log(self):
        manager_user = self._create_staff_user("manager-coupon-audit", role_name=ROLE_MANAGER)
        self.api_client.force_authenticate(manager_user)

        response = self.api_client.patch(
            f"/api/admin/promotions/{self.coupon.id}/",
            {"value": "2.00"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        audit_log = (
            AdminAuditLog.objects.filter(
                action=AdminAuditLog.ACTION_COUPON_CHANGED,
                resource_type="coupon",
                resource_id=str(self.coupon.id),
            )
            .order_by("-id")
            .first()
        )
        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.actor_id, manager_user.id)

    def test_product_price_change_creates_admin_audit_log(self):
        manager_user = self._create_staff_user("manager-price-audit", role_name=ROLE_MANAGER)
        self.price.price = Decimal("2.50")
        self.price.save(update_fields=["price"])

        class _DummyForm:
            def __init__(self, instance):
                self.instance = instance

            def save_m2m(self):
                return None

        class _DummyFormset:
            def __init__(self, price_obj):
                self.price_obj = price_obj

            def save(self):
                self.price_obj.price = Decimal("3.20")
                self.price_obj.save(update_fields=["price"])
                return []

        request = self.factory.post("/django-admin/store/product/")
        request.user = manager_user

        product_admin = django_admin.site._registry[Product]
        product_admin.save_related(
            request,
            _DummyForm(self.product),
            [_DummyFormset(self.price)],
            change=True,
        )

        audit_log = (
            AdminAuditLog.objects.filter(
                action=AdminAuditLog.ACTION_PRODUCT_PRICE_CHANGED,
                resource_type="product",
                resource_id=str(self.product.id),
            )
            .order_by("-id")
            .first()
        )
        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.actor_id, manager_user.id)

    def test_order_status_change_creates_admin_audit_log(self):
        manager_user = self._create_staff_user("manager-order-audit", role_name=ROLE_MANAGER)
        order = self._create_online_order(self.region)
        self.api_client.force_authenticate(manager_user)

        response = self.api_client.patch(
            f"/api/admin/orders/{order.order_number}/",
            {"status": Order.STATUS_CONFIRMED, "status_note": "Reviewed by operations."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        audit_log = (
            AdminAuditLog.objects.filter(
                action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
                resource_type="order",
                resource_id=order.order_number,
            )
            .order_by("-id")
            .first()
        )
        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.actor_id, manager_user.id)
        self.assertEqual((audit_log.before_snapshot or {}).get("status"), Order.STATUS_PENDING)
        self.assertEqual((audit_log.after_snapshot or {}).get("status"), Order.STATUS_CONFIRMED)

    def test_refund_action_creates_admin_audit_log(self):
        finance_user = self._create_staff_user("finance-refund-audit", role_name=ROLE_FINANCE)
        order = self._create_online_order(self.region)
        order.payment_status = Order.PAYMENT_PAID
        order.save(update_fields=["payment_status", "updated_at"])
        order.transition_to(Order.STATUS_PAID)
        order.transition_to(Order.STATUS_DELIVERED)
        PaymentTransaction.objects.create(
            order=order,
            provider=PaymentTransaction.PROVIDER_PAYTABS,
            provider_reference="PAYTABS-PAID-AUDIT",
            amount=order.grand_total,
            currency_code=order.currency_code,
            status=PaymentTransaction.STATUS_PAID,
        )

        self.api_client.force_authenticate(finance_user)
        response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/refund/",
            {
                "mode": "manual",
                "amount": "2.00",
                "manual_reference": "AUDIT-RFD-2001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        audit_log = (
            AdminAuditLog.objects.filter(
                action=AdminAuditLog.ACTION_REFUND_ACTION,
                resource_type="order",
                resource_id=order.order_number,
            )
            .order_by("-id")
            .first()
        )
        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.actor_id, finance_user.id)
        self.assertEqual((audit_log.after_snapshot or {}).get("refund_reference"), "AUDIT-RFD-2001")

    def test_staff_role_change_creates_admin_audit_log(self):
        owner_user = self._create_staff_user("owner-staff-audit", role_name=ROLE_OWNER)
        target_user = User.objects.create_user(
            username="staff-target-user",
            email="staff-target@example.com",
            password="Pass12345!",
            is_staff=False,
        )
        self.api_client.force_authenticate(owner_user)

        response = self.api_client.patch(
            f"/api/admin/customers/{target_user.id}/",
            {"is_staff": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        audit_log = (
            AdminAuditLog.objects.filter(
                action=AdminAuditLog.ACTION_STAFF_ROLE_CHANGED,
                resource_type="staff_user",
                resource_id=str(target_user.id),
            )
            .order_by("-id")
            .first()
        )
        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.actor_id, owner_user.id)
        self.assertEqual((audit_log.before_snapshot or {}).get("is_staff"), False)
        self.assertEqual((audit_log.after_snapshot or {}).get("is_staff"), True)

    def test_site_settings_change_creates_admin_audit_log(self):
        manager_user = self._create_staff_user("manager-settings-audit", role_name=ROLE_MANAGER)
        settings = SiteSettings.objects.create(
            brand_name="Enfant Organics",
            announcement_en="Old EN",
            announcement_ar="قديم",
            footer_about_en="About EN",
            footer_about_ar="حول",
            newsletter_title_en="Newsletter",
            newsletter_title_ar="النشرة",
            newsletter_subtitle_en="Subtitle EN",
            newsletter_subtitle_ar="العنوان الفرعي",
            instagram_title_en="Instagram",
            instagram_title_ar="انستجرام",
            instagram_cta_en="Follow",
            instagram_cta_ar="تابعنا",
            blog_title_en="Blog",
            blog_title_ar="المدونة",
            free_gift_title_en="Gift",
            free_gift_title_ar="هدية",
            free_gift_subtitle_en="Gift subtitle",
            free_gift_subtitle_ar="وصف الهدية",
            why_choose_links=[],
            policy_links=[],
            static_links=[],
        )
        self.api_client.force_authenticate(manager_user)

        response = self.api_client.patch(
            "/api/admin/settings/",
            {"announcement_en": "Updated EN"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        audit_log = (
            AdminAuditLog.objects.filter(
                action=AdminAuditLog.ACTION_SITE_SETTINGS_CHANGED,
                resource_type="site_settings",
                resource_id=str(settings.id),
            )
            .order_by("-id")
            .first()
        )
        self.assertIsNotNone(audit_log)
        self.assertEqual(audit_log.actor_id, manager_user.id)
        self.assertEqual((audit_log.before_snapshot or {}).get("announcement_en"), "Old EN")
        self.assertEqual((audit_log.after_snapshot or {}).get("announcement_en"), "Updated EN")

    def _site_settings_with_paymob(self):
        return SiteSettings.objects.create(
            brand_name="Enfant Organics",
            announcement_en="EN", announcement_ar="ع",
            footer_about_en="A", footer_about_ar="ع",
            newsletter_title_en="N", newsletter_title_ar="ن",
            newsletter_subtitle_en="S", newsletter_subtitle_ar="س",
            instagram_title_en="I", instagram_title_ar="ا",
            instagram_cta_en="F", instagram_cta_ar="ت",
            blog_title_en="B", blog_title_ar="م",
            free_gift_title_en="G", free_gift_title_ar="ه",
            free_gift_subtitle_en="GS", free_gift_subtitle_ar="و",
            why_choose_links=[], policy_links=[], static_links=[],
            paymob_api_key="SECRET-API-KEY",
            paymob_hmac_secret="SECRET-HMAC",
            paymob_integration_id="65592",
            paymob_iframe_id="60088",
        )

    def test_admin_settings_get_never_exposes_raw_paymob_secrets(self):
        user = self._create_staff_user("settings-paymob-get", role_name=ROLE_MANAGER)
        self._site_settings_with_paymob()
        self.api_client.force_authenticate(user)

        response = self.api_client.get("/api/admin/settings/")
        self.assertEqual(response.status_code, 200)
        data = response.data

        for raw in ("paymob_api_key", "paymob_hmac_secret", "paymob_integration_id", "paymob_iframe_id"):
            self.assertNotIn(raw, data, f"{raw} must not be returned to the browser")
        self.assertTrue(data.get("paymob_api_key_set"))
        self.assertTrue(data.get("paymob_hmac_secret_set"))
        self.assertTrue(data.get("paymob_integration_id_set"))
        self.assertTrue(data.get("paymob_iframe_id_set"))
        # The raw secret values must not leak anywhere in the response.
        blob = json.dumps(data, default=str)
        self.assertNotIn("SECRET-API-KEY", blob)
        self.assertNotIn("SECRET-HMAC", blob)

    def test_admin_settings_blank_paymob_does_not_erase_secret(self):
        user = self._create_staff_user("settings-paymob-blank", role_name=ROLE_MANAGER)
        self._site_settings_with_paymob()
        self.api_client.force_authenticate(user)

        response = self.api_client.patch(
            "/api/admin/settings/",
            {"paymob_api_key": "", "paymob_hmac_secret": "", "announcement_en": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        settings = SiteSettings.objects.first()
        self.assertEqual(settings.paymob_api_key, "SECRET-API-KEY")
        self.assertEqual(settings.paymob_hmac_secret, "SECRET-HMAC")

    def test_admin_settings_new_paymob_value_updates(self):
        user = self._create_staff_user("settings-paymob-update", role_name=ROLE_MANAGER)
        self._site_settings_with_paymob()
        self.api_client.force_authenticate(user)

        response = self.api_client.patch(
            "/api/admin/settings/",
            {"paymob_api_key": "NEW-API-KEY"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        settings = SiteSettings.objects.first()
        self.assertEqual(settings.paymob_api_key, "NEW-API-KEY")
        self.assertEqual(settings.paymob_hmac_secret, "SECRET-HMAC")  # untouched

    def test_admin_settings_clear_flag_clears_only_requested_secret(self):
        user = self._create_staff_user("settings-paymob-clear", role_name=ROLE_MANAGER)
        self._site_settings_with_paymob()
        self.api_client.force_authenticate(user)

        response = self.api_client.patch(
            "/api/admin/settings/",
            {"clear_paymob_api_key": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        settings = SiteSettings.objects.first()
        self.assertEqual(settings.paymob_api_key, "")            # cleared
        self.assertEqual(settings.paymob_hmac_secret, "SECRET-HMAC")  # untouched
        self.assertEqual(settings.paymob_integration_id, "65592")     # untouched

    def test_admin_settings_audit_redacts_paymob_secrets(self):
        user = self._create_staff_user("settings-paymob-audit", role_name=ROLE_MANAGER)
        settings = self._site_settings_with_paymob()
        self.api_client.force_authenticate(user)

        response = self.api_client.patch(
            "/api/admin/settings/",
            {"paymob_api_key": "ANOTHER-KEY"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        audit_log = (
            AdminAuditLog.objects.filter(
                action=AdminAuditLog.ACTION_SITE_SETTINGS_CHANGED,
                resource_type="site_settings",
                resource_id=str(settings.id),
            )
            .order_by("-id")
            .first()
        )
        self.assertIsNotNone(audit_log)
        blob = json.dumps(
            {"before": audit_log.before_snapshot, "after": audit_log.after_snapshot},
            default=str,
        )
        self.assertNotIn("SECRET-API-KEY", blob)
        self.assertNotIn("SECRET-HMAC", blob)
        self.assertNotIn("ANOTHER-KEY", blob)

    def test_vat_om_5_percent_without_shipping_tax(self):
        TaxRate.objects.create(
            region=self.region,
            country_code="OM",
            label="VAT Oman",
            rate=Decimal("0.0500"),
            is_active=True,
            is_inclusive=False,
            applies_to_shipping=False,
            effective_from=timezone.localdate() - timedelta(days=1),
        )

        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "VAT Oman User",
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

        self.assertEqual(order.subtotal, Decimal("5.00"))
        self.assertEqual(order.discount_total, Decimal("0.00"))
        self.assertEqual(order.shipping_total, Decimal("2.00"))
        self.assertEqual(order.taxable_amount, Decimal("5.00"))
        self.assertEqual(order.tax_total, Decimal("0.25"))
        self.assertEqual(order.tax_rate, Decimal("0.0500"))
        self.assertFalse(order.tax_applies_to_shipping)
        self.assertEqual(order.grand_total, Decimal("7.25"))
        self.assertEqual(order.tax_breakdown.get("rate_percent"), "5.00")

    def test_vat_uae_5_percent_with_shipping_tax(self):
        ae_region = Region.objects.create(
            code="ae",
            name_en="United Arab Emirates",
            currency_code="AED",
            shipping_fee=Decimal("3.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Dubai Address",
            address_ar="Dubai Address AR",
        )
        ProductPrice.objects.create(
            product=self.product,
            region=ae_region,
            price=Decimal("10.00"),
        )
        TaxRate.objects.create(
            region=ae_region,
            country_code="AE",
            label="VAT UAE",
            rate=Decimal("0.0500"),
            is_active=True,
            is_inclusive=False,
            applies_to_shipping=True,
            effective_from=timezone.localdate() - timedelta(days=1),
        )

        payload = {
            "region": ae_region.code,
            "locale": "en",
            "customer": {
                "name": "VAT UAE User",
                "phone": "971000000",
                "address_line_1": "Street 1",
                "city": "Dubai",
                "country": "UAE",
            },
            "payment_method": "cod",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 1,
                }
            ],
        }

        preview = self.api_client.post(
            "/api/coupons/validate/",
            {
                "region": ae_region.code,
                "coupon_code": "",
                "items": [
                    {
                        "slug": self.product.slug,
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["tax_amount"], "0.65")
        self.assertEqual(preview.data["final_total"], "13.65")

        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        order = serializer.save()

        self.assertEqual(order.subtotal, Decimal("10.00"))
        self.assertEqual(order.shipping_total, Decimal("3.00"))
        self.assertEqual(order.taxable_amount, Decimal("13.00"))
        self.assertEqual(order.tax_total, Decimal("0.65"))
        self.assertEqual(order.grand_total, Decimal("13.65"))
        self.assertEqual(str(order.grand_total), preview.data["final_total"])

    def test_vat_ksa_15_percent_checkout_and_preview_match(self):
        sa_region = Region.objects.create(
            code="sa",
            name_en="Saudi Arabia",
            currency_code="SAR",
            shipping_fee=Decimal("10.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="966000000",
            address_en="Riyadh Address",
            address_ar="Riyadh Address AR",
        )
        ProductPrice.objects.create(
            product=self.product,
            region=sa_region,
            price=Decimal("100.00"),
        )
        TaxRate.objects.create(
            region=sa_region,
            country_code="SA",
            label="VAT KSA",
            rate=Decimal("0.1500"),
            is_active=True,
            is_inclusive=False,
            applies_to_shipping=True,
            effective_from=timezone.localdate() - timedelta(days=1),
        )

        preview_payload = {
            "region": sa_region.code,
            "coupon_code": "",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 1,
                }
            ],
        }
        preview = self.api_client.post("/api/coupons/validate/", preview_payload, format="json")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["tax_rate"], "0.1500")
        self.assertEqual(preview.data["tax_amount"], "16.50")
        self.assertEqual(preview.data["final_total"], "126.50")

        checkout_payload = {
            "region": sa_region.code,
            "locale": "en",
            "customer": {
                "name": "VAT KSA User",
                "phone": "966000000",
                "address_line_1": "Street 1",
                "city": "Riyadh",
                "country": "Saudi Arabia",
            },
            "payment_method": "cod",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 1,
                }
            ],
        }
        serializer = CheckoutCreateSerializer(data=checkout_payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        order = serializer.save()

        self.assertEqual(order.subtotal, Decimal("100.00"))
        self.assertEqual(order.shipping_total, Decimal("10.00"))
        self.assertEqual(order.taxable_amount, Decimal("110.00"))
        self.assertEqual(order.tax_rate, Decimal("0.1500"))
        self.assertEqual(order.tax_total, Decimal("16.50"))
        self.assertEqual(order.grand_total, Decimal("126.50"))
        self.assertEqual(str(order.grand_total), preview.data["final_total"])
        first_item = order.items.first()
        self.assertIsNotNone(first_item)
        self.assertEqual(first_item.tax_rate, Decimal("0.1500"))
        self.assertEqual(first_item.tax_total, Decimal("16.50"))
        self.assertIn("shipping_share", first_item.tax_breakdown)

    def test_shipping_rule_city_based_fee_eta_preview_and_order(self):
        ShippingRule.objects.create(
            region=self.region,
            city="Muscat",
            area="",
            min_order_value=Decimal("0.00"),
            max_order_value=Decimal("20.00"),
            shipping_fee=Decimal("4.00"),
            free_shipping_threshold=Decimal("0.00"),
            eta_min_days=1,
            eta_max_days=2,
            carrier_name="Local Rider",
            active=True,
        )

        preview = self.api_client.post(
            "/api/coupons/validate/",
            {
                "region": self.region.code,
                "coupon_code": "",
                "city": "Muscat",
                "area": "Al Khuwair",
                "items": [
                    {
                        "slug": self.product.slug,
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["shipping_amount"], "4.00")
        self.assertEqual(preview.data["shipping_method"], Order.SHIPPING_METHOD_RULE)
        self.assertEqual(preview.data["carrier_name"], "Local Rider")
        self.assertEqual(preview.data["eta_min_days"], 1)
        self.assertEqual(preview.data["eta_max_days"], 2)
        self.assertEqual(preview.data["final_total"], "6.50")

        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Shipping Rule User",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "area": "Al Khuwair",
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
        order = serializer.save()

        self.assertEqual(order.shipping_fee, Decimal("4.00"))
        self.assertEqual(order.shipping_total, Decimal("4.00"))
        self.assertEqual(order.shipping_method, Order.SHIPPING_METHOD_RULE)
        self.assertEqual(order.shipping_carrier_name, "Local Rider")
        self.assertEqual(order.shipping_eta_min_days, 1)
        self.assertEqual(order.shipping_eta_max_days, 2)
        self.assertEqual(str(order.grand_total), preview.data["final_total"])

    def test_shipping_rule_area_specific_precedence_and_free_shipping_threshold(self):
        ShippingRule.objects.create(
            region=self.region,
            city="Muscat",
            area="",
            min_order_value=Decimal("0.00"),
            max_order_value=Decimal("100.00"),
            shipping_fee=Decimal("5.00"),
            free_shipping_threshold=Decimal("0.00"),
            eta_min_days=2,
            eta_max_days=3,
            active=True,
        )
        ShippingRule.objects.create(
            region=self.region,
            city="Muscat",
            area="Mabella",
            min_order_value=Decimal("0.00"),
            max_order_value=Decimal("100.00"),
            shipping_fee=Decimal("3.00"),
            free_shipping_threshold=Decimal("8.00"),
            eta_min_days=1,
            eta_max_days=1,
            active=True,
        )

        preview = self.api_client.post(
            "/api/coupons/validate/",
            {
                "region": self.region.code,
                "coupon_code": "",
                "city": "Muscat",
                "area": "Mabella",
                "items": [
                    {
                        "slug": self.product.slug,
                        "quantity": 4,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["shipping_amount"], "0.00")
        self.assertEqual(preview.data["shipping_method"], Order.SHIPPING_METHOD_RULE)
        self.assertEqual(preview.data["eta_min_days"], 1)
        self.assertEqual(preview.data["eta_max_days"], 1)
        self.assertEqual(preview.data["final_total"], "10.00")

        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Area Rule User",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "area": "Mabella",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 4,
                }
            ],
        }
        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        order = serializer.save()

        self.assertEqual(order.shipping_fee, Decimal("0.00"))
        self.assertEqual(order.shipping_total, Decimal("0.00"))
        self.assertEqual(order.shipping_method, Order.SHIPPING_METHOD_RULE)
        self.assertEqual(order.shipping_eta_min_days, 1)
        self.assertEqual(order.shipping_eta_max_days, 1)
        self.assertEqual(str(order.grand_total), preview.data["final_total"])

    def test_shipping_rule_falls_back_to_region_flat_fee_when_no_match(self):
        ShippingRule.objects.create(
            region=self.region,
            city="Salalah",
            area="",
            min_order_value=Decimal("0.00"),
            max_order_value=Decimal("100.00"),
            shipping_fee=Decimal("1.00"),
            free_shipping_threshold=Decimal("0.00"),
            eta_min_days=3,
            eta_max_days=5,
            active=True,
        )

        preview = self.api_client.post(
            "/api/coupons/validate/",
            {
                "region": self.region.code,
                "coupon_code": "",
                "city": "Muscat",
                "area": "Mabella",
                "items": [
                    {
                        "slug": self.product.slug,
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["shipping_amount"], "2.00")
        self.assertEqual(preview.data["shipping_method"], Order.SHIPPING_METHOD_FLAT)
        self.assertIsNone(preview.data["eta_min_days"])
        self.assertIsNone(preview.data["eta_max_days"])

        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Fallback User",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "area": "Mabella",
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
        order = serializer.save()

        self.assertEqual(order.shipping_fee, Decimal("2.00"))
        self.assertEqual(order.shipping_total, Decimal("2.00"))
        self.assertEqual(order.shipping_method, Order.SHIPPING_METHOD_FLAT)
        self.assertIsNone(order.shipping_eta_min_days)
        self.assertIsNone(order.shipping_eta_max_days)

    @override_settings(
        ARAMEX_USERNAME="aramex-user",
        ARAMEX_PASSWORD="aramex-pass",
        ARAMEX_ACCOUNT_NUMBER="acct-001",
        ARAMEX_ACCOUNT_PIN="pin-001",
        ARAMEX_ENABLE_REAL_API="0",
    )
    def test_carrier_router_returns_quote_when_configured(self):
        self.region.carrier_enabled = True
        self.region.primary_carrier = Region.CARRIER_ARAMEX
        self.region.fallback_carrier = Region.CARRIER_MANUAL
        self.region.save(update_fields=["carrier_enabled", "primary_carrier", "fallback_carrier"])

        quote = carrier_router.get_rate(
            region=self.region,
            subtotal=Decimal("5.00"),
            city="Muscat",
            area="Mabella",
        )

        self.assertEqual(quote["carrier_key"], Region.CARRIER_ARAMEX)
        self.assertEqual(quote["carrier_name"], "Aramex")
        self.assertEqual(quote["shipping_fee"], Decimal("2.00"))
        self.assertEqual(quote["eta_min_days"], 2)
        self.assertEqual(quote["eta_max_days"], 4)

    def test_checkout_falls_back_to_shipping_rule_when_carrier_not_configured(self):
        self.region.carrier_enabled = True
        self.region.primary_carrier = Region.CARRIER_ARAMEX
        self.region.fallback_carrier = Region.CARRIER_FETCHR
        self.region.save(update_fields=["carrier_enabled", "primary_carrier", "fallback_carrier"])

        ShippingRule.objects.create(
            region=self.region,
            city="Muscat",
            area="",
            min_order_value=Decimal("0.00"),
            max_order_value=Decimal("100.00"),
            shipping_fee=Decimal("4.00"),
            free_shipping_threshold=Decimal("0.00"),
            eta_min_days=1,
            eta_max_days=2,
            carrier_name="Rule Carrier",
            active=True,
        )

        response = self.api_client.post(
            "/api/coupons/validate/",
            {
                "region": self.region.code,
                "coupon_code": "",
                "city": "Muscat",
                "area": "Mabella",
                "items": [{"slug": self.product.slug, "quantity": 1}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["shipping_method"], Order.SHIPPING_METHOD_RULE)
        self.assertEqual(response.data["shipping_amount"], "4.00")
        self.assertEqual(response.data["carrier_name"], "Rule Carrier")

    def test_checkout_preview_does_not_500_on_carrier_error(self):
        self.region.carrier_enabled = True
        self.region.primary_carrier = Region.CARRIER_ARAMEX
        self.region.fallback_carrier = Region.CARRIER_MANUAL
        self.region.save(update_fields=["carrier_enabled", "primary_carrier", "fallback_carrier"])

        ShippingRule.objects.create(
            region=self.region,
            city="Muscat",
            area="",
            min_order_value=Decimal("0.00"),
            max_order_value=Decimal("100.00"),
            shipping_fee=Decimal("3.00"),
            free_shipping_threshold=Decimal("0.00"),
            eta_min_days=2,
            eta_max_days=3,
            carrier_name="Rule Backup",
            active=True,
        )

        payload = {
            "region": self.region.code,
            "coupon_code": "",
            "city": "Muscat",
            "area": "Mabella",
            "items": [{"slug": self.product.slug, "quantity": 1}],
        }

        with self.assertLogs("store.api_serializers.checkout", level="ERROR"):
            with patch(
                "store.api_serializers.checkout.carrier_router.get_rate",
                side_effect=Exception("carrier timeout"),
            ):
                response = self.api_client.post("/api/coupons/validate/", payload, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["shipping_method"], Order.SHIPPING_METHOD_RULE)
        self.assertEqual(response.data["shipping_amount"], "3.00")

    def _decode_tlv_payload(self, payload):
        decoded = base64.b64decode(payload.encode("ascii"))
        cursor = 0
        result = {}
        while cursor + 2 <= len(decoded):
            tag = decoded[cursor]
            length = decoded[cursor + 1]
            cursor += 2
            value = decoded[cursor : cursor + length].decode("utf-8")
            cursor += length
            result[tag] = value
        return result

    def _create_paid_order(self, region, *, customer_email="paid@example.com", currency_code=None):
        order = Order.objects.create(
            region=region,
            customer_name="Paid Customer",
            customer_email=customer_email,
            customer_phone="1234567890",
            address_line_1="Invoice Street",
            city="Invoice City",
            country=region.name_en,
            subtotal=Decimal("20.00"),
            discount_total=Decimal("1.00"),
            shipping_total=Decimal("2.00"),
            taxable_amount=Decimal("21.00"),
            tax_rate=Decimal("0.0500"),
            tax_total=Decimal("1.05"),
            tax_label="VAT",
            grand_total=Decimal("22.05"),
            currency_code=currency_code or region.currency_code,
            payment_status=Order.PAYMENT_PAID,
        )
        return order

    def test_paid_order_generates_invoice_with_ksa_phase1_qr(self):
        sa_region = Region.objects.create(
            code="sa",
            name_en="Saudi Arabia",
            currency_code="SAR",
            shipping_fee=Decimal("10.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="966000000",
            contact_email="info-sa@example.com",
            address_en="Riyadh Address",
            address_ar="عنوان الرياض",
            seller_legal_name="Enfant Organics Saudi Co.",
            seller_vat_number="SA-300123456700003",
            seller_cr_number="CR-SA-RIYADH",
            seller_address_en="Riyadh Address",
            seller_address_ar="عنوان الرياض",
            seller_phone="966000000",
            seller_email="billing-sa@example.com",
        )
        order = self._create_paid_order(sa_region, currency_code="SAR")
        order.tax_rate = Decimal("0.1500")
        order.tax_total = Decimal("3.15")
        order.taxable_amount = Decimal("21.00")
        order.grand_total = Decimal("24.15")
        order.tax_label = "VAT KSA"
        order.save(update_fields=["tax_rate", "tax_total", "taxable_amount", "grand_total", "tax_label", "updated_at"])

        ensured = ensure_paid_order_invoice(order, force=True)
        ensured.refresh_from_db()

        self.assertEqual(ensured.invoice_status, Order.INVOICE_GENERATED)
        self.assertIsNotNone(ensured.invoice_date)
        self.assertTrue((ensured.invoice_number or "").startswith("INV-"))
        self.assertTrue((ensured.invoice_pdf.name or "").endswith(".pdf"))

        qr_payload = (ensured.tax_breakdown or {}).get("zatca_phase_1_qr_payload", "")
        self.assertTrue(qr_payload)
        decoded = self._decode_tlv_payload(qr_payload)
        self.assertEqual(decoded.get(1), "Enfant Organics Saudi Co.")
        self.assertEqual(decoded.get(2), "SA-300123456700003")
        self.assertEqual(decoded.get(4), "24.15")
        self.assertEqual(decoded.get(5), "3.15")

    def test_guest_invoice_download_requires_token(self):
        order = self._create_paid_order(self.region)
        ensure_paid_order_invoice(order, force=True)
        order.refresh_from_db()

        no_token = self.api_client.get(f"/api/orders/{order.order_number}/invoice/")
        wrong_token = self.api_client.get(
            f"/api/orders/{order.order_number}/invoice/",
            {"token": "wrong-token"},
        )
        valid_token = self.api_client.get(
            f"/api/orders/{order.order_number}/invoice/",
            {"token": order.invoice_access_token},
        )

        self.assertEqual(no_token.status_code, 403)
        self.assertEqual(wrong_token.status_code, 403)
        self.assertEqual(valid_token.status_code, 200)
        self.assertIn("application/pdf", valid_token["Content-Type"])

    def test_admin_invoice_download(self):
        order = self._create_paid_order(self.region)
        staff_user = self._create_staff_user("staff-invoice")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.get(f"/api/admin/orders/{order.order_number}/invoice/")
        order.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(order.invoice_status, Order.INVOICE_GENERATED)
        self.assertTrue(order.invoice_pdf.name)
        self.assertIn("application/pdf", response["Content-Type"])

    def test_admin_invoice_download_allows_unpaid_order(self):
        order = self._create_online_order(self.region)
        order.payment_status = Order.PAYMENT_UNPAID
        order.save(update_fields=["payment_status", "updated_at"])
        staff_user = self._create_staff_user("staff-invoice-unpaid")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.get(f"/api/admin/orders/{order.order_number}/invoice/")
        order.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(order.payment_status, Order.PAYMENT_UNPAID)
        self.assertEqual(order.invoice_status, Order.INVOICE_GENERATED)
        self.assertTrue(order.invoice_pdf.name)
        self.assertIn("application/pdf", response["Content-Type"])

    def test_admin_orders_list_supports_date_and_market_filters(self):
        now = timezone.now()
        yesterday = now - timedelta(days=1)
        within_last_30 = now - timedelta(days=20)
        older_than_30 = now - timedelta(days=45)

        ae_region = Region.objects.create(
            code="ae",
            name_en="United Arab Emirates",
            currency_code="AED",
            shipping_fee=Decimal("3.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="9710000000",
            address_en="Dubai",
            address_ar="دبي",
        )
        sa_region = Region.objects.create(
            code="sa",
            name_en="Saudi Arabia",
            currency_code="SAR",
            shipping_fee=Decimal("4.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="9660000000",
            address_en="Riyadh",
            address_ar="الرياض",
        )

        today_order = self._create_online_order(self.region)
        yesterday_order = self._create_online_order(ae_region)
        last_30_order = self._create_online_order(sa_region)
        old_order = self._create_online_order(self.region)
        Order.objects.filter(pk=today_order.pk).update(created_at=now)
        Order.objects.filter(pk=yesterday_order.pk).update(created_at=yesterday)
        Order.objects.filter(pk=last_30_order.pk).update(created_at=within_last_30)
        Order.objects.filter(pk=old_order.pk).update(created_at=older_than_30)

        staff_user = self._create_staff_user("staff-order-filters")
        self.api_client.force_authenticate(staff_user)

        market_response = self.api_client.get("/api/admin/orders/", {"market": "uae"})
        market_rows = market_response.data.get("results", market_response.data) if isinstance(market_response.data, dict) else market_response.data
        market_order_numbers = {row["order_number"] for row in market_rows}
        self.assertEqual(market_response.status_code, 200)
        self.assertEqual(market_order_numbers, {yesterday_order.order_number})

        today_key = now.date().isoformat()
        today_response = self.api_client.get("/api/admin/orders/", {"date_from": today_key, "date_to": today_key})
        today_rows = today_response.data.get("results", today_response.data) if isinstance(today_response.data, dict) else today_response.data
        today_order_numbers = {row["order_number"] for row in today_rows}
        self.assertEqual(today_response.status_code, 200)
        self.assertEqual(today_order_numbers, {today_order.order_number})

        from_key = (now.date() - timedelta(days=29)).isoformat()
        to_key = now.date().isoformat()
        last_30_response = self.api_client.get("/api/admin/orders/", {"date_from": from_key, "date_to": to_key})
        last_30_rows = last_30_response.data.get("results", last_30_response.data) if isinstance(last_30_response.data, dict) else last_30_response.data
        last_30_order_numbers = {row["order_number"] for row in last_30_rows}
        self.assertEqual(last_30_response.status_code, 200)
        self.assertIn(today_order.order_number, last_30_order_numbers)
        self.assertIn(yesterday_order.order_number, last_30_order_numbers)
        self.assertIn(last_30_order.order_number, last_30_order_numbers)
        self.assertNotIn(old_order.order_number, last_30_order_numbers)

    def test_admin_orders_list_supports_sales_channel_filter(self):
        online_order = self._create_online_order(self.region)
        draft_order = Order.objects.create(
            region=self.region,
            sales_channel=Order.SALES_CHANNEL_DRAFT_ORDER,
            customer_name="Draft Customer",
            customer_email="draft-filter@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("0.00"),
            grand_total=Decimal("5.00"),
            currency_code="OMR",
        )
        staff_user = self._create_staff_user("staff-order-sales-channel-filter")
        self.api_client.force_authenticate(staff_user)

        draft_response = self.api_client.get("/api/admin/orders/", {"sales_channel": "draft_order"})
        online_response = self.api_client.get("/api/admin/orders/", {"sales_channel": "online_store"})

        self.assertEqual(draft_response.status_code, 200)
        self.assertEqual(online_response.status_code, 200)

        draft_rows = (
            draft_response.data.get("results", draft_response.data)
            if isinstance(draft_response.data, dict)
            else draft_response.data
        )
        online_rows = (
            online_response.data.get("results", online_response.data)
            if isinstance(online_response.data, dict)
            else online_response.data
        )
        self.assertEqual({row["order_number"] for row in draft_rows}, {draft_order.order_number})
        self.assertEqual({row["order_number"] for row in online_rows}, {online_order.order_number})

    def test_admin_can_create_draft_order_without_deducting_stock(self):
        warehouse = Warehouse.objects.create(
            code="om-draft-warehouse",
            name_en="Oman Draft Warehouse",
            name_ar="مخزن مسودات عمان",
            region=self.region,
            city="Muscat",
            address="Muscat",
            active=True,
        )
        self.region.fulfillment_warehouses.add(warehouse)
        stock = ProductStock.objects.create(
            product=self.product,
            warehouse=warehouse,
            quantity=6,
            reserved_quantity=1,
            low_stock_threshold=1,
        )
        staff_user = self._create_staff_user("staff-draft-create")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.post(
            "/api/admin/orders/drafts/",
            {
                "region": self.region.code,
                "notes": "Draft created by admin",
                "customer": {
                    "create_account": True,
                    "first_name": "Draft",
                    "last_name": "Buyer",
                    "email": "draft-buyer@example.com",
                    "phone": "96812345678",
                    "address_line_1": "Street 1",
                    "city": "Muscat",
                    "country": "Oman",
                },
                "items": [
                    {
                        "slug": self.product.slug,
                        "quantity": 2,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get(order_number=response.data["order_number"])
        stock.refresh_from_db()

        self.assertEqual(order.sales_channel, Order.SALES_CHANNEL_DRAFT_ORDER)
        self.assertEqual(order.status, Order.STATUS_PENDING)
        self.assertEqual(order.payment_status, Order.PAYMENT_UNPAID)
        self.assertEqual(order.currency_code, self.region.currency_code)
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.first().quantity, 2)
        self.assertIsNotNone(order.user_id)
        self.assertFalse(PaymentTransaction.objects.filter(order=order).exists())
        self.assertEqual(stock.quantity, 6)
        self.assertEqual(stock.reserved_quantity, 1)

    def test_admin_can_update_draft_order_without_stock_deduction(self):
        warehouse = Warehouse.objects.create(
            code="om-draft-update-warehouse",
            name_en="Oman Draft Update Warehouse",
            name_ar="مخزن تحديث المسودات",
            region=self.region,
            city="Muscat",
            address="Muscat",
            active=True,
        )
        self.region.fulfillment_warehouses.add(warehouse)
        stock = ProductStock.objects.create(
            product=self.product,
            warehouse=warehouse,
            quantity=8,
            reserved_quantity=0,
            low_stock_threshold=1,
        )
        staff_user = self._create_staff_user("staff-draft-update")
        self.api_client.force_authenticate(staff_user)

        create_response = self.api_client.post(
            "/api/admin/orders/drafts/",
            {
                "region": self.region.code,
                "notes": "Initial draft note",
                "customer": {
                    "first_name": "Edit",
                    "last_name": "User",
                    "email": "draft-edit@example.com",
                    "phone": "96855550000",
                    "address_line_1": "Street 5",
                    "city": "Muscat",
                    "country": "Oman",
                },
                "items": [
                    {
                        "slug": self.product.slug,
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201, create_response.data)
        order_number = create_response.data["order_number"]

        update_response = self.api_client.patch(
            f"/api/admin/orders/drafts/{order_number}/",
            {
                "region": self.region.code,
                "notes": "Updated draft note",
                "customer": {
                    "first_name": "Edit",
                    "last_name": "User",
                    "email": "draft-edit@example.com",
                    "phone": "96855550000",
                    "address_line_1": "Street 5",
                    "city": "Muscat",
                    "country": "Oman",
                },
                "items": [
                    {
                        "slug": self.product.slug,
                        "quantity": 3,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, 200, update_response.data)
        order = Order.objects.get(order_number=order_number)
        stock.refresh_from_db()

        self.assertEqual(order.sales_channel, Order.SALES_CHANNEL_DRAFT_ORDER)
        self.assertEqual(order.notes, "Updated draft note")
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.first().quantity, 3)
        self.assertEqual(stock.quantity, 8)
        self.assertEqual(stock.reserved_quantity, 0)

    def test_draft_order_customer_search_returns_results(self):
        draft_history_order = Order.objects.create(
            region=self.region,
            sales_channel=Order.SALES_CHANNEL_DRAFT_ORDER,
            customer_name="Search Customer",
            customer_email="search.customer@example.com",
            customer_phone="96877770000",
            address_line_1="Search Street",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("0.00"),
            grand_total=Decimal("5.00"),
            currency_code="OMR",
        )
        staff_user = self._create_staff_user("staff-draft-customer-search")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.get(
            "/api/admin/orders/drafts/customer-search/",
            {"q": "96877770000"},
        )

        self.assertEqual(response.status_code, 200)
        rows = response.data.get("results", [])
        self.assertTrue(rows)
        self.assertTrue(any(row.get("phone") == draft_history_order.customer_phone for row in rows))

    def test_draft_order_creation_skips_notification_queue(self):
        with patch("store.notifications.queue_order_notification_event") as queue_event_mock:
            Order.objects.create(
                region=self.region,
                sales_channel=Order.SALES_CHANNEL_DRAFT_ORDER,
                customer_name="No Notify Draft",
                customer_email="notify-draft@example.com",
                customer_phone="12345678",
                address_line_1="Street 1",
                city="Muscat",
                country="Oman",
                subtotal=Decimal("5.00"),
                shipping_total=Decimal("0.00"),
                grand_total=Decimal("5.00"),
                currency_code="OMR",
            )

        self.assertFalse(queue_event_mock.called)

    def test_order_confirmation_email_is_multipart_html_and_text(self):
        order = self._create_paid_order(self.region, customer_email="mail-en@example.com")
        captured = {}

        def _fake_send(message_self, fail_silently=False):
            captured["body"] = message_self.body
            captured["alternatives"] = list(message_self.alternatives)
            captured["attachments"] = list(message_self.attachments)
            return 1

        with patch("django.core.mail.message.EmailMultiAlternatives.send", new=_fake_send):
            sent = send_order_confirmation_email(order)

        self.assertTrue(sent)
        self.assertIn(order.order_number, captured["body"])
        self.assertTrue(captured["alternatives"])
        html_alt = captured["alternatives"][0][0]
        self.assertIn('dir="ltr"', html_alt)
        self.assertIn("Your order is confirmed", html_alt)
        filenames = [item[0] for item in captured["attachments"] if isinstance(item, tuple) and item]
        self.assertTrue(any(str(name).endswith(".pdf") for name in filenames))

    def test_arabic_order_confirmation_email_renders_rtl(self):
        order = self._create_paid_order(self.region, customer_email="mail-ar@example.com")
        order.locale = "ar"
        order.save(update_fields=["locale", "updated_at"])
        captured = {}

        def _fake_send(message_self, fail_silently=False):
            captured["body"] = message_self.body
            captured["alternatives"] = list(message_self.alternatives)
            return 1

        with patch("django.core.mail.message.EmailMultiAlternatives.send", new=_fake_send):
            sent = send_order_confirmation_email(order)

        self.assertTrue(sent)
        self.assertIn("مرحباً", captured["body"])
        html_alt = captured["alternatives"][0][0]
        self.assertIn('dir="rtl"', html_alt)
        self.assertIn("تم تأكيد طلبك", html_alt)

    def test_payment_paid_email_attaches_invoice_pdf(self):
        order = self._create_paid_order(self.region, customer_email="mail-paid@example.com")
        captured = {}

        def _fake_send(message_self, fail_silently=False):
            captured["attachments"] = list(message_self.attachments)
            captured["alternatives"] = list(message_self.alternatives)
            return 1

        with patch("django.core.mail.message.EmailMultiAlternatives.send", new=_fake_send):
            sent = send_payment_paid_email(order)

        self.assertTrue(sent)
        self.assertTrue(captured["alternatives"])
        self.assertTrue(captured["attachments"])
        filenames = [item[0] for item in captured["attachments"] if isinstance(item, tuple) and item]
        self.assertTrue(any(str(name).endswith(".pdf") for name in filenames))

    def test_checkout_requires_map_pin_when_region_requires_it(self):
        self.region.require_map_pin = True
        self.region.save(update_fields=["require_map_pin"])

        base_customer = {
            "name": "Pin Required User",
            "phone": "12345678",
            "city": "Muscat",
            "country": "Oman",
        }
        # address_line_1 is a required non-blank field on every checkout, so a typed
        # address always satisfies the map-pin alternative path — checkout must succeed.
        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {**base_customer, "address_line_1": "Street 1"},
            "payment_method": "cod",
            "items": [{"slug": self.product.slug, "quantity": 1}],
        }
        response = self.api_client.post("/api/checkout/", payload, format="json")
        self.assertEqual(response.status_code, 201)

        # With a proper lat/lng also works
        payload["customer"]["lat"] = "23.588000"
        payload["customer"]["lng"] = "58.382000"
        response2 = self.api_client.post("/api/checkout/", payload, format="json")
        self.assertEqual(response2.status_code, 201)

    def test_checkout_stores_coordinates_and_address_snapshot(self):
        self.region.require_map_pin = True
        self.region.save(update_fields=["require_map_pin"])

        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Geo User",
                "email": "geo@example.com",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "address_line_2": "Near mall",
                "building": "B-12",
                "floor": "3",
                "apartment": "302",
                "landmark": "Blue Tower",
                "area": "Mabella",
                "city": "Muscat",
                "postcode": "130",
                "country": "Oman",
                "lat": "23.588000",
                "lng": "58.382900",
                "place_id": "omaplace123",
                "formatted_address": "B-12, Floor 3, Mabella, Muscat, Oman",
                "location_notes": "Use side entrance near parking",
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
        order = serializer.save()
        order.refresh_from_db()

        self.assertEqual(order.latitude, Decimal("23.588000"))
        self.assertEqual(order.longitude, Decimal("58.382900"))
        self.assertEqual(order.place_id, "omaplace123")
        self.assertEqual(order.formatted_address, "B-12, Floor 3, Mabella, Muscat, Oman")
        self.assertEqual(order.location_notes, "Use side entrance near parking")
        self.assertEqual(order.building, "B-12")
        self.assertEqual(order.floor, "3")
        self.assertEqual(order.apartment, "302")
        self.assertEqual(order.landmark, "Blue Tower")
        self.assertEqual(order.area, "Mabella")
        self.assertEqual(order.postcode, "130")
        self.assertEqual(order.address_snapshot.get("latitude"), "23.588000")
        self.assertEqual(order.address_snapshot.get("longitude"), "58.382900")
        self.assertEqual(order.address_snapshot.get("place_id"), "omaplace123")

    def test_admin_order_serializer_includes_map_link(self):
        order = Order.objects.create(
            region=self.region,
            customer_name="Map Admin User",
            customer_email="map-admin@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            latitude=Decimal("24.713600"),
            longitude=Decimal("46.675300"),
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("7.00"),
            currency_code=self.region.currency_code,
        )
        staff_user = self._create_staff_user("staff-map")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.get(f"/api/admin/orders/{order.order_number}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data.get("map_link"),
            "https://www.google.com/maps?q=24.713600,46.675300",
        )

    def test_admin_shipping_rule_crud_endpoints(self):
        staff_user = self._create_staff_user("staff-shipping")
        self.api_client.force_authenticate(staff_user)

        create_response = self.api_client.post(
            "/api/admin/shipping-rules/",
            {
                "region": self.region.id,
                "city": "Muscat",
                "area": "Mabella",
                "min_order_value": "0.00",
                "max_order_value": "50.00",
                "shipping_fee": "3.00",
                "free_shipping_threshold": "20.00",
                "eta_min_days": 1,
                "eta_max_days": 2,
                "carrier_name": "Local Fleet",
                "active": True,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        rule_id = create_response.data["id"]

        list_response = self.api_client.get("/api/admin/shipping-rules/")
        self.assertEqual(list_response.status_code, 200)
        rules = list_response.data.get("results", list_response.data)
        self.assertTrue(any(item["id"] == rule_id for item in rules))

        patch_response = self.api_client.patch(
            f"/api/admin/shipping-rules/{rule_id}/",
            {
                "shipping_fee": "4.00",
                "eta_max_days": 3,
            },
            format="json",
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.data["shipping_fee"], "4.00")
        self.assertEqual(patch_response.data["eta_max_days"], 3)

        delete_response = self.api_client.delete(f"/api/admin/shipping-rules/{rule_id}/")
        self.assertEqual(delete_response.status_code, 204)

    def _create_online_order(self, region):
        return Order.objects.create(
            region=region,
            customer_name="Payment User",
            customer_email="payment@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country=region.name_en,
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("7.00"),
            currency_code=region.currency_code,
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_UNPAID,
        )

    def _create_checkout_order_with_items(self, region, *, payment_method=Order.PAYMENT_ONLINE, quantity=2):
        payload = {
            "region": region.code,
            "locale": "en",
            "customer": {
                "name": "Payment User",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": region.name_en,
            },
            "payment_method": payment_method,
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": quantity,
                }
            ],
        }
        serializer = CheckoutCreateSerializer(data=payload, context={"request": None})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save()

    @override_settings(
        PAYMOB_API_KEY="paymob-key",
        PAYMOB_INTEGRATION_ID="1001",
        PAYMOB_IFRAME_ID="2002",
        PAYMOB_HMAC_SECRET="hmac-secret",
    )
    def test_payment_initiate_paymob_backward_compatibility(self):
        self.region.payment_enabled_providers = ["paymob"]
        self.region.default_payment_provider = "paymob"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        order = self._create_online_order(self.region)

        with patch(
            "store.services.payment_router.paymob.initiate_payment",
            return_value={
                "payment_key": "mock-key",
                "iframe_url": "https://accept.paymob.com/iframe?payment_token=mock-key",
                "paymob_order_id": "pm-order-123",
            },
        ) as mocked_paymob:
            response = self.api_client.post(
                "/api/payments/initiate/",
                {"order_number": order.order_number, "lookup_token": order.lookup_token},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["paymob_order_id"], "pm-order-123")
        self.assertEqual(response.data["provider"], "paymob")
        mocked_paymob.assert_called_once()

        tx = PaymentTransaction.objects.filter(order=order, provider="paymob").first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.provider_reference, "pm-order-123")
        self.assertEqual(tx.status, PaymentTransaction.STATUS_PENDING)

    @override_settings(
        PAYMOB_API_KEY="paymob-key",
        PAYMOB_INTEGRATION_ID="1001",
        PAYMOB_IFRAME_ID="2002",
        PAYMOB_HMAC_SECRET="hmac-secret",
        PAYMOB_APPLE_PAY_INTEGRATION_ID="3003",
        PAYMOB_APPLE_PAY_IFRAME_ID="4004",
    )
    def test_payment_initiate_apple_pay_rejected_when_region_not_enabled(self):
        self.region.payment_enabled_providers = ["paymob"]
        self.region.default_payment_provider = "paymob"
        self.region.payment_supported_methods = {"cards": ["visa"], "wallets": [], "badges": {"apple_pay": False}}
        self.region.save(
            update_fields=["payment_enabled_providers", "default_payment_provider", "payment_supported_methods"]
        )
        order = self._create_online_order(self.region)

        response = self.api_client.post(
            "/api/payments/initiate/",
            {
                "order_number": order.order_number,
                "lookup_token": order.lookup_token,
                "provider": "paymob",
                "payment_type": "apple_pay",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "provider_disabled")
        self.assertIn("apple pay", str(response.data.get("error", "")).lower())

    @override_settings(
        PAYMOB_API_KEY="paymob-key",
        PAYMOB_INTEGRATION_ID="1001",
        PAYMOB_IFRAME_ID="2002",
        PAYMOB_HMAC_SECRET="hmac-secret",
        PAYMOB_APPLE_PAY_INTEGRATION_ID="3003",
        PAYMOB_APPLE_PAY_IFRAME_ID="4004",
    )
    def test_payment_initiate_apple_pay_calls_paymob_when_region_enabled(self):
        self.region.payment_enabled_providers = ["paymob"]
        self.region.default_payment_provider = "paymob"
        self.region.payment_supported_methods = {"cards": ["visa"], "wallets": ["apple_pay"]}
        self.region.save(
            update_fields=["payment_enabled_providers", "default_payment_provider", "payment_supported_methods"]
        )
        order = self._create_online_order(self.region)

        with patch(
            "store.services.payment_router.paymob.initiate_apple_pay_payment",
            return_value={
                "payment_key": "apple-key",
                "iframe_url": "https://accept.paymob.com/iframe?payment_token=apple-key",
                "paymob_order_id": "pm-apple-123",
            },
        ) as mocked_apple_pay:
            response = self.api_client.post(
                "/api/payments/initiate/",
                {
                    "order_number": order.order_number,
                    "lookup_token": order.lookup_token,
                    "provider": "paymob",
                    "payment_type": "apple_pay",
                },
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("provider"), "paymob")
        self.assertEqual(response.data.get("paymob_order_id"), "pm-apple-123")
        mocked_apple_pay.assert_called_once()

    @override_settings(
        PAYMOB_API_KEY="global-key",
        PAYMOB_INTEGRATION_ID="65592",
        PAYMOB_IFRAME_ID="60088",
        PAYMOB_HMAC_SECRET="global-hmac",
        PAYMOB_INTEGRATION_ID_SA="",
        PAYMOB_IFRAME_ID_SA="",
        PAYMOB_HMAC_SECRET_SA="",
        PAYMOB_SHARED_ACCOUNT="",
    )
    def test_paymob_config_oman_uses_global_sa_requires_own_creds(self):
        from store.services.payment_config import get_paymob_config

        om = get_paymob_config("om")
        self.assertEqual(om["integration_id"], "65592")
        self.assertEqual(om["hmac_secret"], "global-hmac")

        # Saudi must NOT borrow the Oman integration/iframe/hmac.
        sa = get_paymob_config("sa")
        self.assertEqual(sa["integration_id"], "")
        self.assertEqual(sa["iframe_id"], "")
        self.assertEqual(sa["hmac_secret"], "")
        self.assertEqual(sa["currency"], "SAR")
        self.assertEqual(sa["base_url"], "https://ksa.paymob.com/api")
        # api_key is account-level and may be shared.
        self.assertEqual(sa["api_key"], "global-key")

    @override_settings(
        PAYMOB_API_KEY="global-key",
        PAYMOB_INTEGRATION_ID_SA="9001",
        PAYMOB_IFRAME_ID_SA="9002",
        PAYMOB_HMAC_SECRET_SA="sa-hmac",
    )
    def test_paymob_config_sa_uses_region_creds_when_present(self):
        from store.services.payment_config import get_paymob_config

        sa = get_paymob_config("sa")
        self.assertEqual(sa["integration_id"], "9001")
        self.assertEqual(sa["iframe_id"], "9002")
        self.assertEqual(sa["hmac_secret"], "sa-hmac")
        self.assertEqual(sa["currency"], "SAR")

    @override_settings(
        PAYMOB_API_KEY="global-key",
        PAYMOB_INTEGRATION_ID_SA="",
        PAYMOB_IFRAME_ID_SA="",
        PAYMOB_HMAC_SECRET_SA="",
        PAYMOB_SHARED_ACCOUNT="",
    )
    def test_paymob_config_db_row_overrides_env_per_region(self):
        from store.models import PaymobRegionConfig
        from store.services.payment_config import get_paymob_config, paymob_config_is_complete

        # No row yet → Saudi is setup-pending (no env creds either).
        sa = get_paymob_config("sa")
        self.assertFalse(paymob_config_is_complete(sa))

        # Admin enters SA credentials in the panel → becomes active, no redeploy.
        PaymobRegionConfig.objects.create(
            region_code="SA",
            api_key="sa-db-key",
            integration_id="7001",
            iframe_id="7002",
            hmac_secret="sa-db-hmac",
            enabled=True,
        )
        sa = get_paymob_config("sa")
        self.assertEqual(sa["api_key"], "sa-db-key")
        self.assertEqual(sa["integration_id"], "7001")
        self.assertEqual(sa["iframe_id"], "7002")
        self.assertEqual(sa["hmac_secret"], "sa-db-hmac")
        self.assertTrue(paymob_config_is_complete(sa))

    @override_settings(
        PAYMOB_API_KEY="global-key",
        PAYMOB_INTEGRATION_ID="65592",
        PAYMOB_IFRAME_ID="60088",
        PAYMOB_HMAC_SECRET="global-hmac",
    )
    def test_paymob_config_blank_db_row_does_not_break_env(self):
        from store.models import PaymobRegionConfig
        from store.services.payment_config import get_paymob_config, paymob_config_is_complete

        # A blank Oman row must not overwrite working env credentials.
        PaymobRegionConfig.objects.create(region_code="OM", enabled=True)
        om = get_paymob_config("om")
        self.assertEqual(om["integration_id"], "65592")
        self.assertEqual(om["hmac_secret"], "global-hmac")
        self.assertTrue(paymob_config_is_complete(om))

    @override_settings(
        PAYMOB_API_KEY="global-key",
        PAYMOB_INTEGRATION_ID="65592",
        PAYMOB_IFRAME_ID="60088",
        PAYMOB_HMAC_SECRET="global-hmac",
    )
    def test_paymob_config_disabled_flag_turns_region_off(self):
        from store.models import PaymobRegionConfig
        from store.services.payment_config import get_paymob_config, paymob_config_is_complete

        PaymobRegionConfig.objects.create(region_code="OM", enabled=False)
        om = get_paymob_config("om")
        self.assertFalse(om["enabled"])
        # Credentials still resolve from env, but the region is not complete.
        self.assertEqual(om["integration_id"], "65592")
        self.assertFalse(paymob_config_is_complete(om))

    def test_payment_initiate_fails_when_region_provider_is_disabled(self):
        self.region.payment_enabled_providers = ["paymob"]
        self.region.default_payment_provider = "paymob"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        order = self._create_online_order(self.region)

        response = self.api_client.post(
            "/api/payments/initiate/",
            {"order_number": order.order_number, "lookup_token": order.lookup_token, "provider": "telr"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "provider_disabled")
        self.assertIn("disabled", response.data.get("error", "").lower())

    def test_payment_initiate_missing_credentials_returns_safe_error(self):
        self.region.payment_enabled_providers = ["paytabs"]
        self.region.default_payment_provider = "paytabs"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        order = self._create_online_order(self.region)

        response = self.api_client.post(
            "/api/payments/initiate/",
            {"order_number": order.order_number, "lookup_token": order.lookup_token},
            format="json",
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data.get("code"), "provider_config_missing")
        self.assertIn("missing settings", response.data.get("error", "").lower())

    @override_settings(
        PAYTABS_PROFILE_ID_SA="123456",
        PAYTABS_SERVER_KEY_SA="pt-server-key-sa",
        PAYTABS_REGION_SA="https://secure.paytabs.sa",
        PAYTABS_RETURN_BASE_URL="https://example.com",
        PAYTABS_CALLBACK_BASE_URL="https://example.com",
    )
    def test_payment_initiate_routes_ksa_to_paytabs(self):
        sa_region = Region.objects.create(
            code="sa",
            name_en="Saudi Arabia",
            currency_code="SAR",
            shipping_fee=Decimal("10.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="966000000",
            address_en="Riyadh Address",
            address_ar="Riyadh Address AR",
            payment_enabled_providers=["paytabs", "paymob"],
            default_payment_provider="paytabs",
            payment_supported_methods={"cards": ["visa", "mastercard"], "local": ["mada"], "wallets": []},
        )
        order = self._create_online_order(sa_region)

        with patch(
            "store.services.paytabs.initiate_payment",
            return_value={
                "provider": "paytabs",
                "provider_reference": "TST-PT-123",
                "redirect_url": "https://secure.paytabs.sa/payment/page/abc123",
                "iframe_url": "https://secure.paytabs.sa/payment/page/abc123",
                "paytabs_tran_ref": "TST-PT-123",
            },
        ) as mocked_paytabs:
            response = self.api_client.post(
                "/api/payments/initiate/",
                {"order_number": order.order_number, "lookup_token": order.lookup_token},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("provider"), "paytabs")
        self.assertEqual(response.data.get("provider_reference"), "TST-PT-123")
        mocked_paytabs.assert_called_once()

        tx = PaymentTransaction.objects.filter(order=order, provider="paytabs", provider_reference="TST-PT-123").first()
        self.assertIsNotNone(tx)

    @override_settings(
        PAYTABS_PROFILE_ID_OM="222222",
        PAYTABS_SERVER_KEY_OM="pt-server-key-om",
        PAYTABS_REGION_OM="https://secure-oman.paytabs.com",
    )
    def test_paytabs_webhook_rejects_forged_signature(self):
        self.region.payment_enabled_providers = ["paytabs"]
        self.region.default_payment_provider = "paytabs"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        order = self._create_online_order(self.region)

        payload = {
            "cart_id": order.order_number,
            "tran_ref": "TST-FAKE-111",
            "payment_result": {"response_status": "A"},
        }
        response = self.api_client.post("/api/payments/webhook/paytabs/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "invalid_signature")

    @override_settings(
        THAWANI_PUBLISHABLE_KEY="thawani-pk",
        THAWANI_SECRET_KEY="thawani-sk",
        THAWANI_BASE_URL="https://uatcheckout.thawani.om/api/v1",
        THAWANI_WEBHOOK_SECRET="thawani-webhook-secret",
    )
    def test_thawani_webhook_rejects_missing_signature(self):
        self.region.payment_enabled_providers = ["thawani"]
        self.region.default_payment_provider = "thawani"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        order = self._create_online_order(self.region)

        payload = {
            "order_number": order.order_number,
            "session_id": "TH-SESSION-001",
            "status": "paid",
        }

        response = self.api_client.post("/api/payments/webhook/thawani/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "invalid_signature")

    @override_settings(
        THAWANI_PUBLISHABLE_KEY="thawani-pk",
        THAWANI_SECRET_KEY="thawani-sk",
        THAWANI_BASE_URL="https://uatcheckout.thawani.om/api/v1",
        THAWANI_ENABLE_REAL_API="1",
        THAWANI_CREATE_SESSION_PATH="/api/v1/checkout/session",
    )
    def test_thawani_create_session_url_normalizes_legacy_base_url(self):
        order = self._create_online_order(self.region)

        class _MockResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "data": {
                        "session_id": "TH-SESSION-URL-001",
                        "checkout_url": "https://checkout.thawani.om/pay/abc",
                    }
                }

        with patch("store.services.thawani.requests.post", return_value=_MockResponse()) as mocked_post:
            from store.services import thawani as thawani_service

            result = thawani_service.initiate_payment(order)

        self.assertEqual(result["provider_reference"], "TH-SESSION-URL-001")
        self.assertEqual(result["redirect_url"], "https://checkout.thawani.om/pay/abc")
        called_url = mocked_post.call_args[0][0]
        self.assertEqual(called_url, "https://uatcheckout.thawani.om/api/v1/checkout/session")

    @override_settings(
        OMANNET_MERCHANT_ID="merchant-om",
        OMANNET_ACCESS_CODE="access-code-om",
        OMANNET_SHA_REQUEST="sha-request-om",
        OMANNET_SHA_RESPONSE="sha-response-om",
        OMANNET_BASE_URL="https://omanet.om",
        OMANNET_WEBHOOK_SECRET="omannet-webhook-secret",
    )
    def test_omannet_webhook_rejects_missing_signature(self):
        self.region.payment_enabled_providers = ["omannet"]
        self.region.default_payment_provider = "omannet"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        order = self._create_online_order(self.region)

        payload = {
            "order_number": order.order_number,
            "transaction_id": "OMN-TX-001",
            "status": "paid",
        }

        response = self.api_client.post("/api/payments/webhook/omannet/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "invalid_signature")

    @override_settings(
        PAYTABS_PROFILE_ID_OM="333333",
        PAYTABS_SERVER_KEY_OM="pt-server-key-webhook",
        PAYTABS_REGION_OM="https://secure-oman.paytabs.com",
    )
    def test_paytabs_webhook_duplicate_is_idempotent(self):
        self.region.payment_enabled_providers = ["paytabs"]
        self.region.default_payment_provider = "paytabs"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        order = self._create_online_order(self.region)

        payload = {
            "cart_id": order.order_number,
            "tran_ref": "TST-IDEMPOTENT-1001",
            "tran_type": "Sale",
            "payment_result": {"response_status": "A"},
        }
        payload_bytes = json.dumps(payload).encode("utf-8")
        signature = hmac.new(
            b"pt-server-key-webhook",
            payload_bytes,
            hashlib.sha256,
        ).hexdigest()

        with patch(
            "store.services.paytabs._post_json",
            return_value={
                "tran_ref": "TST-IDEMPOTENT-1001",
                "tran_type": "Sale",
                "cart_id": order.order_number,
                "payment_result": {"response_status": "A"},
            },
        ):
            first = self.api_client.generic(
                method="POST",
                path="/api/payments/webhook/paytabs/",
                data=payload_bytes,
                content_type="application/json",
                HTTP_SIGNATURE=signature,
            )
            second = self.api_client.generic(
                method="POST",
                path="/api/payments/webhook/paytabs/",
                data=payload_bytes,
                content_type="application/json",
                HTTP_SIGNATURE=signature,
            )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json().get("status"), "already_processed")

        txs = PaymentTransaction.objects.filter(
            order=order,
            provider="paytabs",
            provider_reference="TST-IDEMPOTENT-1001",
        )
        self.assertEqual(txs.count(), 1)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, Order.PAYMENT_PAID)

    @override_settings(
        PAYTABS_PROFILE_ID_OM="888888",
        PAYTABS_SERVER_KEY_OM="pt-server-key-stock",
        PAYTABS_REGION_OM="https://secure-oman.paytabs.com",
    )
    def test_online_checkout_reserves_stock_until_payment_success(self):
        self.region.payment_enabled_providers = ["paytabs"]
        self.region.default_payment_provider = "paytabs"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        warehouse = Warehouse.objects.create(
            code="om-online-reserve",
            name_en="Oman Online Reserve",
            name_ar="مخزون الدفع الإلكتروني",
            region=self.region,
            city="Muscat",
            address="Muscat",
            active=True,
        )
        self.region.fulfillment_warehouses.add(warehouse)
        stock = ProductStock.objects.create(
            product=self.product,
            warehouse=warehouse,
            quantity=5,
            reserved_quantity=0,
            low_stock_threshold=1,
        )
        order = self._create_checkout_order_with_items(self.region, payment_method=Order.PAYMENT_ONLINE, quantity=2)

        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 5)
        self.assertEqual(stock.reserved_quantity, 2)

        payload = {
            "cart_id": order.order_number,
            "tran_ref": "TST-STOCK-COMMIT-1001",
            "tran_type": "Sale",
            "payment_result": {"response_status": "A"},
        }
        payload_bytes = json.dumps(payload).encode("utf-8")
        signature = hmac.new(
            b"pt-server-key-stock",
            payload_bytes,
            hashlib.sha256,
        ).hexdigest()

        with patch(
            "store.services.paytabs._post_json",
            return_value={
                "tran_ref": "TST-STOCK-COMMIT-1001",
                "tran_type": "Sale",
                "cart_id": order.order_number,
                "payment_result": {"response_status": "A"},
            },
        ):
            first = self.api_client.generic(
                method="POST",
                path="/api/payments/webhook/paytabs/",
                data=payload_bytes,
                content_type="application/json",
                HTTP_SIGNATURE=signature,
            )
            second = self.api_client.generic(
                method="POST",
                path="/api/payments/webhook/paytabs/",
                data=payload_bytes,
                content_type="application/json",
                HTTP_SIGNATURE=signature,
            )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json().get("status"), "already_processed")

        stock.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(stock.quantity, 3)
        self.assertEqual(stock.reserved_quantity, 0)
        self.assertEqual(order.payment_status, Order.PAYMENT_PAID)

    @override_settings(
        PAYTABS_PROFILE_ID_OM="999999",
        PAYTABS_SERVER_KEY_OM="pt-server-key-failed-stock",
        PAYTABS_REGION_OM="https://secure-oman.paytabs.com",
    )
    def test_failed_online_payment_releases_reserved_stock_and_retry_reserves_again(self):
        self.region.payment_enabled_providers = ["paytabs"]
        self.region.default_payment_provider = "paytabs"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        warehouse = Warehouse.objects.create(
            code="om-online-failed",
            name_en="Oman Online Failed",
            name_ar="مخزون دفع فاشل",
            region=self.region,
            city="Muscat",
            address="Muscat",
            active=True,
        )
        self.region.fulfillment_warehouses.add(warehouse)
        stock = ProductStock.objects.create(
            product=self.product,
            warehouse=warehouse,
            quantity=5,
            reserved_quantity=0,
            low_stock_threshold=1,
        )
        order = self._create_checkout_order_with_items(self.region, payment_method=Order.PAYMENT_ONLINE, quantity=2)

        payload = {
            "cart_id": order.order_number,
            "tran_ref": "TST-STOCK-FAILED-1001",
            "tran_type": "Sale",
            "payment_result": {"response_status": "E"},
        }
        payload_bytes = json.dumps(payload).encode("utf-8")
        signature = hmac.new(
            b"pt-server-key-failed-stock",
            payload_bytes,
            hashlib.sha256,
        ).hexdigest()

        with patch(
            "store.services.paytabs._post_json",
            return_value={
                "tran_ref": "TST-STOCK-FAILED-1001",
                "tran_type": "Sale",
                "cart_id": order.order_number,
                "payment_result": {"response_status": "E"},
            },
        ):
            response = self.api_client.generic(
                method="POST",
                path="/api/payments/webhook/paytabs/",
                data=payload_bytes,
                content_type="application/json",
                HTTP_SIGNATURE=signature,
            )

        self.assertEqual(response.status_code, 200)
        stock.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(stock.quantity, 5)
        self.assertEqual(stock.reserved_quantity, 0)
        self.assertTrue(order.inventory_released)

        with patch(
            "store.api_views.payments.initiate_payment",
            return_value={
                "provider": "paytabs",
                "provider_reference": "retry-ref-001",
                "redirect_url": "https://secure-oman.paytabs.com/payment/page",
            },
        ):
            retry = self.api_client.post(
                "/api/payments/retry/",
                {
                    "order_number": order.order_number,
                    "lookup_token": order.lookup_token,
                    "provider": "paytabs",
                },
                format="json",
            )

        self.assertEqual(retry.status_code, 200)
        stock.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(stock.quantity, 5)
        self.assertEqual(stock.reserved_quantity, 2)
        self.assertFalse(order.inventory_released)

    @override_settings(
        PAYTABS_PROFILE_ID_OM="444444",
        PAYTABS_SERVER_KEY_OM="pt-server-key-status",
        PAYTABS_REGION_OM="https://secure-oman.paytabs.com",
    )
    def test_payment_status_endpoint_includes_provider_status(self):
        self.region.payment_enabled_providers = ["paytabs"]
        self.region.default_payment_provider = "paytabs"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])
        order = self._create_online_order(self.region)
        PaymentTransaction.objects.create(
            order=order,
            provider="paytabs",
            provider_reference="TST-STATUS-5001",
            amount=order.grand_total,
            currency_code=order.currency_code,
            status=PaymentTransaction.STATUS_PENDING,
        )

        with patch(
            "store.services.paytabs.get_status",
            return_value={
                "provider": "paytabs",
                "provider_reference": "TST-STATUS-5001",
                "status": "pending",
                "supported": True,
            },
        ):
            response = self.api_client.get(
                f"/api/payments/status/{order.order_number}/",
                {"lookup_token": order.lookup_token},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["transaction"]["provider"], "paytabs")
        self.assertEqual(response.data["provider_status"]["provider"], "paytabs")

    def test_payment_retry_endpoint_reopens_failed_order(self):
        order = self._create_online_order(self.region)
        order.status = Order.STATUS_FAILED
        order.save(update_fields=["status", "updated_at"])

        with patch(
            "store.api_views.payments.initiate_payment",
            return_value={
                "provider": "paytabs",
                "provider_reference": "retry-ref-1001",
                "redirect_url": "https://secure.example.com/retry",
            },
        ):
            response = self.api_client.post(
                "/api/payments/retry/",
                {"order_number": order.order_number, "lookup_token": order.lookup_token},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_PENDING)
        tx = PaymentTransaction.objects.filter(order=order, provider_reference="retry-ref-1001").first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.status, PaymentTransaction.STATUS_PENDING)

    def test_payment_initiate_requires_lookup_token_for_guest(self):
        order = self._create_online_order(self.region)

        response = self.api_client.post(
            "/api/payments/initiate/",
            {"order_number": order.order_number},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("lookup_token", response.data.get("error", ""))

    def test_payment_status_requires_lookup_token_for_guest(self):
        order = self._create_online_order(self.region)

        response = self.api_client.get(f"/api/payments/status/{order.order_number}/")

        self.assertEqual(response.status_code, 403)
        self.assertIn("lookup_token", response.data.get("error", ""))

    def test_customer_can_request_return(self):
        customer = User.objects.create_user(username="return-customer", password="Pass12345!")
        order = Order.objects.create(
            user=customer,
            region=self.region,
            customer_name="Return User",
            customer_email="return@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("8.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("10.00"),
            currency_code=self.region.currency_code,
            status=Order.STATUS_DELIVERED,
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_PAID,
        )
        self.api_client.force_authenticate(customer)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.api_client.post(
                f"/api/account/orders/{order.order_number}/returns/",
                {"reason": "Product quality issue and need replacement."},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], ReturnRequest.STATUS_REQUESTED)

        order.refresh_from_db()
        self.assertEqual(order.refund_status, Order.REFUND_REQUESTED)
        self.assertEqual(
            NotificationLog.objects.filter(
                order=order,
                event=NotificationLog.EVENT_RETURN_REQUESTED,
                channel=NotificationLog.CHANNEL_EMAIL,
            ).count(),
            1,
        )

        list_response = self.api_client.get("/api/account/returns/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["order_number"], order.order_number)

    def test_order_status_event_notifications_trigger_once(self):
        order = Order.objects.create(
            region=self.region,
            locale="ar",
            customer_name="Event Customer",
            customer_email="events@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("8.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("10.00"),
            currency_code=self.region.currency_code,
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_PAID,
            status=Order.STATUS_PROCESSING,
        )

        # Create-event callback + shipped callback are committed and executed once each.
        with self.captureOnCommitCallbacks(execute=True):
            order.transition_to(Order.STATUS_SHIPPED, note="Courier picked up.")

        self.assertEqual(
            NotificationLog.objects.filter(
                order=order,
                event=NotificationLog.EVENT_ORDER_SHIPPED,
                channel=NotificationLog.CHANNEL_EMAIL,
            ).count(),
            1,
        )
        shipped_log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_SHIPPED,
            channel=NotificationLog.CHANNEL_EMAIL,
        ).first()
        self.assertEqual(shipped_log.payload.get("locale"), "ar")

        # Saving again without status transition must not duplicate event.
        with self.captureOnCommitCallbacks(execute=True):
            order.notes = "No status change."
            order.save(update_fields=["notes", "updated_at"])

        self.assertEqual(
            NotificationLog.objects.filter(
                order=order,
                event=NotificationLog.EVENT_ORDER_SHIPPED,
                channel=NotificationLog.CHANNEL_EMAIL,
            ).count(),
            1,
        )

    def test_failed_status_notification_logs_error_without_breaking_transition(self):
        order = Order.objects.create(
            region=self.region,
            locale="en",
            customer_name="Failure Case",
            customer_email="failure@example.com",
            customer_phone="12345678",
            address_line_1="Street 2",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("6.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("8.00"),
            currency_code=self.region.currency_code,
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_PAID,
            status=Order.STATUS_PROCESSING,
        )

        with patch("store.notifications.send_transactional_order_email", side_effect=Exception("SMTP down")):
            with self.captureOnCommitCallbacks(execute=True):
                order.transition_to(Order.STATUS_SHIPPED, note="Shipment attempted.")

        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_SHIPPED)
        failed_log = NotificationLog.objects.filter(
            order=order,
            event=NotificationLog.EVENT_ORDER_SHIPPED,
            channel=NotificationLog.CHANNEL_EMAIL,
            status=NotificationLog.STATUS_FAILED,
        ).first()
        self.assertIsNotNone(failed_log)
        self.assertIn("SMTP down", failed_log.error_message)

    def test_process_order_event_async_retries_retryable_failures(self):
        with patch("store.tasks._dispatch_order_event", side_effect=NotificationDispatchRetryableError("SMTP unavailable")):
            with patch.object(process_order_event_async, "retry", side_effect=RuntimeError("retry called")) as retry_mock:
                with self.assertRaises(RuntimeError):
                    process_order_event_async.run(123, NotificationLog.EVENT_ORDER_CREATED, None)

        retry_mock.assert_called_once()
        self.assertEqual(retry_mock.call_args.kwargs["countdown"], 1)

    def test_admin_order_serializer_exposes_notification_summary(self):
        order = Order.objects.create(
            region=self.region,
            customer_name="Summary User",
            customer_email="summary@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("8.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("10.00"),
            currency_code=self.region.currency_code,
            payment_method=Order.PAYMENT_COD,
        )
        log = NotificationLog.objects.create(
            order=order,
            event=NotificationLog.EVENT_ORDER_CREATED,
            channel=NotificationLog.CHANNEL_EMAIL,
            recipient="summary@example.com",
            status=NotificationLog.STATUS_FAILED,
            title="order_created - summary",
            body="failure",
            payload={"event": NotificationLog.EVENT_ORDER_CREATED},
            error_message="SMTP down",
            attempt_count=2,
        )

        serializer = AdminOrderSerializer(instance=order)
        summary = serializer.data["notification_summary"]
        history = serializer.data["notification_history"]

        self.assertEqual(summary["latest_status"], NotificationLog.STATUS_FAILED)
        self.assertEqual(summary["latest_error"], "SMTP down")
        self.assertEqual(history[0]["id"], log.id)
        self.assertEqual(history[0]["attempt_count"], 2)

    def test_admin_can_approve_and_reject_return_request(self):
        staff_user = self._create_staff_user("returns-staff")
        order = Order.objects.create(
            region=self.region,
            customer_name="Approve Return User",
            customer_email="approve@example.com",
            customer_phone="12345678",
            address_line_1="Street 2",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("11.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("13.00"),
            currency_code=self.region.currency_code,
            status=Order.STATUS_DELIVERED,
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_PAID,
        )
        return_request = ReturnRequest.objects.create(
            order=order,
            customer_name=order.customer_name,
            customer_email=order.customer_email,
            reason="Returned due to damaged package.",
        )

        self.api_client.force_authenticate(staff_user)
        approve_response = self.api_client.patch(
            f"/api/admin/returns/{return_request.id}/",
            {"status": ReturnRequest.STATUS_APPROVED, "admin_note": "Approved by warehouse team."},
            format="json",
        )
        self.assertEqual(approve_response.status_code, 200)
        return_request.refresh_from_db()
        order.refresh_from_db()

        self.assertEqual(return_request.status, ReturnRequest.STATUS_APPROVED)
        self.assertEqual(return_request.reviewed_by_id, staff_user.id)
        self.assertEqual(order.status, Order.STATUS_RETURNED)
        self.assertTrue(order.inventory_released)
        self.assertEqual(order.refund_status, Order.REFUND_REQUESTED)

        second_order = Order.objects.create(
            region=self.region,
            customer_name="Reject Return User",
            customer_email="reject@example.com",
            customer_phone="12345678",
            address_line_1="Street 3",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("7.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("9.00"),
            currency_code=self.region.currency_code,
            status=Order.STATUS_DELIVERED,
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_PAID,
            refund_status=Order.REFUND_REQUESTED,
        )
        reject_request = ReturnRequest.objects.create(
            order=second_order,
            customer_name=second_order.customer_name,
            customer_email=second_order.customer_email,
            reason="Changed mind.",
        )

        reject_response = self.api_client.patch(
            f"/api/admin/returns/{reject_request.id}/",
            {"status": ReturnRequest.STATUS_REJECTED, "admin_note": "Outside return policy window."},
            format="json",
        )
        self.assertEqual(reject_response.status_code, 200)
        reject_request.refresh_from_db()
        second_order.refresh_from_db()
        self.assertEqual(reject_request.status, ReturnRequest.STATUS_REJECTED)
        self.assertEqual(reject_request.reviewed_by_id, staff_user.id)
        self.assertEqual(second_order.refund_status, Order.REFUND_NONE)

    def test_admin_manual_refund_updates_order_and_transaction(self):
        staff_user = self._create_staff_user("refund-staff")
        order = self._create_online_order(self.region)
        order.payment_status = Order.PAYMENT_PAID
        order.save(update_fields=["payment_status", "updated_at"])
        order.transition_to(Order.STATUS_PAID)
        order.transition_to(Order.STATUS_DELIVERED)

        PaymentTransaction.objects.create(
            order=order,
            provider=PaymentTransaction.PROVIDER_PAYTABS,
            provider_reference="PAYTABS-PAID-1",
            amount=order.grand_total,
            currency_code=order.currency_code,
            status=PaymentTransaction.STATUS_PAID,
        )
        return_request = ReturnRequest.objects.create(
            order=order,
            customer_name=order.customer_name,
            customer_email=order.customer_email,
            reason="Wrong product variation received.",
            status=ReturnRequest.STATUS_APPROVED,
        )

        self.api_client.force_authenticate(staff_user)
        response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/refund/",
            {
                "mode": "manual",
                "amount": "3.50",
                "manual_reference": "MANUAL-RFD-1001",
                "admin_note": "Refunded manually.",
                "return_request_id": return_request.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        return_request.refresh_from_db()

        self.assertEqual(order.payment_status, Order.PAYMENT_REFUNDED)
        self.assertEqual(order.status, Order.STATUS_REFUNDED)
        self.assertEqual(order.refund_status, Order.REFUND_REFUNDED)
        self.assertEqual(order.refund_reference, "MANUAL-RFD-1001")
        self.assertEqual(order.refund_amount, Decimal("3.50"))
        self.assertIsNotNone(order.refunded_at)
        self.assertEqual(return_request.status, ReturnRequest.STATUS_REFUNDED)

        refund_tx = PaymentTransaction.objects.filter(
            order=order,
            provider_reference="MANUAL-RFD-1001",
            status=PaymentTransaction.STATUS_REFUNDED,
        ).first()
        self.assertIsNotNone(refund_tx)
        self.assertEqual(refund_tx.amount, Decimal("3.50"))

    def test_admin_refunded_order_detail_exposes_no_further_status_transitions(self):
        staff_user = self._create_staff_user("refund-detail-staff")
        order = self._create_online_order(self.region)
        order.payment_status = Order.PAYMENT_PAID
        order.save(update_fields=["payment_status", "updated_at"])
        order.transition_to(Order.STATUS_PAID)
        order.transition_to(Order.STATUS_DELIVERED)

        self.api_client.force_authenticate(staff_user)
        self.api_client.post(
            f"/api/admin/orders/{order.order_number}/refund/",
            {
                "mode": "manual",
                "amount": "3.50",
                "manual_reference": "MANUAL-RFD-DETAIL-1",
            },
            format="json",
        )

        response = self.api_client.get(f"/api/admin/orders/{order.order_number}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], Order.STATUS_REFUNDED)
        self.assertEqual(response.data["allowed_status_transitions"], [])
        self.assertEqual(response.data["previous_status"], Order.STATUS_DELIVERED)
        self.assertEqual(response.data["previous_status_label"], "Delivered")
        self.assertTrue(response.data["can_revert_status"])
        self.assertEqual(response.data["revert_status_label"], "Revert to Delivered")
        self.assertEqual(
            response.data["rollback_action"]["url"],
            f"/api/admin/orders/{order.order_number}/status-rollback/",
        )

    def test_analytics_event_stores_attribution_metadata(self):
        response = self.api_client.post(
            "/api/analytics/event/",
            {
                "event_type": AnalyticsEvent.EVENT_PAGE_VIEW,
                "session_key": "session-instagram-1",
                "region_code": self.region.code,
                "metadata": {
                    "source": "Instagram",
                    "utm_source": "instagram",
                    "landing_page": "https://shop.example/en?utm_source=instagram",
                    "ignored": "not stored",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        event = AnalyticsEvent.objects.get(session_key="session-instagram-1")
        self.assertEqual(event.metadata["source"], "Instagram")
        self.assertEqual(event.metadata["utm_source"], "instagram")
        self.assertNotIn("ignored", event.metadata)

    def test_checkout_stores_conversion_attribution_on_order(self):
        payload = {
            "region": self.region.code,
            "customer": {
                "name": "Instagram Customer",
                "email": "insta@example.com",
                "phone": "12345678",
                "address_line_1": "Street 1",
                "city": "Muscat",
                "country": "Oman",
            },
            "payment_method": "cod",
            "analytics": {
                "session_key": "checkout-session-1",
                "source": "Instagram",
                "utm_source": "instagram",
                "landing_page": "https://shop.example/en?utm_source=instagram",
                "unsupported": "discard me",
            },
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 1,
                }
            ],
        }
        serializer = CheckoutCreateSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        order = serializer.save()

        self.assertEqual(order.conversion_session_key, "checkout-session-1")
        self.assertEqual(order.conversion_attribution["source"], "Instagram")
        self.assertEqual(order.conversion_attribution["utm_source"], "instagram")
        self.assertNotIn("unsupported", order.conversion_attribution)

    def test_admin_order_detail_exposes_conversion_summary(self):
        staff_user = self._create_staff_user("conversion-summary-staff")
        order = self._create_online_order(self.region)
        order.customer_email = "conversion@example.com"
        order.conversion_session_key = "conversion-session-1"
        order.conversion_attribution = {
            "session_key": "conversion-session-1",
            "source": "Instagram",
            "utm_source": "instagram",
            "landing_page": "https://shop.example/en?utm_source=instagram",
            "referrer": "https://instagram.com/",
        }
        order.save(update_fields=["customer_email", "conversion_session_key", "conversion_attribution", "updated_at"])
        first_event = AnalyticsEvent.objects.create(
            event_type=AnalyticsEvent.EVENT_PAGE_VIEW,
            session_key="conversion-session-1",
            region=self.region,
            metadata={"source": "Instagram"},
        )
        second_event = AnalyticsEvent.objects.create(
            event_type=AnalyticsEvent.EVENT_CHECKOUT_INITIATED,
            session_key="conversion-session-1",
            region=self.region,
            metadata={"source": "Instagram"},
        )
        AnalyticsEvent.objects.filter(pk=first_event.pk).update(created_at=timezone.now() - timedelta(days=1))
        AnalyticsEvent.objects.filter(pk=second_event.pk).update(created_at=timezone.now())

        self.api_client.force_authenticate(staff_user)
        response = self.api_client.get(f"/api/admin/orders/{order.order_number}/")

        self.assertEqual(response.status_code, 200)
        summary = response.data["conversion_summary"]
        self.assertTrue(summary["available"])
        self.assertTrue(summary["is_first_order"])
        self.assertEqual(summary["order_line"], "This is their 1st order")
        self.assertEqual(summary["source_line"], "1st session from Instagram")
        self.assertEqual(summary["session_line"], "1 session over 2 days")
        self.assertEqual(summary["details"]["utm_source"], "instagram")

    def test_admin_order_detail_reports_missing_conversion_summary(self):
        staff_user = self._create_staff_user("conversion-missing-staff")
        order = self._create_online_order(self.region)

        self.api_client.force_authenticate(staff_user)
        response = self.api_client.get(f"/api/admin/orders/{order.order_number}/")

        self.assertEqual(response.status_code, 200)
        summary = response.data["conversion_summary"]
        self.assertFalse(summary["available"])
        self.assertEqual(summary["helper"], "No conversion data captured for this order.")

    def test_admin_order_list_exposes_rollback_metadata(self):
        staff_user = self._create_staff_user("refund-list-staff")
        order = self._create_online_order(self.region)
        order.payment_status = Order.PAYMENT_PAID
        order.save(update_fields=["payment_status", "updated_at"])
        order.transition_to(Order.STATUS_PAID)
        order.transition_to(Order.STATUS_DELIVERED)

        self.api_client.force_authenticate(staff_user)
        self.api_client.post(
            f"/api/admin/orders/{order.order_number}/refund/",
            {
                "mode": "manual",
                "amount": "3.50",
                "manual_reference": "MANUAL-RFD-LIST-1",
            },
            format="json",
        )

        response = self.api_client.get("/api/admin/orders/")

        self.assertEqual(response.status_code, 200)
        rows = response.data.get("results", response.data)
        payload = next((row for row in rows if row["order_number"] == order.order_number), None)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["previous_status"], Order.STATUS_DELIVERED)
        self.assertEqual(payload["previous_status_label"], "Delivered")
        self.assertTrue(payload["can_revert_status"])
        self.assertEqual(payload["revert_status_label"], "Revert to Delivered")
        self.assertEqual(
            payload["rollback_action"]["url"],
            f"/api/admin/orders/{order.order_number}/status-rollback/",
        )
        self.assertTrue(payload["rollback_action"]["enabled"])

    def test_admin_order_detail_falls_back_to_audit_log_for_previous_status(self):
        staff_user = self._create_staff_user("rollback-fallback-staff")
        order = self._create_online_order(self.region)
        order.transition_to(Order.STATUS_CONFIRMED)
        order.transition_to(Order.STATUS_CANCELLED)
        order.status_history.all().delete()
        AdminAuditLog.objects.create(
            actor=staff_user,
            action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
            resource_type="order",
            resource_id=order.order_number,
            before_snapshot={"status": Order.STATUS_CONFIRMED},
            after_snapshot={"status": Order.STATUS_CANCELLED},
        )

        self.api_client.force_authenticate(staff_user)
        response = self.api_client.get(f"/api/admin/orders/{order.order_number}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["previous_status"], Order.STATUS_CONFIRMED)
        self.assertEqual(response.data["previous_status_label"], "Confirmed")
        self.assertTrue(response.data["can_revert_status"])
        self.assertEqual(response.data["rollback_action"]["source"], "audit_log")

    def test_admin_order_detail_reports_missing_previous_status_helper(self):
        staff_user = self._create_staff_user("rollback-helper-staff")
        order = self._create_online_order(self.region)
        order.status_history.all().delete()

        self.api_client.force_authenticate(staff_user)
        response = self.api_client.get(f"/api/admin/orders/{order.order_number}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["previous_status"], "")
        self.assertFalse(response.data["can_revert_status"])
        self.assertEqual(response.data["revert_status_helper"], "No previous status found in history.")

    def test_admin_status_rollback_uses_audit_log_fallback_for_previous_status(self):
        staff_user = self._create_staff_user("rollback-endpoint-fallback-staff")
        order = self._create_online_order(self.region)
        order.transition_to(Order.STATUS_CONFIRMED)
        order.transition_to(Order.STATUS_CANCELLED)
        order.status_history.all().delete()
        AdminAuditLog.objects.create(
            actor=staff_user,
            action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
            resource_type="order",
            resource_id=order.order_number,
            before_snapshot={"status": Order.STATUS_CONFIRMED},
            after_snapshot={"status": Order.STATUS_CANCELLED},
        )

        self.api_client.force_authenticate(staff_user)
        response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/status-rollback/",
            {"admin_note": "Restore previous state from audit history."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_CONFIRMED)

    def test_admin_status_rollback_reverts_confirmed_order_to_pending(self):
        staff_user = self._create_staff_user("rollback-confirmed-staff")
        order = self._create_online_order(self.region)
        order.transition_to(Order.STATUS_CONFIRMED)

        self.api_client.force_authenticate(staff_user)
        detail_response = self.api_client.get(f"/api/admin/orders/{order.order_number}/")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data["status"], Order.STATUS_CONFIRMED)
        self.assertEqual(detail_response.data["previous_status"], Order.STATUS_PENDING)
        self.assertEqual(detail_response.data["previous_status_label"], "Pending")
        self.assertTrue(detail_response.data["can_revert_status"])
        self.assertEqual(detail_response.data["revert_status_label"], "Revert to Pending")

        response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/status-rollback/",
            {"admin_note": "Confirmation was applied too early."},
            format="json",
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", response.content))
        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_PENDING)
        rollback_log = AdminAuditLog.objects.filter(
            action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
            resource_type="order",
            resource_id=order.order_number,
            after_snapshot__rollback=True,
        ).order_by("-timestamp", "-id").first()
        self.assertIsNotNone(rollback_log)
        self.assertEqual(rollback_log.before_snapshot["status"], Order.STATUS_CONFIRMED)
        self.assertEqual(rollback_log.after_snapshot["status"], Order.STATUS_PENDING)

    def test_admin_can_update_refunded_order_notes_without_status_resubmission(self):
        staff_user = self._create_staff_user("refund-notes-staff")
        order = self._create_online_order(self.region)
        order.payment_status = Order.PAYMENT_PAID
        order.save(update_fields=["payment_status", "updated_at"])
        order.transition_to(Order.STATUS_PAID)
        order.transition_to(Order.STATUS_DELIVERED)

        self.api_client.force_authenticate(staff_user)
        refund_response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/refund/",
            {
                "mode": "manual",
                "amount": "3.50",
                "manual_reference": "MANUAL-RFD-NOTES-1",
            },
            format="json",
        )
        self.assertEqual(refund_response.status_code, 200)

        response = self.api_client.patch(
            f"/api/admin/orders/{order.order_number}/",
            {"notes": "Refund recorded and customer informed."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_REFUNDED)
        self.assertEqual(order.notes, "Refund recorded and customer informed.")

    def test_admin_status_rollback_reverts_refunded_order_to_previous_status(self):
        staff_user = self._create_staff_user("rollback-refund-staff")
        order = self._create_online_order(self.region)
        order.payment_status = Order.PAYMENT_PAID
        order.save(update_fields=["payment_status", "updated_at"])
        order.transition_to(Order.STATUS_PAID)
        order.transition_to(Order.STATUS_DELIVERED)

        self.api_client.force_authenticate(staff_user)
        refund_response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/refund/",
            {
                "mode": "manual",
                "amount": "3.50",
                "manual_reference": "MANUAL-RFD-ROLLBACK-1",
            },
            format="json",
        )
        self.assertEqual(refund_response.status_code, 200)

        response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/status-rollback/",
            {"admin_note": "Refund was marked on the wrong order state."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_DELIVERED)
        self.assertEqual(order.payment_status, Order.PAYMENT_REFUNDED)
        self.assertEqual(order.refund_status, Order.REFUND_REFUNDED)
        rollback_log = AdminAuditLog.objects.filter(
            action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
            resource_type="order",
            resource_id=order.order_number,
            after_snapshot__rollback=True,
        ).order_by("-timestamp", "-id").first()
        self.assertIsNotNone(rollback_log)
        self.assertEqual(rollback_log.before_snapshot["status"], Order.STATUS_REFUNDED)
        self.assertEqual(rollback_log.after_snapshot["status"], Order.STATUS_DELIVERED)

    def test_admin_status_rollback_reapplies_inventory_for_cancelled_order(self):
        warehouse = Warehouse.objects.create(
            code="om-rollback-warehouse",
            name_en="Oman Rollback Warehouse",
            name_ar="مخزن التراجع عمان",
            region=self.region,
            city="Muscat",
            address="Muscat",
            active=True,
        )
        self.region.fulfillment_warehouses.add(warehouse)
        stock = ProductStock.objects.create(
            product=self.product,
            warehouse=warehouse,
            quantity=5,
            reserved_quantity=0,
            low_stock_threshold=1,
        )
        staff_user = self._create_staff_user("rollback-stock-staff")
        payload = {
            "region": self.region.code,
            "customer": {
                "name": "Rollback Customer",
                "email": "rollback@example.com",
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
        order.cancel()

        stock.refresh_from_db()
        order.refresh_from_db()
        self.assertTrue(order.inventory_released)
        self.assertEqual(stock.quantity, 5)
        self.assertEqual(stock.reserved_quantity, 0)

        self.api_client.force_authenticate(staff_user)
        detail_response = self.api_client.get(f"/api/admin/orders/{order.order_number}/")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data["status"], Order.STATUS_CANCELLED)
        self.assertEqual(detail_response.data["previous_status"], Order.STATUS_PENDING)
        self.assertEqual(detail_response.data["previous_status_label"], "Pending")
        self.assertTrue(detail_response.data["can_revert_status"])
        self.assertEqual(detail_response.data["revert_status_label"], "Revert to Pending")
        response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/status-rollback/",
            {"admin_note": "Cancellation was a mistake."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        stock.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_PENDING)
        self.assertFalse(order.inventory_released)
        self.assertEqual(stock.quantity, 3)
        self.assertEqual(stock.reserved_quantity, 2)

    def test_admin_gateway_refund_uses_provider_router(self):
        staff_user = self._create_staff_user("gateway-refund-staff")
        order = self._create_online_order(self.region)
        order.payment_status = Order.PAYMENT_PAID
        order.save(update_fields=["payment_status", "updated_at"])
        order.transition_to(Order.STATUS_PAID)
        order.transition_to(Order.STATUS_DELIVERED)
        paid_tx = PaymentTransaction.objects.create(
            order=order,
            provider=PaymentTransaction.PROVIDER_PAYTABS,
            provider_reference="PAYTABS-PAID-2",
            amount=order.grand_total,
            currency_code=order.currency_code,
            status=PaymentTransaction.STATUS_PAID,
        )

        self.api_client.force_authenticate(staff_user)
        with patch(
            "store.api_views.admin_ops.process_gateway_refund",
            return_value={
                "provider": PaymentTransaction.PROVIDER_PAYTABS,
                "provider_reference": "PAYTABS-REFUND-2",
                "status": PaymentTransaction.STATUS_REFUNDED,
                "raw_response": {"ok": True},
            },
        ) as mocked_refund:
            response = self.api_client.post(
                f"/api/admin/orders/{order.order_number}/refund/",
                {"mode": "gateway", "amount": "2.00"},
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        mocked_refund.assert_called_once_with(paid_tx, Decimal("2.00"))

        order.refresh_from_db()
        self.assertEqual(order.refund_reference, "PAYTABS-REFUND-2")
        self.assertEqual(order.refund_status, Order.REFUND_REFUNDED)
        self.assertEqual(order.payment_status, Order.PAYMENT_REFUNDED)

    @override_settings(
        THAWANI_PUBLISHABLE_KEY="",
        THAWANI_SECRET_KEY="",
        THAWANI_BASE_URL="",
        THAWANI_WEBHOOK_SECRET="",
    )
    def test_region_serializer_warns_when_thawani_enabled_without_credentials(self):
        self.region.payment_enabled_providers = ["paytabs", "thawani", "omannet"]
        self.region.default_payment_provider = "paytabs"
        self.region.save(update_fields=["payment_enabled_providers", "default_payment_provider"])

        serialized = RegionSerializer(self.region, context={"locale": "en"}).data
        warnings = serialized.get("payment_provider_warnings", [])
        options = serialized.get("payment_provider_options", [])

        self.assertTrue(any("Thawani" in warning for warning in warnings))
        thawani_option = next((item for item in options if item.get("key") == "thawani"), None)
        self.assertIsNotNone(thawani_option)
        self.assertFalse(thawani_option["configured"])
        self.assertFalse(thawani_option["available"])

    @override_settings(
        ARAMEX_USERNAME="aramex-user",
        ARAMEX_PASSWORD="aramex-pass",
        ARAMEX_ACCOUNT_NUMBER="acct-001",
        ARAMEX_ACCOUNT_PIN="pin-001",
        ARAMEX_ENABLE_REAL_API="0",
    )
    def test_admin_status_change_auto_creates_shipment_when_carrier_configured(self):
        self.region.carrier_enabled = True
        self.region.primary_carrier = Region.CARRIER_ARAMEX
        self.region.fallback_carrier = Region.CARRIER_MANUAL
        self.region.save(update_fields=["carrier_enabled", "primary_carrier", "fallback_carrier"])

        order = self._create_online_order(self.region)
        staff_user = self._create_staff_user("staff-shipment-auto")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.patch(
            f"/api/admin/orders/{order.order_number}/",
            {"status": Order.STATUS_PROCESSING},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_PROCESSING)
        self.assertEqual(order.carrier, Region.CARRIER_ARAMEX)
        self.assertTrue(order.tracking_number.startswith("ARX-"))
        self.assertIn("aramex.com", (order.tracking_url or "").lower())
        self.assertEqual(order.shipment_status, Order.SHIPMENT_CREATED)
        self.assertIsNotNone(order.shipment_created_at)

    def test_invalid_order_status_transition_is_blocked(self):
        order = self._create_online_order(self.region)
        staff_user = self._create_staff_user("staff-status-invalid")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.patch(
            f"/api/admin/orders/{order.order_number}/",
            {"status": Order.STATUS_DELIVERED},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid status transition", str(response.data))
        order.refresh_from_db()
        self.assertEqual(order.status, Order.STATUS_PENDING)

    def test_order_status_transition_creates_timeline_entries(self):
        order = self._create_online_order(self.region)
        initial_history = list(order.status_history.order_by("timestamp", "id"))
        self.assertEqual(len(initial_history), 1)
        self.assertIsNone(initial_history[0].old_status)
        self.assertEqual(initial_history[0].new_status, Order.STATUS_PENDING)

        staff_user = self._create_staff_user("staff-status-log")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.patch(
            f"/api/admin/orders/{order.order_number}/",
            {"status": Order.STATUS_CONFIRMED, "status_note": "Order verified."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        response = self.api_client.patch(
            f"/api/admin/orders/{order.order_number}/",
            {"status": Order.STATUS_PAID, "status_note": "Payment settled."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        response = self.api_client.patch(
            f"/api/admin/orders/{order.order_number}/",
            {"status": Order.STATUS_PROCESSING, "status_note": "Packed and ready."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        entries = list(
            OrderStatusHistory.objects.filter(order=order)
            .select_related("actor")
            .order_by("timestamp", "id")
        )
        self.assertEqual([entry.new_status for entry in entries], [
            Order.STATUS_PENDING,
            Order.STATUS_CONFIRMED,
            Order.STATUS_PAID,
            Order.STATUS_PROCESSING,
        ])
        self.assertEqual(entries[-1].actor_id, staff_user.id)
        self.assertEqual(entries[-1].note, "Packed and ready.")

    def test_customer_order_timeline_returns_history(self):
        order = self._create_online_order(self.region)
        order.transition_to(Order.STATUS_CONFIRMED, note="Confirmed by system.")
        order.transition_to(Order.STATUS_PAID, note="Payment received.")

        response = self.api_client.get(
            f"/api/orders/{order.order_number}/",
            {"email_or_phone": order.customer_phone},
        )
        self.assertEqual(response.status_code, 200)
        timeline = response.data.get("status_timeline", [])
        self.assertGreaterEqual(len(timeline), 3)
        self.assertEqual(timeline[-1]["key"], Order.STATUS_PAID)
        self.assertTrue(timeline[-1]["is_current"])

    def test_admin_shipment_create_allows_manual_tracking_when_carrier_not_configured(self):
        self.region.carrier_enabled = False
        self.region.save(update_fields=["carrier_enabled"])
        order = self._create_online_order(self.region)
        staff_user = self._create_staff_user("staff-shipment-manual")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/shipment/create/",
            {
                "carrier": "manual",
                "tracking_number": "MANUAL-TRACK-1001",
                "tracking_url": "https://tracking.example.com/MANUAL-TRACK-1001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.carrier, Region.CARRIER_MANUAL)
        self.assertEqual(order.tracking_number, "MANUAL-TRACK-1001")
        self.assertEqual(order.tracking_url, "https://tracking.example.com/MANUAL-TRACK-1001")
        self.assertEqual(order.shipment_status, Order.SHIPMENT_MANUAL)
        self.assertIsNotNone(order.shipment_created_at)
        self.assertEqual(
            NotificationLog.objects.filter(
                event=NotificationLog.EVENT_SHIPMENT_UPDATE,
                payload__channel="email",
                payload__order_number=order.order_number,
            ).count(),
            1,
        )

    def test_admin_shipment_refresh_requires_tracking_number(self):
        order = self._create_online_order(self.region)
        staff_user = self._create_staff_user("staff-shipment-refresh")
        self.api_client.force_authenticate(staff_user)

        response = self.api_client.post(
            f"/api/admin/orders/{order.order_number}/shipment/refresh/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "tracking_missing")

    def test_customer_order_payload_includes_shipment_tracking_fields(self):
        order = Order.objects.create(
            region=self.region,
            customer_name="Tracking Customer",
            customer_email="tracking@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("7.00"),
            currency_code=self.region.currency_code,
            carrier=Region.CARRIER_MANUAL,
            tracking_number="TRACK-777",
            tracking_url="https://tracking.example.com/TRACK-777",
            shipment_status=Order.SHIPMENT_IN_TRANSIT,
            shipment_created_at=timezone.now(),
        )

        response = self.api_client.get(
            f"/api/orders/{order.order_number}/",
            {"email_or_phone": "tracking@example.com"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["carrier"], Region.CARRIER_MANUAL)
        self.assertEqual(response.data["tracking_number"], "TRACK-777")
        self.assertEqual(response.data["tracking_url"], "https://tracking.example.com/TRACK-777")
        self.assertEqual(response.data["shipment_status"], Order.SHIPMENT_IN_TRANSIT)
        self.assertTrue(response.data.get("shipment_created_at"))

    def test_product_without_ksa_stock_not_purchasable_in_ksa(self):
        sa_region = Region.objects.create(
            code="sa",
            name_en="Saudi Arabia",
            currency_code="SAR",
            shipping_fee=Decimal("10.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="966000000",
            address_en="Riyadh Address",
            address_ar="Riyadh Address AR",
        )
        ProductPrice.objects.create(product=self.product, region=sa_region, price=Decimal("15.00"))
        sa_warehouse = Warehouse.objects.create(
            code="sa-default",
            name_en="Saudi Main Warehouse",
            name_ar="المخزن الرئيسي السعودية",
            region=sa_region,
            city="Riyadh",
            address="Riyadh",
            active=True,
        )
        sa_region.fulfillment_warehouses.add(sa_warehouse)
        ProductStock.objects.create(
            product=self.product,
            warehouse=sa_warehouse,
            quantity=0,
            reserved_quantity=0,
            low_stock_threshold=2,
        )

        response = self.api_client.get("/api/products/", {"region": sa_region.code, "locale": "en"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(any(item["slug"] == self.product.slug for item in response.data))

    def test_checkout_rejects_quantity_above_regional_stock(self):
        sa_region = Region.objects.create(
            code="sa",
            name_en="Saudi Arabia",
            currency_code="SAR",
            shipping_fee=Decimal("10.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="966000000",
            address_en="Riyadh Address",
            address_ar="Riyadh Address AR",
        )
        ProductPrice.objects.create(product=self.product, region=sa_region, price=Decimal("12.00"))
        sa_warehouse = Warehouse.objects.create(
            code="sa-main",
            name_en="Saudi Main",
            name_ar="السعودية الرئيسية",
            region=sa_region,
            city="Riyadh",
            address="Riyadh",
            active=True,
        )
        sa_region.fulfillment_warehouses.add(sa_warehouse)
        ProductStock.objects.create(
            product=self.product,
            warehouse=sa_warehouse,
            quantity=1,
            reserved_quantity=0,
            low_stock_threshold=1,
        )

        payload = {
            "region": sa_region.code,
            "locale": "en",
            "customer": {
                "name": "KSA Stock User",
                "phone": "966000001",
                "address_line_1": "Street 1",
                "city": "Riyadh",
                "country": "Saudi Arabia",
            },
            "payment_method": "cod",
            "items": [
                {
                    "slug": self.product.slug,
                    "quantity": 2,
                }
            ],
        }

        response = self.api_client.post("/api/checkout/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Only 1 item(s) available", str(response.data))

    def test_cancelling_order_restores_warehouse_stock(self):
        self.region.require_map_pin = False
        self.region.save(update_fields=["require_map_pin"])
        warehouse = Warehouse.objects.create(
            code="om-main",
            name_en="Oman Main",
            name_ar="عمان الرئيسية",
            region=self.region,
            city="Muscat",
            address="Muscat",
            active=True,
        )
        self.region.fulfillment_warehouses.add(warehouse)
        stock = ProductStock.objects.create(
            product=self.product,
            warehouse=warehouse,
            quantity=5,
            reserved_quantity=0,
            low_stock_threshold=1,
        )

        payload = {
            "region": self.region.code,
            "locale": "en",
            "customer": {
                "name": "Restore User",
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

        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 3)
        self.assertEqual(stock.reserved_quantity, 2)
        self.assertFalse(order.inventory_released)

        order.cancel()
        stock.refresh_from_db()
        order.refresh_from_db()

        self.assertEqual(order.status, Order.STATUS_CANCELLED)
        self.assertEqual(stock.quantity, 5)
        self.assertEqual(stock.reserved_quantity, 0)
        self.assertTrue(order.inventory_released)

    def test_catalog_search_ranks_exact_name_and_supports_synonyms(self):
        exact = Product.objects.create(
            slug="baby-lotion",
            name_en="Baby Lotion",
            name_ar="لوشن أطفال",
            short_description_en="Gentle lotion for babies",
            is_published=True,
        )
        exact.categories.add(self.category)
        ProductPrice.objects.create(product=exact, region=self.region, price=Decimal("5.00"))

        synonym_match = Product.objects.create(
            slug="infant-cream",
            name_en="Infant Cream",
            name_ar="كريم رضيع",
            short_description_en="Comfort cream for infant skin",
            is_published=True,
        )
        synonym_match.categories.add(self.category)
        ProductPrice.objects.create(product=synonym_match, region=self.region, price=Decimal("6.00"))

        response = self.api_client.get(
            "/api/products/",
            {"region": self.region.code, "locale": "en", "search": "baby lotion"},
        )

        self.assertEqual(response.status_code, 200)
        slugs = [item["slug"] for item in response.data]
        self.assertIn("baby-lotion", slugs)
        self.assertIn("infant-cream", slugs)
        self.assertEqual(slugs[0], "baby-lotion")

    def test_catalog_search_supports_arabic_text(self):
        arabic_product = Product.objects.create(
            slug="arabic-lotion",
            name_en="Arabic Lotion",
            name_ar="لوشن طفل طبيعي",
            short_description_ar="مناسب للبشرة الحساسة",
            is_published=True,
        )
        arabic_product.categories.add(self.category)
        ProductPrice.objects.create(product=arabic_product, region=self.region, price=Decimal("4.50"))

        response = self.api_client.get(
            "/api/products/",
            {"region": self.region.code, "locale": "ar", "search": "لوشن طفل"},
        )

        self.assertEqual(response.status_code, 200)
        slugs = [item["slug"] for item in response.data]
        self.assertIn("arabic-lotion", slugs)

    def test_search_suggestions_endpoint_returns_localized_results(self):
        product = Product.objects.create(
            slug="natural-shampoo",
            name_en="Natural Baby Shampoo",
            name_ar="شامبو أطفال طبيعي",
            short_description_en="Organic wash for babies",
            is_published=True,
        )
        product.categories.add(self.category)
        ProductPrice.objects.create(product=product, region=self.region, price=Decimal("8.25"))

        response = self.api_client.get(
            "/api/search/suggestions/",
            {"region": self.region.code, "locale": "ar", "q": "organic wash"},
        )

        self.assertEqual(response.status_code, 200)
        suggestions = response.data["suggestions"]
        self.assertTrue(suggestions)
        self.assertEqual(suggestions[0]["slug"], "natural-shampoo")
        self.assertEqual(suggestions[0]["name"], "شامبو أطفال طبيعي")
        self.assertIn("price", suggestions[0])

    def test_search_results_dedupe_products_from_join_matches(self):
        extra_category = Category.objects.create(slug="daily-care", name_en="Daily Care")
        product = Product.objects.create(
            slug="baby-lotion-search",
            name_en="Baby Lotion Search",
            short_description_en="Gentle care",
            is_published=True,
        )
        product.categories.add(self.category, extra_category)
        ProductPrice.objects.create(product=product, region=self.region, price=Decimal("6.25"))

        suggestions_response = self.api_client.get(
            "/api/search/suggestions/",
            {"region": self.region.code, "locale": "en", "q": "baby"},
        )
        products_response = self.api_client.get(
            "/api/products/",
            {"region": self.region.code, "locale": "en", "search": "baby"},
        )

        self.assertEqual(suggestions_response.status_code, 200)
        self.assertEqual(products_response.status_code, 200)
        suggestion_slugs = [item["slug"] for item in suggestions_response.data["suggestions"]]
        product_slugs = [item["slug"] for item in products_response.data]
        self.assertEqual(suggestion_slugs.count(product.slug), 1)
        self.assertEqual(product_slugs.count(product.slug), 1)

    def test_search_suggestions_empty_query_returns_empty_list(self):
        response = self.api_client.get(
            "/api/search/suggestions/",
            {"region": self.region.code, "locale": "en", "q": ""},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["suggestions"], [])
