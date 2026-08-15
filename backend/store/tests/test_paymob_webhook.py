"""
Paymob webhook, exercised the way production runs it.

These use TransactionTestCase, not TestCase, on purpose. TestCase wraps every
test in a transaction, which silently satisfies the `select_for_update()` in the
webhook handler — so the missing `transaction.atomic` that made every live
callback die with a 500 was invisible to the suite while the other providers'
webhook tests all passed. Only a test that runs without an ambient transaction
reproduces it.
"""
import hashlib
import hmac
from decimal import Decimal

from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from store.models import Order, PaymentTransaction, Region
from store.services import paymob

HMAC_SECRET = "test-hmac-secret"


def _paymob_scalar(obj, dotted_key):
    """
    Render one field the way Paymob does when it signs a callback.

    Deliberately independent of ``paymob._get``. Signing with the same helper the
    code verifies with makes the test agree with itself: it passed for months
    while every real callback was rejected, because both sides rendered booleans
    as ``True`` where Paymob sends ``true``. This mirrors the wire format instead.
    """
    keys = dotted_key.split(".", 1)
    value = obj.get(keys[0], "")
    if len(keys) == 2 and isinstance(value, dict):
        value = value.get(keys[1], "")
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def sign(obj, secret=HMAC_SECRET):
    concat = "".join(_paymob_scalar(obj, field) for field in paymob._HMAC_FIELDS)
    return hmac.new(secret.encode(), concat.encode(), hashlib.sha512).hexdigest()


def transaction_payload(merchant_order_id, *, success=True, tx_id=555001):
    return {
        "amount_cents": 700,
        "created_at": "2026-08-07T10:00:00",
        "currency": "OMR",
        "error_occured": False,
        "has_parent_transaction": False,
        "id": tx_id,
        "integration_id": 1001,
        "is_3d_secure": True,
        "is_auth": False,
        "is_capture": False,
        "is_refunded": False,
        "is_standalone_payment": True,
        "is_voided": False,
        "order": {"id": 987654, "merchant_order_id": merchant_order_id},
        "owner": 1,
        "pending": False,
        "source_data": {"pan": "1111", "sub_type": "MasterCard", "type": "card"},
        "success": success,
    }


@override_settings(
    PAYMOB_API_KEY="paymob-key",
    PAYMOB_INTEGRATION_ID="1001",
    PAYMOB_IFRAME_ID="2002",
    PAYMOB_HMAC_SECRET=HMAC_SECRET,
)
class PaymobWebhookTests(TransactionTestCase):
    def setUp(self):
        self.client = APIClient()
        self.region = Region.objects.create(
            code="om",
            name_en="Oman",
            name_ar="عمان",
            currency_code="OMR",
            locale_code="en",
            shipping_threshold=Decimal("0.00"),
            contact_phone="123",
            address_en="A",
            address_ar="ب",
            is_default=True,
            payment_enabled_providers=["paymob"],
            default_payment_provider="paymob",
        )
        self.order = Order.objects.create(
            region=self.region,
            customer_name="Payment User",
            customer_email="payment@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("2.00"),
            grand_total=Decimal("7.00"),
            currency_code="OMR",
            payment_method=Order.PAYMENT_ONLINE,
            payment_status=Order.PAYMENT_UNPAID,
        )

    def post_webhook(self, obj):
        return self.client.post(
            f"/api/payments/webhook/?hmac={sign(obj)}",
            {"type": "TRANSACTION", "obj": obj},
            format="json",
        )

    def test_successful_callback_marks_the_order_paid(self):
        response = self.post_webhook(transaction_payload(self.order.order_number))

        self.assertEqual(response.status_code, 200, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PAYMENT_PAID)

    def test_callback_for_a_retried_reference_still_finds_the_order(self):
        """
        Retries go to Paymob as "<order number>-rN" because it refuses a repeated
        reference, so the callback quotes that back. Without stripping it the
        payment lands with no order to mark paid.
        """
        response = self.post_webhook(
            transaction_payload(f"{self.order.order_number}-r3", tx_id=555002)
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PAYMENT_PAID)

    def test_forged_signature_is_rejected(self):
        obj = transaction_payload(self.order.order_number, tx_id=555003)
        response = self.client.post(
            "/api/payments/webhook/?hmac=deadbeef",
            {"type": "TRANSACTION", "obj": obj},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get("code"), "invalid_signature")
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PAYMENT_UNPAID)

    def test_unknown_order_answers_cleanly_instead_of_crashing(self):
        response = self.post_webhook(transaction_payload("EO-NOPE-0001", tx_id=555004))

        self.assertEqual(response.status_code, 404)

    def test_duplicate_callback_is_not_applied_twice(self):
        obj = transaction_payload(self.order.order_number, tx_id=555005)
        first = self.post_webhook(obj)
        second = self.post_webhook(obj)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data.get("status"), "already_processed")
        self.assertEqual(
            PaymentTransaction.objects.filter(
                order=self.order, provider_reference="555005"
            ).count(),
            1,
        )
