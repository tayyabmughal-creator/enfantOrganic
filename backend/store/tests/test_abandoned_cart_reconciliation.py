from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from store.models import AbandonedCart, Order, Region
from store.services.abandoned_carts import order_converts, recover_carts_for_order
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

User = get_user_model()


def make_region(code, currency):
    return Region.objects.create(
        code=code,
        name_en=code.upper(),
        currency_code=currency,
        shipping_fee=Decimal("2.00"),
        shipping_threshold=Decimal("0.00"),
        contact_phone="12345678",
        address_en="Test Address",
    )


def make_order(region, **kwargs):
    defaults = dict(
        region=region,
        customer_name="Buyer",
        customer_email="buyer@example.com",
        customer_phone="96890000000",
        subtotal=Decimal("5.00"),
        grand_total=Decimal("5.00"),
        currency_code=region.currency_code,
    )
    defaults.update(kwargs)
    return Order.objects.create(**defaults)


def make_cart(region, token, **kwargs):
    cart = AbandonedCart.objects.create(
        session_token=token,
        customer_email=kwargs.get("customer_email", "buyer@example.com"),
        customer_phone=kwargs.get("customer_phone", "96890000000"),
        cart_items=[{"product_slug": "x", "quantity": 1}],
        subtotal=Decimal("5.00"),
        region=region,
    )
    # abandoned_at is auto_now_add; pin it to a fixed past instant so order
    # created_at >= abandoned_at holds in the admin-list reconciliation.
    if "abandoned_at" in kwargs:
        AbandonedCart.objects.filter(pk=cart.pk).update(abandoned_at=kwargs["abandoned_at"])
        cart.refresh_from_db()
    return cart


class AbandonedCartReconciliationTests(TestCase):
    """A cart is only 'recovered' by a CONVERTED order — a paid order, or an
    offline COD / WhatsApp / bank-transfer order. An unpaid online order sitting
    at the hosted payment page must NOT clear the cart (the Shopify-parity gap)."""

    def setUp(self):
        ensure_default_admin_roles()
        self.client = APIClient()
        self.om = make_region("om", "OMR")

    # ── order_converts / recover_carts_for_order helper ─────────────────────
    def test_order_converts_predicate(self):
        self.assertFalse(order_converts(Order(payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_UNPAID)))
        self.assertTrue(order_converts(Order(payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_PAID)))
        self.assertTrue(order_converts(Order(payment_method=Order.PAYMENT_COD, payment_status=Order.PAYMENT_UNPAID)))
        self.assertTrue(order_converts(Order(payment_method=Order.PAYMENT_WHATSAPP, payment_status=Order.PAYMENT_UNPAID)))

    def test_unpaid_online_order_does_not_recover(self):
        cart = make_cart(self.om, "sess-1")
        order = make_order(self.om, conversion_session_key="sess-1",
                           payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_UNPAID)
        self.assertEqual(recover_carts_for_order(order), 0)
        cart.refresh_from_db()
        self.assertEqual(cart.status, AbandonedCart.STATUS_ABANDONED)

    def test_paid_online_order_recovers(self):
        cart = make_cart(self.om, "sess-2")
        order = make_order(self.om, conversion_session_key="sess-2",
                           payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_PAID)
        self.assertEqual(recover_carts_for_order(order), 1)
        cart.refresh_from_db()
        self.assertEqual(cart.status, AbandonedCart.STATUS_RECOVERED)

    def test_cod_order_recovers(self):
        cart = make_cart(self.om, "sess-3")
        order = make_order(self.om, conversion_session_key="sess-3",
                           payment_method=Order.PAYMENT_COD, payment_status=Order.PAYMENT_UNPAID)
        self.assertEqual(recover_carts_for_order(order), 1)
        cart.refresh_from_db()
        self.assertEqual(cart.status, AbandonedCart.STATUS_RECOVERED)

    def test_recovery_matches_by_email_across_sessions(self):
        cart = make_cart(self.om, "other-device", customer_email="buyer@example.com", customer_phone="")
        order = make_order(self.om, conversion_session_key="unrelated",
                           payment_method=Order.PAYMENT_COD)
        self.assertEqual(recover_carts_for_order(order), 1)
        cart.refresh_from_db()
        self.assertEqual(cart.status, AbandonedCart.STATUS_RECOVERED)

    # ── AbandonedCartCreateView (public capture endpoint) ───────────────────
    def _post_cart(self, token, **overrides):
        body = {
            "session_token": token,
            "customer_email": "buyer@example.com",
            "customer_phone": "96890000000",
            "cart_items": [{"product_slug": "x", "quantity": 1, "unit_price": "5.00"}],
            "subtotal": "5.00", "currency_code": "OMR", "region": "om", "locale": "en",
        }
        body.update(overrides)
        return self.client.post("/api/abandoned-carts/", body, format="json")

    def test_capture_without_contact_info(self):
        resp = self._post_cart("anon-sess", customer_email="", customer_phone="")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(AbandonedCart.objects.get(session_token="anon-sess").status,
                         AbandonedCart.STATUS_ABANDONED)

    def test_create_view_keeps_cart_abandoned_for_unpaid_online(self):
        self._post_cart("ret-sess")
        make_order(self.om, conversion_session_key="ret-sess",
                   payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_UNPAID)
        self._post_cart("ret-sess")  # customer returns → reconciliation runs
        self.assertEqual(AbandonedCart.objects.get(session_token="ret-sess").status,
                         AbandonedCart.STATUS_ABANDONED)

    # ── AdminAbandonedCartListView ghost-cleanup ────────────────────────────
    def test_admin_list_hides_only_converted(self):
        past = timezone.now() - timezone.timedelta(hours=1)
        make_cart(self.om, "unpaid-sess", customer_email="a@example.com", customer_phone="", abandoned_at=past)
        make_cart(self.om, "paid-sess", customer_email="b@example.com", customer_phone="", abandoned_at=past)
        make_cart(self.om, "cod-sess", customer_email="c@example.com", customer_phone="", abandoned_at=past)
        make_order(self.om, conversion_session_key="unpaid-sess", customer_email="a@example.com",
                   payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_UNPAID)
        make_order(self.om, conversion_session_key="paid-sess", customer_email="b@example.com",
                   payment_method=Order.PAYMENT_ONLINE, payment_status=Order.PAYMENT_PAID)
        make_order(self.om, conversion_session_key="cod-sess", customer_email="c@example.com",
                   payment_method=Order.PAYMENT_COD, payment_status=Order.PAYMENT_UNPAID)

        staff = User.objects.create_user(username="mgr", email="mgr@example.com",
                                         password="Pass12345!", is_staff=True)
        staff.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.client.force_authenticate(staff)
        resp = self.client.get("/api/admin/abandoned-carts/")
        self.assertEqual(resp.status_code, 200)
        rows = resp.data["results"] if isinstance(resp.data, dict) and "results" in resp.data else resp.data
        tokens = {r["session_token"] for r in rows}
        self.assertIn("unpaid-sess", tokens)       # unpaid online → still visible
        self.assertNotIn("paid-sess", tokens)      # paid → recovered/hidden
        self.assertNotIn("cod-sess", tokens)       # COD → recovered/hidden
