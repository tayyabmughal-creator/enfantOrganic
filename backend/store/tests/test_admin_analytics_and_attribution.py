import io
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image as PILImage
from rest_framework.test import APIClient

from store.api_views.admin_ops import normalize_traffic_source
from store.models import AnalyticsEvent, Order, Product, Region, Review
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

User = get_user_model()


def _region(code, name, currency, fx, *, is_default=False):
    return Region.objects.create(
        code=code,
        name_en=name,
        currency_code=currency,
        fx_rate=fx,
        is_active=True,
        is_default=is_default,
        shipping_fee=Decimal("0.00"),
        shipping_threshold=Decimal("0.00"),
        contact_phone="12345678",
        address_en="Test Address",
    )


class AdminAnalyticsWindowTestCase(TestCase):
    """Analytics had no date control at all — it only ever showed all time."""

    def setUp(self):
        ensure_default_admin_roles()
        self.client_api = APIClient()
        user = User.objects.create_user(username="mgr", password="Pass12345!", is_staff=True)
        user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.client_api.force_authenticate(user=user)

        self.om = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.ae = _region("ae", "UAE", "AED", Decimal("9.550000"))

        now = timezone.now()
        self._event("s-today-om", self.om, now - timedelta(hours=1))
        self._event("s-today-ae", self.ae, now - timedelta(hours=2))
        self._event("s-old-om", self.om, now - timedelta(days=45))

    def _event(self, session, region, when, metadata=None):
        event = AnalyticsEvent.objects.create(
            event_type=AnalyticsEvent.EVENT_PAGE_VIEW,
            session_key=session,
            region=region,
            metadata=metadata or {},
        )
        AnalyticsEvent.objects.filter(pk=event.pk).update(created_at=when)
        return event

    def _get(self, **params):
        response = self.client_api.get("/api/admin/analytics/", params)
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_the_default_window_excludes_older_traffic(self):
        data = self._get()

        self.assertEqual(data["date_range"], "last_30_days")
        self.assertEqual(data["visitors"], 2)

    def test_all_time_includes_everything(self):
        data = self._get(date_range="all_time")

        self.assertEqual(data["visitors"], 3)

    def test_a_custom_range_is_honoured(self):
        today = timezone.localdate()
        data = self._get(
            date_range="custom",
            start_date=(today - timedelta(days=1)).isoformat(),
            end_date=today.isoformat(),
        )

        self.assertEqual(data["visitors"], 2)

    def test_a_reversed_custom_range_is_read_the_right_way_round(self):
        today = timezone.localdate()
        data = self._get(
            date_range="custom",
            start_date=today.isoformat(),
            end_date=(today - timedelta(days=1)).isoformat(),
        )

        self.assertEqual(data["visitors"], 2)

    def test_sessions_are_broken_down_by_market(self):
        data = self._get(date_range="all_time")
        by_code = {row["code"]: row for row in data["sessions_by_region"]}

        self.assertEqual(by_code["om"]["sessions"], 2)
        self.assertEqual(by_code["om"]["name"], "Oman")
        self.assertEqual(by_code["ae"]["sessions"], 1)


