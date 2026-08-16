"""Which address an invoice prints as the seller.

The client asked for one UAE company address everywhere. It was already set in
Settings and the footer used it, but invoices fell back to Region.address_en —
the Muscat warehouse — so every Oman invoice printed the old address.
"""

from decimal import Decimal

from django.test import TestCase

from store.models import Order, Region, SiteSettings
from store.services.invoice import COMPANY_ADDRESS, _seller_snapshot

UAE_ADDRESS = (
    "IFZA Business Park - Building A02 - Dubai Silicon Oasis - "
    "Industrial Area - Dubai - United Arab Emirates"
)
MUSCAT_ADDRESS = "Building No.5905, Floor No.3, Mabella Near Mall of Muscat, Sultanate of Oman"


class SellerAddressTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(
            code="om", name_en="Oman", name_ar="عمان", currency_code="OMR",
            fx_rate=Decimal("1.000000"), is_active=True, is_default=True,
            shipping_fee=Decimal("2.00"), shipping_threshold=Decimal("0.00"),
            address_en=MUSCAT_ADDRESS, contact_phone="12345678",
        )
        self.order = Order.objects.create(
            region=self.region, customer_name="Test", customer_email="t@example.com",
            customer_phone="12345678", city="Muscat", subtotal=Decimal("5.000"),
            grand_total=Decimal("7.000"),
        )

    def test_the_company_address_from_settings_wins_over_the_regions_warehouse(self):
        SiteSettings.objects.create(address_en=UAE_ADDRESS)

        seller = _seller_snapshot(self.order)

        self.assertEqual(seller["address_en"], UAE_ADDRESS)
        self.assertNotIn("Muscat", seller["address_en"])

    def test_a_regions_own_legal_address_still_wins(self):
        # KSA invoices need the seller's registered KSA address for VAT.
        SiteSettings.objects.create(address_en=UAE_ADDRESS)
        self.region.seller_address_en = "Riyadh, Saudi Arabia"
        self.region.save(update_fields=["seller_address_en"])

        self.assertEqual(_seller_snapshot(self.order)["address_en"], "Riyadh, Saudi Arabia")

    def test_no_settings_row_falls_back_to_the_company_address_not_the_warehouse(self):
        self.assertFalse(SiteSettings.objects.exists())

        seller = _seller_snapshot(self.order)

        self.assertEqual(seller["address_en"], COMPANY_ADDRESS)
        self.assertNotIn("Muscat", seller["address_en"])

    def test_a_blank_settings_address_falls_back_to_the_company_address(self):
        SiteSettings.objects.create(address_en="   ")

        self.assertEqual(_seller_snapshot(self.order)["address_en"], COMPANY_ADDRESS)
