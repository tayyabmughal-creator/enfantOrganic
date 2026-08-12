import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from store.api_views.admin_ops import build_cogs_report_rows, exclude_non_sales
from store.models import Order, OrderItem, Product, ProductPrice, Region
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

User = get_user_model()


def _region(code, name, currency, fx, *, is_default=False):
    return Region.objects.create(
        code=code, name_en=name, currency_code=currency, fx_rate=fx,
        is_active=True, is_default=is_default,
        shipping_fee=Decimal("0.00"), shipping_threshold=Decimal("0.00"),
        contact_phone="12345678", address_en="Test Address",
    )


class DraftOrdersInReportingTestCase(TestCase):
    """A pending draft order was counted by the Dashboard and the COGS report but
    not by the Orders list, so the three screens each showed a different figure.

    Reproduces the shape of the client's June: an SAR draft order appearing in a
    month whose Orders list holds no SAR order at all.
    """

    def setUp(self):
        ensure_default_admin_roles()
        self.client_api = APIClient()
        user = User.objects.create_user(username="mgr-draft", password="Pass12345!", is_staff=True)
        user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.client_api.force_authenticate(user=user)

        self.om = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.sa = _region("sa", "Saudi Arabia", "SAR", Decimal("9.750000"))

        self.product = Product.objects.create(
            slug="lotion", name_en="Lotion", name_ar="لوشن", is_published=True, cost_price=Decimal("1.000"),
        )
        ProductPrice.objects.create(product=self.product, region=self.om, price=Decimal("5.000"))

        self.online = self._order(self.om, "OMR", "20.00", Order.SALES_CHANNEL_ONLINE_STORE)
        self.draft_pending = self._order(self.sa, "SAR", "47.78", Order.SALES_CHANNEL_DRAFT_ORDER)

    def _order(self, region, currency, total, channel, *, paid=False, status=Order.STATUS_PENDING):
        order = Order.objects.create(
            region=region, customer_name="B", customer_email="b@example.com", customer_phone="1",
            address_line_1="a", city="c", country="c",
            subtotal=Decimal(total), shipping_total=Decimal("0.00"), grand_total=Decimal(total),
            currency_code=currency, sales_channel=channel, status=status,
            payment_status=Order.PAYMENT_PAID if paid else Order.PAYMENT_UNPAID,
        )
        OrderItem.objects.create(
            order=order, product=self.product, product_slug=self.product.slug,
            product_name=self.product.name_en, quantity=1,
            unit_price=Decimal(total), line_total=Decimal(total),
            unit_cost_price=Decimal("1.000"), line_cost_total=Decimal("1.000"),
        )
        return order

    # ── the rule itself ──────────────────────────────────────────────────────

    def test_an_unpaid_draft_is_not_a_sale(self):
        kept = exclude_non_sales(Order.objects.all())

        self.assertIn(self.online, kept)
        self.assertNotIn(self.draft_pending, kept)

    def test_a_paid_draft_is_a_sale(self):
        # There is no step that converts a draft into a real order, so payment is
        # the only honest signal that it became one.
        paid_draft = self._order(self.om, "OMR", "9.00", Order.SALES_CHANNEL_DRAFT_ORDER, paid=True)

        self.assertIn(paid_draft, exclude_non_sales(Order.objects.all()))

    def test_cancelled_and_refunded_are_still_excluded(self):
        for status in (Order.STATUS_CANCELLED, Order.STATUS_REFUNDED, Order.STATUS_FAILED):
            order = self._order(self.om, "OMR", "5.00", Order.SALES_CHANNEL_ONLINE_STORE, status=status)
            self.assertNotIn(order, exclude_non_sales(Order.objects.all()), status)

    # ── the three screens now agree ──────────────────────────────────────────

    def test_the_cogs_report_leaves_the_unpaid_draft_out(self):
        _rows, totals = build_cogs_report_rows()

        self.assertEqual(totals["orders_included"], 1)
        # The client's exact complaint: an SAR column in a month with no SAR order.
        self.assertNotIn("SAR", totals["currencies"])

    def test_the_dashboard_leaves_the_unpaid_draft_out(self):
        response = self.client_api.get("/api/admin/dashboard/", {"top_date_range": "all_time"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["orders"], 1)
        self.assertEqual(float(response.data["revenue"]), 20.0)

    def test_a_paid_draft_reaches_both_screens(self):
        self._order(self.om, "OMR", "9.00", Order.SALES_CHANNEL_DRAFT_ORDER, paid=True)

        _rows, totals = build_cogs_report_rows()
        response = self.client_api.get("/api/admin/dashboard/", {"top_date_range": "all_time"})

        self.assertEqual(totals["orders_included"], 2)
        self.assertEqual(response.data["orders"], 2)

    def test_report_and_dashboard_count_the_same_orders(self):
        # The whole point: whatever else differs, the order count must not.
        self._order(self.om, "OMR", "7.00", Order.SALES_CHANNEL_ONLINE_STORE)
        self._order(self.om, "OMR", "3.00", Order.SALES_CHANNEL_DRAFT_ORDER, paid=True)
        self._order(self.om, "OMR", "4.00", Order.SALES_CHANNEL_DRAFT_ORDER)

        _rows, totals = build_cogs_report_rows()
        response = self.client_api.get("/api/admin/dashboard/", {"top_date_range": "all_time"})

        self.assertEqual(totals["orders_included"], response.data["orders"])

    def test_a_date_scoped_report_applies_the_same_rule(self):
        today = datetime.date.today()
        _rows, totals = build_cogs_report_rows(start_date=today, end_date=today)

        self.assertEqual(totals["orders_included"], 1)
        self.assertNotIn("SAR", totals["currencies"])

    # ── deleting a draft ─────────────────────────────────────────────────────

    def test_a_draft_order_can_be_deleted(self):
        # The client could not throw a draft away: the admin only offered the
        # delete button on the Orders tab, never on Draft Orders.
        number = self.draft_pending.order_number

        response = self.client_api.delete(f"/api/admin/orders/{number}/")

        self.assertIn(response.status_code, (200, 204))
        self.assertFalse(Order.objects.filter(order_number=number).exists())

    def test_deleting_a_draft_takes_its_items_with_it(self):
        number = self.draft_pending.order_number

        self.client_api.delete(f"/api/admin/orders/{number}/")

        self.assertFalse(OrderItem.objects.filter(order__order_number=number).exists())
