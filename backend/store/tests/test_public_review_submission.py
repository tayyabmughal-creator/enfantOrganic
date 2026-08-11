from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from store.models import Order, OrderItem, Product, ProductPrice, Region, Review

User = get_user_model()


class PublicReviewSubmissionTestCase(TestCase):
    """There was no way to leave a review from the site at all.

    The only endpoint needed a signed-in customer with a *delivered* order, and
    checkout here is guest-first and often phone-only, so in practice the
    condition was never met — which is why 18 published products had none.
    """

    def setUp(self):
        self.client_api = APIClient()
        self.region = Region.objects.create(
            code="om", name_en="Oman", name_ar="عمان", currency_code="OMR",
            fx_rate=Decimal("1.000000"), is_active=True, is_default=True,
            shipping_fee=Decimal("2.00"), shipping_threshold=Decimal("0.00"),
            contact_phone="12345678", address_en="Test Address",
        )
        self.product = Product.objects.create(
            slug="lotion", name_en="Lotion", name_ar="لوشن", is_published=True,
        )
        ProductPrice.objects.create(product=self.product, region=self.region, price=Decimal("5.000"))

        self.draft = Product.objects.create(
            slug="hidden", name_en="Hidden", name_ar="مخفي", is_published=False,
        )

    def _payload(self, **overrides):
        payload = {
            "customer_name": "Aisha",
            "rating": 5,
            "title": "Lovely",
            "comment": "Gentle on my baby's skin and no fragrance.",
        }
        payload.update(overrides)
        return payload

    def _post(self, slug="lotion", **overrides):
        return self.client_api.post(f"/api/products/{slug}/reviews/", self._payload(**overrides), format="json")

    def _order(self, email="buyer@example.com", user=None):
        order = Order.objects.create(
            region=self.region, customer_name="Buyer", customer_email=email, customer_phone="1",
            address_line_1="a", city="c", country="c", user=user,
            subtotal=Decimal("5.00"), shipping_total=Decimal("0.00"), grand_total=Decimal("5.00"),
            currency_code="OMR", status=Order.STATUS_PAID, payment_status=Order.PAYMENT_PAID,
        )
        OrderItem.objects.create(
            order=order, product=self.product, product_slug=self.product.slug,
            product_name=self.product.name_en, quantity=1,
            unit_price=Decimal("5.00"), line_total=Decimal("5.00"),
        )
        return order

    # ── the basic act ────────────────────────────────────────────────────────

    def test_a_guest_can_leave_a_review(self):
        response = self._post()

        self.assertEqual(response.status_code, 201)
        review = Review.objects.get()
        self.assertEqual(review.customer_name, "Aisha")
        self.assertEqual(review.rating, 5)
        self.assertEqual(review.product, self.product)

    def test_a_new_review_is_never_published_on_its_own(self):
        self._post()

        self.assertFalse(Review.objects.get().is_approved)

    def test_an_unapproved_review_does_not_reach_the_product_page(self):
        self._post()

        response = self.client_api.get("/api/products/lotion/", {"region": "om", "locale": "en"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["product"]["customer_reviews"], [])

    def test_a_review_cannot_be_left_on_an_unpublished_product(self):
        response = self._post(slug="hidden")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(Review.objects.count(), 0)

    def test_a_review_cannot_be_left_on_a_product_that_does_not_exist(self):
        response = self._post(slug="no-such-thing")

        self.assertEqual(response.status_code, 404)

    # ── what the form refuses ────────────────────────────────────────────────

    def test_a_rating_outside_one_to_five_is_refused(self):
        for rating in (0, 6, -1):
            response = self._post(rating=rating)
            self.assertEqual(response.status_code, 400, rating)
        self.assertEqual(Review.objects.count(), 0)

    def test_an_empty_name_is_refused(self):
        response = self._post(customer_name=" ")

        self.assertEqual(response.status_code, 400)

    def test_a_one_word_comment_is_refused(self):
        response = self._post(comment="good")

        self.assertEqual(response.status_code, 400)

    def test_a_title_is_optional(self):
        response = self._post(title="")

        self.assertEqual(response.status_code, 201)

    # ── the verified badge ───────────────────────────────────────────────────

    def test_an_order_number_with_the_matching_email_earns_the_badge(self):
        order = self._order()

        response = self._post(order_number=order.order_number, email="buyer@example.com")

        self.assertEqual(response.status_code, 201)
        review = Review.objects.get()
        self.assertTrue(review.is_verified_purchase)
        self.assertEqual(review.order, order)

    def test_the_email_match_ignores_case(self):
        order = self._order(email="Buyer@Example.com")

        self._post(order_number=order.order_number.lower(), email="buyer@example.com")

        self.assertTrue(Review.objects.get().is_verified_purchase)

    def test_an_order_number_alone_does_not_earn_the_badge(self):
        # Order numbers run in sequence, so they are guessable.
        order = self._order()

        self._post(order_number=order.order_number)

        review = Review.objects.get()
        self.assertFalse(review.is_verified_purchase)
        self.assertIsNone(review.order)

    def test_the_wrong_email_does_not_earn_the_badge(self):
        order = self._order()

        self._post(order_number=order.order_number, email="someone@else.com")

        self.assertFalse(Review.objects.get().is_verified_purchase)

    def test_an_order_for_a_different_product_does_not_earn_the_badge(self):
        other = Product.objects.create(slug="wipes", name_en="Wipes", name_ar="مناديل", is_published=True)
        ProductPrice.objects.create(product=other, region=self.region, price=Decimal("3.000"))
        order = self._order()

        response = self.client_api.post(
            "/api/products/wipes/reviews/",
            self._payload(order_number=order.order_number, email="buyer@example.com"),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertFalse(Review.objects.get().is_verified_purchase)

    def test_a_signed_in_customer_is_matched_on_their_own_order(self):
        user = User.objects.create_user(username="aisha", password="Pass12345!")
        order = self._order(user=user)
        self.client_api.force_authenticate(user=user)

        self._post(order_number=order.order_number)

        review = Review.objects.get()
        self.assertTrue(review.is_verified_purchase)
        self.assertEqual(review.user, user)

    def test_a_signed_in_customer_cannot_claim_someone_else_s_order(self):
        order = self._order()
        intruder = User.objects.create_user(username="intruder", password="Pass12345!")
        self.client_api.force_authenticate(user=intruder)

        self._post(order_number=order.order_number)

        self.assertFalse(Review.objects.get().is_verified_purchase)

    # ── what the admin sees ──────────────────────────────────────────────────

    def test_an_approved_review_reaches_the_product_page_and_counts(self):
        self._post()
        review = Review.objects.get()
        review.is_approved = True
        review.save(update_fields=["is_approved"])

        from store.services.reviews import recalculate_product_review_aggregates
        recalculate_product_review_aggregates(self.product.pk)
        self.product.refresh_from_db()

        response = self.client_api.get("/api/products/lotion/", {"region": "om", "locale": "en"})

        self.assertEqual(len(response.data["product"]["customer_reviews"]), 1)
        self.assertEqual(self.product.review_count, 1)
        self.assertEqual(str(self.product.rating), "5.0")
