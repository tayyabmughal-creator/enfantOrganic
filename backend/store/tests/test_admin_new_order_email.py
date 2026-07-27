from decimal import Decimal

from django.core import mail
from django.test import TestCase, override_settings

from store.models import NotificationLog, Order, OrderItem, Region
from store.notifications import _dispatch_admin_order_email, _dispatch_order_event


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
    FRONTEND_PUBLIC_URL="https://www.enfantorganic.com",
)
class AdminNewOrderEmailTests(TestCase):
    def setUp(self):
        self.region = make_region()
        self.order = Order.objects.create(
            region=self.region,
            order_number="ENF-TEST-1",
            customer_name="Fatima Al Balushi",
            customer_email="buyer@example.com",
            customer_phone="+968 9123 4567",
            address_line_1="Way 1234, Al Khuwair",
            city="Muscat",
            country="Oman",
            grand_total=Decimal("24.500"),
            currency_code="OMR",
            payment_method=Order.PAYMENT_COD,
        )
        OrderItem.objects.create(
            order=self.order,
            product_name="Baby Lotion",
            quantity=2,
            unit_price=Decimal("10.000"),
            line_total=Decimal("20.000"),
        )

    @override_settings(ADMIN_ORDER_EMAIL="owner@enfantorganic.com")
    def test_owner_receives_new_order_alert(self):
        log = _dispatch_admin_order_email(self.order, NotificationLog.EVENT_ADMIN_NEW_ORDER)

        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["owner@enfantorganic.com"])
        self.assertIn("ENF-TEST-1", message.subject)
        self.assertIn("24.500 OMR", message.subject)
        self.assertEqual(message.reply_to, ["buyer@example.com"])

        html_body = message.alternatives[0][0]
        self.assertIn("Baby Lotion", html_body)
        self.assertIn("Fatima Al Balushi", html_body)
        # wa.me link is built from the phone digits so staff can reply in one click.
        self.assertIn("https://wa.me/96891234567", html_body)
        self.assertIn("https://www.enfantorganic.com/admin", html_body)

        self.assertEqual(log.status, NotificationLog.STATUS_SENT)
        self.assertEqual(log.channel, NotificationLog.CHANNEL_EMAIL)
        self.assertEqual(log.recipient, "owner@enfantorganic.com")

    @override_settings(ADMIN_ORDER_EMAIL="owner@enfantorganic.com")
    def test_alert_is_not_sent_twice_for_the_same_order(self):
        _dispatch_admin_order_email(self.order, NotificationLog.EVENT_ADMIN_NEW_ORDER)
        second = _dispatch_admin_order_email(self.order, NotificationLog.EVENT_ADMIN_NEW_ORDER)

        self.assertIsNone(second)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(ADMIN_ORDER_EMAIL="")
    def test_missing_recipient_is_logged_as_skipped(self):
        log = _dispatch_admin_order_email(self.order, NotificationLog.EVENT_ADMIN_NEW_ORDER)

        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(log.status, NotificationLog.STATUS_SKIPPED)
        self.assertIn("No admin order email configured", log.error_message)

    @override_settings(ADMIN_ORDER_EMAIL="owner@enfantorganic.com")
    def test_order_created_dispatch_emails_both_customer_and_owner(self):
        _dispatch_order_event(self.order.pk, NotificationLog.EVENT_ORDER_CREATED)

        recipients = sorted(message.to[0] for message in mail.outbox)
        self.assertEqual(recipients, ["buyer@example.com", "owner@enfantorganic.com"])

        self.assertTrue(
            NotificationLog.objects.filter(
                order=self.order,
                event=NotificationLog.EVENT_ORDER_CREATED,
                channel=NotificationLog.CHANNEL_EMAIL,
                recipient="buyer@example.com",
                status=NotificationLog.STATUS_SENT,
            ).exists()
        )
        self.assertTrue(
            NotificationLog.objects.filter(
                order=self.order,
                event=NotificationLog.EVENT_ADMIN_NEW_ORDER,
                channel=NotificationLog.CHANNEL_EMAIL,
                recipient="owner@enfantorganic.com",
                status=NotificationLog.STATUS_SENT,
            ).exists()
        )

    @override_settings(ADMIN_ORDER_EMAIL="owner@enfantorganic.com")
    def test_owner_is_alerted_even_when_customer_has_no_email(self):
        self.order.customer_email = ""
        self.order.save(update_fields=["customer_email"])

        _dispatch_order_event(self.order.pk, NotificationLog.EVENT_ORDER_CREATED)

        self.assertEqual([message.to for message in mail.outbox], [["owner@enfantorganic.com"]])

    @override_settings(ADMIN_ORDER_EMAIL="owner@enfantorganic.com")
    def test_customer_email_absent_leaves_reply_to_unset(self):
        self.order.customer_email = ""
        self.order.save(update_fields=["customer_email"])

        _dispatch_admin_order_email(self.order, NotificationLog.EVENT_ADMIN_NEW_ORDER)

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].reply_to, [])