class AdminAttributionTestCase(TestCase):
    """The attribution was captured on every order but had nowhere to be read."""

    def setUp(self):
        ensure_default_admin_roles()
        self.client_api = APIClient()
        user = User.objects.create_user(username="mgr2", password="Pass12345!", is_staff=True)
        user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.client_api.force_authenticate(user=user)

        self.om = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.ae = _region("ae", "UAE", "AED", Decimal("9.550000"))

    def _order(self, region, currency, total, attribution, status=Order.STATUS_PAID):
        return Order.objects.create(
            region=region, customer_name="B", customer_email="b@example.com", customer_phone="1",
            address_line_1="a", city="c", country="c",
            subtotal=Decimal(total), shipping_total=Decimal("0.00"), grand_total=Decimal(total),
            currency_code=currency, status=status, payment_status=Order.PAYMENT_PAID,
            conversion_attribution=attribution,
        )

    def _rows(self, **params):
        response = self.client_api.get("/api/admin/attribution/", params)
        self.assertEqual(response.status_code, 200)
        return response.data, {row["source"]: row for row in response.data["rows"]}

    def test_orders_are_grouped_by_the_platform_they_came_from(self):
        self._order(self.om, "OMR", "10.00", {"source": "Instagram"})
        self._order(self.om, "OMR", "20.00", {"utm_source": "ig", "utm_medium": "paid"})
        self._order(self.om, "OMR", "5.00", {"referrer": "https://www.google.com/"})

        _payload, rows = self._rows(date_range="all_time")

        self.assertEqual(rows["Instagram"]["orders"], 2)
        self.assertEqual(rows["Google"]["orders"], 1)

    def test_revenue_is_reported_per_currency_never_summed(self):
        self._order(self.om, "OMR", "10.00", {"source": "Instagram"})
        self._order(self.ae, "AED", "95.50", {"source": "Instagram"})

        _payload, rows = self._rows(date_range="all_time")
        revenue = {entry["currency"]: entry["amount"] for entry in rows["Instagram"]["revenue"]}

        self.assertEqual(revenue["OMR"], "10.00")
        self.assertEqual(revenue["AED"], "95.50")
        # 95.50 AED converts to 10.00 OMR, plus the 10.00 OMR order.
        self.assertEqual(rows["Instagram"]["revenue_omr"], "20.00")

    def test_an_order_with_no_attribution_is_counted_and_flagged(self):
        self._order(self.om, "OMR", "10.00", {})

        payload, rows = self._rows(date_range="all_time")

        self.assertEqual(payload["orders_without_attribution"], 1)
        self.assertEqual(rows["Direct"]["orders"], 1)

    def test_cancelled_orders_are_left_out(self):
        self._order(self.om, "OMR", "10.00", {"source": "Instagram"}, status=Order.STATUS_CANCELLED)

        payload, _rows = self._rows(date_range="all_time")

        self.assertEqual(payload["orders_total"], 0)

    def test_conversion_rate_pairs_orders_with_that_platform_s_sessions(self):
        self._order(self.om, "OMR", "10.00", {"source": "Instagram"})
        for index in range(4):
            event = AnalyticsEvent.objects.create(
                event_type=AnalyticsEvent.EVENT_PAGE_VIEW,
                session_key=f"sess-{index}",
                region=self.om,
                metadata={"source": "Instagram"},
            )
            AnalyticsEvent.objects.filter(pk=event.pk).update(created_at=timezone.now())

        _payload, rows = self._rows(date_range="all_time")

        self.assertEqual(rows["Instagram"]["sessions"], 4)
        self.assertEqual(rows["Instagram"]["conversion_rate"], 25.0)

    def test_a_platform_that_brought_traffic_but_no_orders_still_appears(self):
        event = AnalyticsEvent.objects.create(
            event_type=AnalyticsEvent.EVENT_PAGE_VIEW,
            session_key="tiktok-visitor",
            region=self.om,
            metadata={"source": "TikTok"},
        )
        AnalyticsEvent.objects.filter(pk=event.pk).update(created_at=timezone.now())

        _payload, rows = self._rows(date_range="all_time")

        self.assertEqual(rows["TikTok"]["orders"], 0)
        self.assertEqual(rows["TikTok"]["sessions"], 1)


class TrafficSourceNamingTestCase(TestCase):
    """Sessions and orders must be bucketed by identical rules to be comparable."""

    def test_a_link_carrying_only_utm_parameters_is_still_attributed(self):
        # What a Meta ad click looks like once the referrer is stripped.
        self.assertEqual(normalize_traffic_source({"utm_source": "ig", "utm_medium": "paid"}), "Instagram")
        self.assertEqual(normalize_traffic_source({"utm_source": "fb"}), "Facebook")

    def test_the_full_platform_name_is_recognised_wherever_it_appears(self):
        self.assertEqual(normalize_traffic_source({"source": "Instagram"}), "Instagram")
        self.assertEqual(normalize_traffic_source({"referrer": "https://l.instagram.com/"}), "Instagram")
        self.assertEqual(normalize_traffic_source({"referrer": "https://www.google.com/"}), "Google")
        self.assertEqual(normalize_traffic_source({"utm_campaign": "tiktok-spring"}), "TikTok")

    def test_nothing_recognisable_is_direct(self):
        self.assertEqual(normalize_traffic_source({}), "Direct")
        self.assertEqual(normalize_traffic_source(None), "Direct")

    def test_an_unrecognised_source_keeps_its_own_name(self):
        self.assertEqual(normalize_traffic_source({"source": "Newsletter"}), "Newsletter")


class AdminReviewAdminTestCase(TestCase):
    """The review editor showed a raw product id and had no way to attach a photo."""

    def setUp(self):
        ensure_default_admin_roles()
        self.client_api = APIClient()
        user = User.objects.create_user(username="mgr3", password="Pass12345!", is_staff=True)
        user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.client_api.force_authenticate(user=user)
        self.product = Product.objects.create(slug="lotion", name_en="Baby Lotion", name_ar="لوشن")

    def test_the_review_list_names_the_product_it_belongs_to(self):
        Review.objects.create(
            product=self.product, customer_name="A", rating=5, comment="Lovely", is_approved=True,
        )

        response = self.client_api.get("/api/admin/reviews/")

        self.assertEqual(response.status_code, 200)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual(rows[0]["product_name"], "Baby Lotion")

    def _png(self):
        buffer = io.BytesIO()
        PILImage.new("RGB", (4, 4), "white").save(buffer, format="PNG")
        buffer.seek(0)
        return SimpleUploadedFile("photo.png", buffer.read(), content_type="image/png")

    def test_a_photo_can_be_uploaded_for_a_review(self):
        response = self.client_api.post(
            "/api/admin/reviews/images/", {"files": self._png()}, format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["urls"]), 1)
        self.assertIn("/reviews/", response.data["urls"][0])

    def test_a_file_that_is_not_an_image_is_refused(self):
        bad = SimpleUploadedFile("notes.txt", b"just text", content_type="text/plain")

        response = self.client_api.post("/api/admin/reviews/images/", {"files": bad}, format="multipart")

        self.assertEqual(response.status_code, 400)

    def test_uploading_nothing_is_refused(self):
        response = self.client_api.post("/api/admin/reviews/images/", {}, format="multipart")

        self.assertEqual(response.status_code, 400)


