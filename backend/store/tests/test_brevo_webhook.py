from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import reverse

from store.models import NotificationLog, Order, OrderItem, Region
from store.notifications import _dispatch_admin_order_email

WEBHOOK_TOKEN = "test-webhook-token"


def make_region():
    return Region.objects.create(
        code="om",
        name_en="Oman",
        name_ar="عمان",
        currency_code="OMR",
        shipping_fee=Decimal("2.00"),
        shipping_threshold=Decimal("0.00"),
        contact_phone="12345678",
        address_en="Test Address",
    )


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="orders@enfantorganic.com",
    BREVO_WEBHOOK_TOKEN=WEBHOOK_TOKEN,
)
class BrevoWebhookTests(TestCase):
    def setUp(self):
        self.url = reverse("brevo-webhook")
        self.log = NotificationLog.objects.create(
            channel=NotificationLog.CHANNEL_EMAIL,
            event=NotificationLog.EVENT_ORDER_CREATED,
            recipient="buyer@example.com",
            status=NotificationLog.STATUS_SENT,
            success=True,
            provider="smtp",
            provider_message_id="<abc123@enfantorganic.com>",
            title="order_created",
            body="body",
        )

    def _post(self, payload, *, token=WEBHOOK_TOKEN, header=False):
        url = self.url if header else f"{self.url}?token={token}"
        kwargs = {"content_type": "application/json"}
        if header:
            kwargs["HTTP_X_BREVO_TOKEN"] = token
        return self.client.post(url, payload, **kwargs)

    def _event(self, event, **extra):
        return {
            "event": event,
            "email": "buyer@example.com",
            "message-id": "<abc123@enfantorganic.com>",
            "date": "2026-07-27 18:00:00",
            **extra,
        }

    # --- auth ---------------------------------------------------------------

    def test_missing_token_is_rejected(self):
        response = self.client.post(self.url, self._event("delivered"), content_type="application/json")

        self.assertEqual(response.status_code, 403)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_SENT)

    def test_wrong_token_is_rejected(self):
        response = self._post(self._event("delivered"), token="not-the-token")

        self.assertEqual(response.status_code, 403)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_SENT)

    @override_settings(BREVO_WEBHOOK_TOKEN="")
    def test_endpoint_fails_closed_when_unconfigured(self):
        response = self._post(self._event("delivered"))

        self.assertEqual(response.status_code, 503)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_SENT)

    def test_token_is_accepted_from_header(self):
        response = self._post(self._event("delivered"), header=True)

        self.assertEqual(response.status_code, 200)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_DELIVERED)

    # --- status transitions -------------------------------------------------

    def test_delivered_receipt_upgrades_sent_to_delivered(self):
        response = self._post(self._event("delivered"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["applied"], 1)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_DELIVERED)
        self.assertTrue(self.log.success)
        self.assertIsNotNone(self.log.sent_at)
        self.assertEqual(self.log.payload["brevo_event"]["event"], "delivered")

    def test_hard_bounce_marks_failure_with_reason(self):
        response = self._post(self._event("hard_bounce", reason="mailbox does not exist"))

        self.assertEqual(response.status_code, 200)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_BOUNCED)
        self.assertFalse(self.log.success)
        self.assertEqual(self.log.error_message, "mailbox does not exist")

    def test_blocked_receipt_records_the_rejection(self):
        """The production failure mode: relay accepts, Brevo rejects afterwards."""
        response = self._post(
            self._event("blocked", reason="sender orders@enfantorganic.com is not valid")
        )

        self.assertEqual(response.status_code, 200)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_BLOCKED)
        self.assertFalse(self.log.success)
        self.assertIn("not valid", self.log.error_message)

    def test_spam_complaint_overrides_delivered(self):
        self._post(self._event("delivered"))
        self._post(self._event("spam"))

        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_SPAM)
        self.assertFalse(self.log.success)

    def test_out_of_order_deferred_does_not_downgrade_delivered(self):
        self._post(self._event("delivered"))
        response = self._post(self._event("deferred"))

        self.assertEqual(response.json()["ignored"], 1)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_DELIVERED)

    def test_replayed_delivered_receipt_is_idempotent(self):
        self._post(self._event("delivered"))
        self._post(self._event("delivered"))

        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_DELIVERED)
        self.assertEqual(NotificationLog.objects.count(), 1)

    # --- matching / noise ---------------------------------------------------

    def test_engagement_events_never_change_status(self):
        for event_name in ("opened", "click", "unsubscribed"):
            self._post(self._event(event_name))

        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_SENT)

    def test_unknown_message_id_creates_no_log(self):
        response = self._post(self._event("delivered", **{"message-id": "<nope@example.com>"}))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["unmatched"], 1)
        self.assertEqual(NotificationLog.objects.count(), 1)
        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_SENT)

    def test_batched_events_are_all_applied(self):
        other = NotificationLog.objects.create(
            channel=NotificationLog.CHANNEL_EMAIL,
            event=NotificationLog.EVENT_ADMIN_NEW_ORDER,
            recipient="owner@enfantorganic.com",
            status=NotificationLog.STATUS_SENT,
            provider_message_id="<def456@enfantorganic.com>",
            title="admin",
            body="body",
        )
        payload = [
            self._event("delivered"),
            self._event("blocked", **{"message-id": "<def456@enfantorganic.com>"}),
        ]

        response = self._post(payload)

        self.assertEqual(response.json()["applied"], 2)
        self.log.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_DELIVERED)
        self.assertEqual(other.status, NotificationLog.STATUS_BLOCKED)

    def test_camel_case_message_id_key_is_matched(self):
        payload = {
            "event": "delivered",
            "email": "buyer@example.com",
            "messageId": "<abc123@enfantorganic.com>",
        }

        self._post(payload)

        self.log.refresh_from_db()
        self.assertEqual(self.log.status, NotificationLog.STATUS_DELIVERED)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="orders@enfantorganic.com",
    FRONTEND_PUBLIC_URL="https://www.enfantorganic.com",
    ADMIN_ORDER_EMAIL="owner@enfantorganic.com",
    BREVO_WEBHOOK_TOKEN=WEBHOOK_TOKEN,
)
class MessageIdCaptureTests(TestCase):
    """Without a stored Message-ID the webhook can never find its row."""

    def setUp(self):
        self.region = make_region()
        self.order = Order.objects.create(
            region=self.region,
            order_number="ENF-WEBHOOK-1",
            customer_name="Fatima Al Balushi",
            customer_email="buyer@example.com",
            customer_phone="+968 9123 4567",
            address_line_1="Way 1234",
            city="Muscat",
            country="Oman",
            grand_total=Decimal("24.500"),
            currency_code="OMR",
            payment_method=Order.PAYMENT_COD,
        )
        OrderItem.objects.create(
            order=self.order,
            product_name="Baby Lotion",
            quantity=1,
            unit_price=Decimal("24.500"),
            line_total=Decimal("24.500"),
        )

    def test_admin_alert_stores_the_sent_message_id(self):
        from django.core import mail

        log = _dispatch_admin_order_email(self.order, NotificationLog.EVENT_ADMIN_NEW_ORDER)

        self.assertTrue(log.provider_message_id)
        self.assertEqual(mail.outbox[0].extra_headers["Message-ID"], log.provider_message_id)

    def test_stored_message_id_lets_a_receipt_land_on_the_order(self):
        log = _dispatch_admin_order_email(self.order, NotificationLog.EVENT_ADMIN_NEW_ORDER)

        self.client.post(
            f"{reverse('brevo-webhook')}?token={WEBHOOK_TOKEN}",
            {
                "event": "delivered",
                "email": "owner@enfantorganic.com",
                "message-id": log.provider_message_id,
            },
            content_type="application/json",
        )

        log.refresh_from_db()
        self.assertEqual(log.status, NotificationLog.STATUS_DELIVERED)
        self.assertEqual(log.order, self.order)

    def test_message_id_domain_matches_the_sending_domain(self):
        from django.core import mail

        _dispatch_admin_order_email(self.order, NotificationLog.EVENT_ADMIN_NEW_ORDER)

        self.assertTrue(mail.outbox[0].extra_headers["Message-ID"].endswith("@enfantorganic.com>"))

    def test_delivered_receipt_does_not_unlock_a_resend(self):
        """A webhook must not make the dedup check miss and re-mail the customer."""
        from django.core import mail

        from store.notifications import _dispatch_customer_event

        log = _dispatch_customer_event(self.order, NotificationLog.EVENT_ORDER_CREATED)
        self.client.post(
            f"{reverse('brevo-webhook')}?token={WEBHOOK_TOKEN}",
            {
                "event": "delivered",
                "email": "buyer@example.com",
                "message-id": log.provider_message_id,
            },
            content_type="application/json",
        )
        log.refresh_from_db()
        self.assertEqual(log.status, NotificationLog.STATUS_DELIVERED)

        sent_before = len(mail.outbox)
        _dispatch_customer_event(self.order, NotificationLog.EVENT_ORDER_CREATED)

        self.assertEqual(len(mail.outbox), sent_before)

    def test_bounced_receipt_does_not_unlock_a_resend(self):
        from django.core import mail

        from store.notifications import _dispatch_customer_event

        log = _dispatch_customer_event(self.order, NotificationLog.EVENT_ORDER_CREATED)
        self.client.post(
            f"{reverse('brevo-webhook')}?token={WEBHOOK_TOKEN}",
            {
                "event": "hard_bounce",
                "email": "buyer@example.com",
                "message-id": log.provider_message_id,
                "reason": "unknown recipient",
            },
            content_type="application/json",
        )
        log.refresh_from_db()
        self.assertEqual(log.status, NotificationLog.STATUS_BOUNCED)

        sent_before = len(mail.outbox)
        _dispatch_customer_event(self.order, NotificationLog.EVENT_ORDER_CREATED)

        self.assertEqual(len(mail.outbox), sent_before)
