"""Arabic rendering in invoice PDFs.

Regression for the "black boxes instead of Arabic" bug: any buyer-supplied
line (name, address, area, product name) that contains Arabic must be shaped
and rendered with the registered Arabic font — Helvetica has no Arabic glyphs.
Mixed Latin/Arabic lines must keep real glyphs for both scripts.
"""

from decimal import Decimal

from django.test import TestCase

from store.models import Order, OrderItem, Region
from store.services.invoice import (
    _build_invoice_pdf_bytes,
    _contains_arabic,
    _smart_markup,
    AR_FONT_NAME,
)


class ArabicDetectionTests(TestCase):
    def test_contains_arabic(self):
        self.assertTrue(_contains_arabic("أم عفان"))
        self.assertTrue(_contains_arabic("Bowsher, مرتفعات المطار"))
        self.assertTrue(_contains_arabic("١٢"))  # Arabic-Indic digits
        self.assertFalse(_contains_arabic("Muscat, Oman"))
        self.assertFalse(_contains_arabic(""))
        self.assertFalse(_contains_arabic(None))

    def test_smart_markup_wraps_arabic_runs_in_font_tag(self):
        markup = _smart_markup("Bowsher, حي الصاروج", AR_FONT_NAME)
        self.assertIn(f'<font name="{AR_FONT_NAME}">', markup)
        self.assertIn("Bowsher", markup)
        # The Latin part must stay OUTSIDE the Arabic font tag.
        self.assertNotRegex(markup, rf'<font name="{AR_FONT_NAME}">[^<]*Bowsher')

    def test_smart_markup_escapes_xml_special_chars(self):
        self.assertEqual(_smart_markup("Wash & Shampoo <500ml>"), "Wash &amp; Shampoo &lt;500ml&gt;")
        markup = _smart_markup("غسول & شامبو", AR_FONT_NAME)
        self.assertIn("&amp;", markup)
        self.assertNotIn(" & ", markup)

    def test_smart_markup_without_font_still_shapes(self):
        # No registered Arabic font: no tags, but must not crash.
        markup = _smart_markup("أم عفان", None)
        self.assertNotIn("<font", markup)
        self.assertTrue(markup)


class ArabicInvoicePdfTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(
            code="om",
            name_en="Oman",
            name_ar="عمان",
            currency_code="OMR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Oman Address",
            address_ar="Oman Address AR",
            is_default=True,
        )

    def _arabic_order(self):
        order = Order.objects.create(
            region=self.region,
            customer_name="أم عفان",
            customer_email="test@example.com",
            customer_phone="+968 9737 0767",
            address_line_1="حي الصاروج",
            address_line_2="بناية ١٢، شقة ٤",
            area="Bowsher, مرتفعات المطار/ الغبرة",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("9.750"),
            shipping_total=Decimal("0.000"),
            grand_total=Decimal("9.750"),
            currency_code="OMR",
            payment_method="cod",
        )
        OrderItem.objects.create(
            order=order,
            product_name="ENFANT Organic Body Wash & Shampoo 500ml",
            product_slug="body-wash",
            quantity=1,
            unit_price=Decimal("5.500"),
            line_total=Decimal("5.500"),
        )
        OrderItem.objects.create(
            order=order,
            product_name="غسول الجسم والشامبو العضوي للأطفال",
            product_slug="body-wash-ar",
            quantity=1,
            unit_price=Decimal("4.250"),
            line_total=Decimal("4.250"),
        )
        return order

    def test_arabic_order_builds_valid_pdf(self):
        pdf_bytes, _ = _build_invoice_pdf_bytes(self._arabic_order())
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
        self.assertGreater(len(pdf_bytes), 1000)

    def test_latin_only_order_still_builds(self):
        order = Order.objects.create(
            region=self.region,
            customer_name="Test User",
            customer_email="t@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="Muscat",
            country="Oman",
            subtotal=Decimal("5.000"),
            shipping_total=Decimal("0.000"),
            grand_total=Decimal("5.000"),
            currency_code="OMR",
            payment_method="cod",
        )
        OrderItem.objects.create(
            order=order,
            product_name="Baby Balm",
            product_slug="baby-balm",
            quantity=1,
            unit_price=Decimal("5.000"),
            line_total=Decimal("5.000"),
        )
        pdf_bytes, _ = _build_invoice_pdf_bytes(order)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