class SelfReferralTestCase(TestCase):
    """Our own domains and our payment gateway were being counted as traffic sources."""

    def test_our_own_domains_are_not_a_traffic_source(self):
        for referrer in (
            "https://om.enfantorganic.com/en",
            "https://www.enfantorganic.com/",
            "https://enfantorganic.com",
            "https://app.enfantorganic.com/x",
            "https://enfant-me.com/",
        ):
            self.assertEqual(normalize_traffic_source({"referrer": referrer}), "Direct", referrer)

    def test_returning_from_the_payment_gateway_is_not_a_traffic_source(self):
        # This one was stealing credit: the customer arrived from somewhere, paid,
        # and came back — and the order was filed under Paymob.
        self.assertEqual(
            normalize_traffic_source({"referrer": "https://om.checkout.paymob.com/x"}), "Direct",
        )

    def test_a_source_named_as_our_own_host_is_also_direct(self):
        self.assertEqual(normalize_traffic_source({"source": "om.enfantorganic.com"}), "Direct")

    def test_a_real_campaign_still_wins_over_an_internal_referrer(self):
        source = normalize_traffic_source(
            {"referrer": "https://www.enfantorganic.com/", "utm_source": "ig", "utm_medium": "paid"},
        )
        self.assertEqual(source, "Instagram")

    def test_a_genuine_external_source_keeps_its_name(self):
        # The tracker records the host in `source`; only that names the bucket.
        self.assertEqual(normalize_traffic_source({"source": "linktr.ee"}), "linktr.ee")
        self.assertEqual(normalize_traffic_source({"source": "duckduckgo.com"}), "duckduckgo.com")

    def test_the_whatsapp_link_shortener_is_recognised(self):
        self.assertEqual(normalize_traffic_source({"referrer": "https://l.wl.co/abc"}), "WhatsApp")

    def test_a_lookalike_domain_is_not_treated_as_ours(self):
        # Suffix matching must not swallow a domain that merely ends the same way.
        self.assertEqual(
            normalize_traffic_source({"source": "notenfantorganic.com"}),
            "notenfantorganic.com",
        )
        self.assertEqual(
            normalize_traffic_source({"source": "myenfant-me.com"}),
            "myenfant-me.com",
        )


class FunnelCountsPeopleTestCase(TestCase):
    """"Meta says 30 adds to cart, the site says 7" — the same day, two measures.

    The funnel counts people, ad platforms count events. It only looked like a
    tracking fault because one step of the funnel counted events while the rest
    counted sessions, so the pass-through percentages divided one by the other.
    """

    def setUp(self):
        ensure_default_admin_roles()
        self.client_api = APIClient()
        user = User.objects.create_user(username="mgr-funnel", password="Pass12345!", is_staff=True)
        user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.client_api.force_authenticate(user=user)
        self.om = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)

        # One shopper who views three products and adds two of them, plus a
        # second shopper who adds one.
        self._events("shopper-a", AnalyticsEvent.EVENT_PAGE_VIEW, 2)
        self._events("shopper-a", AnalyticsEvent.EVENT_PRODUCT_VIEW, 3)
        self._events("shopper-a", AnalyticsEvent.EVENT_ADD_TO_CART, 2)
        self._events("shopper-b", AnalyticsEvent.EVENT_PAGE_VIEW, 1)
        self._events("shopper-b", AnalyticsEvent.EVENT_PRODUCT_VIEW, 1)
        self._events("shopper-b", AnalyticsEvent.EVENT_ADD_TO_CART, 1)

    def _events(self, session, event_type, count):
        for _ in range(count):
            event = AnalyticsEvent.objects.create(
                event_type=event_type, session_key=session, region=self.om, metadata={},
            )
            AnalyticsEvent.objects.filter(pk=event.pk).update(created_at=timezone.now())

    def _data(self):
        response = self.client_api.get("/api/admin/analytics/", {"date_range": "all_time"})
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_every_funnel_step_counts_people(self):
        data = self._data()

        self.assertEqual(data["visitors"], 2)
        # Was 4 — this step alone counted raw events.
        self.assertEqual(data["product_views"], 2)
        self.assertEqual(data["cart_adds"], 2)

    def test_event_totals_are_reported_for_reconciling_with_meta(self):
        data = self._data()

        self.assertEqual(data["event_totals"]["product_views"], 4)
        self.assertEqual(data["event_totals"]["cart_adds"], 3)
        self.assertEqual(data["event_totals"]["page_views"], 3)

    def test_the_two_measures_are_labelled_apart(self):
        data = self._data()

        self.assertTrue(data["funnel_counts_people"])
        # People never exceed events — if they do, something is miscounted.
        self.assertLessEqual(data["cart_adds"], data["event_totals"]["cart_adds"])
        self.assertLessEqual(data["product_views"], data["event_totals"]["product_views"])
