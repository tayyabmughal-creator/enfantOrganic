"""
Order number allocation.

The generator used to count the day's orders and add one. That is correct only
while the sequence has no gaps — delete a single order and the count no longer
matches the highest suffix, so the next checkout regenerates a number that
already exists, the unique constraint rejects it, and every checkout for the
rest of that day fails with a 500 regardless of payment method. Production had
accumulated gaps on ten separate days before the symptom was traced back here.
"""
from decimal import Decimal

from django.test import TestCase

from store.models import Order, Region


class OrderNumberAllocationTests(TestCase):
    def setUp(self):
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
        )

    def make_order(self):
        return Order.objects.create(
            region=self.region,
            customer_name="Buyer",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("0.00"),
            grand_total=Decimal("5.00"),
            currency_code="OMR",
            payment_method=Order.PAYMENT_COD,
        )

    def test_numbers_increment_normally(self):
        first = self.make_order()
        second = self.make_order()

        self.assertTrue(first.order_number.endswith("-0001"))
        self.assertTrue(second.order_number.endswith("-0002"))

    def test_a_gap_does_not_reissue_an_existing_number(self):
        first = self.make_order()
        second = self.make_order()
        # Exactly the production shape: the day keeps its highest number but
        # loses an earlier one, so count() and max(suffix) disagree.
        first.delete()

        third = self.make_order()

        self.assertNotEqual(third.order_number, second.order_number)
        self.assertTrue(third.order_number.endswith("-0003"))

    def test_survives_a_gap_at_the_end_of_the_sequence(self):
        self.make_order()
        second = self.make_order()
        second.delete()

        third = self.make_order()

        self.assertTrue(third.order_number.endswith("-0002"))

    def test_a_taken_number_is_reallocated_rather_than_raising(self):
        """
        Two checkouts landing together read the same highest number. The loser
        must retry, not hand the customer a 500.
        """
        existing = self.make_order()

        clash = Order(
            region=self.region,
            customer_name="Buyer",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.00"),
            shipping_total=Decimal("0.00"),
            grand_total=Decimal("5.00"),
            currency_code="OMR",
            payment_method=Order.PAYMENT_COD,
        )
        # Stays empty so save() treats it as generated and may retry; the first
        # allocation collides because we recreate the race by hand below.
        original_allocate = Order._allocate_order_number
        calls = {"n": 0}

        def colliding_allocate():
            calls["n"] += 1
            if calls["n"] == 1:
                return existing.order_number
            return original_allocate()

        Order._allocate_order_number = staticmethod(colliding_allocate)
        try:
            clash.save()
        finally:
            Order._allocate_order_number = staticmethod(original_allocate)

        self.assertNotEqual(clash.order_number, existing.order_number)
        self.assertEqual(Order.objects.count(), 2)
