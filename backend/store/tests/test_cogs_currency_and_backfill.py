import json
import re
import tempfile
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from store.api_views.admin_ops import build_cogs_report_rows
from store.models import Order, OrderItem, Product, ProductPrice, Region, Tag
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles
from store.services.costing import (
    backfill_missing_order_item_costs,
    repair_foreign_currency_costs,
    resolve_order_item_cost,
)

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


class CogsCurrencyTestCase(TestCase):
    """The report must never add two currencies together, and a cost captured in
    the base currency must reach the row in the currency that row is priced in."""

    def setUp(self):
        ensure_default_admin_roles()
        self.api_client = APIClient()
        self.staff_user = User.objects.create_user(
            username="cogs-manager", password="Pass12345!", is_staff=True
        )
        self.staff_user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.api_client.force_authenticate(user=self.staff_user)

        self.oman = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.uae = _region("ae", "UAE", "AED", Decimal("9.550000"))

        self.product = Product.objects.create(
            slug="lotion", name_en="Lotion", name_ar="لوشن",
            cost_price=Decimal("1.000"), is_published=True,
        )

    def _order(self, region, currency, total, fx):
        return Order.objects.create(
            region=region,
            customer_name="Buyer",
            customer_email="buyer@example.com",
            customer_phone="12345678",
            address_line_1="Street 1",
            city="City",
            country="Country",
            subtotal=total,
            shipping_total=Decimal("0.00"),
            grand_total=total,
            currency_code=currency,
            fx_rate_snapshot=fx,
            status=Order.STATUS_PAID,
            payment_status=Order.PAYMENT_PAID,
        )

    def _item(self, order, unit_price, unit_cost, qty=1):
        return OrderItem.objects.create(
            order=order,
            product=self.product,
            product_slug=self.product.slug,
            product_name=self.product.name_en,
            quantity=qty,
            unit_price=unit_price,
            line_total=unit_price * qty,
            unit_cost_price=unit_cost,
            line_cost_total=unit_cost * qty,
        )

    def test_totals_are_reported_once_per_currency_never_summed(self):
        self._item(self._order(self.oman, "OMR", Decimal("10.00"), Decimal("1")), Decimal("10.00"), Decimal("2.000"))
        self._item(self._order(self.uae, "AED", Decimal("95.50"), Decimal("9.55")), Decimal("95.50"), Decimal("19.100"))

        _rows, totals = build_cogs_report_rows()
        by_currency = {bucket["currency"]: bucket for bucket in totals["by_currency"]}

        self.assertEqual(set(by_currency), {"OMR", "AED"})
        self.assertEqual(by_currency["OMR"]["revenue"], Decimal("10.00"))
        self.assertEqual(by_currency["AED"]["revenue"], Decimal("95.50"))
        # The mixed 105.50 that the old grand total produced must appear nowhere.
        self.assertNotIn(Decimal("105.50"), [bucket["revenue"] for bucket in totals["by_currency"]])

    def test_converted_total_carries_the_rate_it_used(self):
        self._item(self._order(self.oman, "OMR", Decimal("10.00"), Decimal("1")), Decimal("10.00"), Decimal("2.000"))
        self._item(self._order(self.uae, "AED", Decimal("95.50"), Decimal("9.55")), Decimal("95.50"), Decimal("19.100"))

        _rows, totals = build_cogs_report_rows()
        converted = totals["converted"]

        # 95.50 AED / 9.55 = 10.00 OMR, plus the 10.00 OMR order.
        self.assertEqual(converted["currency"], "OMR")
        self.assertEqual(converted["revenue"], Decimal("20.00"))
        self.assertIn("AED", converted["rates"])

    def test_cost_reaches_the_row_in_that_row_s_currency(self):
        snapshot = resolve_order_item_cost(self.product, quantity=1, fx_rate=Decimal("9.55"))
        # 1.000 OMR of cost is 9.550 AED — not 1.000 sitting inside an AED row.
        self.assertEqual(snapshot["unit_cost_price"], Decimal("9.550"))

    def test_base_currency_cost_is_left_alone(self):
        snapshot = resolve_order_item_cost(self.product, quantity=2, fx_rate=Decimal("1"))
        self.assertEqual(snapshot["unit_cost_price"], Decimal("1.000"))
        self.assertEqual(snapshot["line_cost_total"], Decimal("2.000"))


class CogsBackfillTestCase(TestCase):
    """Sales made before their product had a cost price kept a zero forever."""

    def setUp(self):
        self.region = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.uae = _region("ae", "UAE", "AED", Decimal("9.550000"))
        self.priced = Product.objects.create(
            slug="priced", name_en="Priced", name_ar="س", cost_price=Decimal("1.500"), is_published=True,
        )
        self.costless = Product.objects.create(
            slug="costless", name_en="Costless", name_ar="ص", cost_price=Decimal("0"), is_published=True,
        )

    def _order(self, region, currency, fx):
        return Order.objects.create(
            region=region, customer_name="B", customer_email="b@example.com", customer_phone="1",
            address_line_1="a", city="c", country="c",
            subtotal=Decimal("10.00"), shipping_total=Decimal("0.00"), grand_total=Decimal("10.00"),
            currency_code=currency, fx_rate_snapshot=fx,
            status=Order.STATUS_PAID, payment_status=Order.PAYMENT_PAID,
        )

    def _item(self, order, product, unit_cost=Decimal("0")):
        return OrderItem.objects.create(
            order=order, product=product, product_slug=product.slug, product_name=product.name_en,
            quantity=2, unit_price=Decimal("5.00"), line_total=Decimal("10.00"),
            unit_cost_price=unit_cost, line_cost_total=unit_cost * 2,
        )

    def test_zero_cost_item_is_priced_from_the_product_and_marked_estimated(self):
        item = self._item(self._order(self.region, "OMR", Decimal("1")), self.priced)

        result = backfill_missing_order_item_costs()
        item.refresh_from_db()

        self.assertEqual(result["updated"], 1)
        self.assertEqual(item.unit_cost_price, Decimal("1.500"))
        self.assertEqual(item.line_cost_total, Decimal("3.000"))
        self.assertTrue(item.cost_is_estimated)

    def test_backfilled_cost_is_converted_into_the_order_currency(self):
        item = self._item(self._order(self.uae, "AED", Decimal("9.55")), self.priced)

        backfill_missing_order_item_costs()
        item.refresh_from_db()

        self.assertEqual(item.unit_cost_price, Decimal("14.325"))  # 1.500 OMR x 9.55

    def test_a_cost_captured_at_sale_time_is_never_overwritten(self):
        item = self._item(self._order(self.region, "OMR", Decimal("1")), self.priced, unit_cost=Decimal("0.900"))

        result = backfill_missing_order_item_costs()
        item.refresh_from_db()

        self.assertEqual(result["updated"], 0)
        self.assertEqual(item.unit_cost_price, Decimal("0.900"))
        self.assertFalse(item.cost_is_estimated)

    def test_product_without_a_cost_price_is_reported_not_guessed(self):
        item = self._item(self._order(self.region, "OMR", Decimal("1")), self.costless)

        result = backfill_missing_order_item_costs()
        item.refresh_from_db()

        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["still_missing"], 1)
        self.assertIn("costless", result["missing_products"])
        self.assertEqual(item.unit_cost_price, Decimal("0"))

    def test_dry_run_writes_nothing(self):
        item = self._item(self._order(self.region, "OMR", Decimal("1")), self.priced)

        result = backfill_missing_order_item_costs(dry_run=True)
        item.refresh_from_db()

        self.assertEqual(result["updated"], 1)
        self.assertEqual(item.unit_cost_price, Decimal("0"))


class ForeignCurrencyCostRepairTestCase(TestCase):
    """Costs captured before conversion existed sat in an AED row denominated in OMR."""

    def setUp(self):
        self.oman = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)
        self.uae = _region("ae", "UAE", "AED", Decimal("9.550000"))
        self.product = Product.objects.create(
            slug="wash", name_en="Wash", name_ar="غسول", cost_price=Decimal("1.630"), is_published=True,
        )

    def _item(self, region, currency, fx, unit_cost):
        order = Order.objects.create(
            region=region, customer_name="B", customer_email="b@example.com", customer_phone="1",
            address_line_1="a", city="c", country="c",
            subtotal=Decimal("56.35"), shipping_total=Decimal("0.00"), grand_total=Decimal("56.35"),
            currency_code=currency, fx_rate_snapshot=fx,
            status=Order.STATUS_PAID, payment_status=Order.PAYMENT_PAID,
        )
        return OrderItem.objects.create(
            order=order, product=self.product, product_slug=self.product.slug,
            product_name=self.product.name_en, quantity=1,
            unit_price=Decimal("56.35"), line_total=Decimal("56.35"),
            unit_cost_price=unit_cost, line_cost_total=unit_cost,
        )

    def test_an_aed_line_holding_an_omr_cost_is_re_denominated(self):
        item = self._item(self.uae, "AED", Decimal("9.55"), Decimal("1.630"))

        result = repair_foreign_currency_costs()
        item.refresh_from_db()

        self.assertEqual(result["repaired"], 1)
        self.assertEqual(item.unit_cost_price, Decimal("15.567"))  # 1.630 x 9.55
        self.assertTrue(item.cost_is_estimated)

    def test_base_currency_lines_are_left_alone(self):
        item = self._item(self.oman, "OMR", Decimal("1"), Decimal("1.630"))

        result = repair_foreign_currency_costs()
        item.refresh_from_db()

        self.assertEqual(result["repaired"], 0)
        self.assertEqual(item.unit_cost_price, Decimal("1.630"))

    def test_running_it_twice_does_not_convert_twice(self):
        item = self._item(self.uae, "AED", Decimal("9.55"), Decimal("1.630"))

        repair_foreign_currency_costs()
        second = repair_foreign_currency_costs()
        item.refresh_from_db()

        self.assertEqual(second["repaired"], 0)
        self.assertEqual(item.unit_cost_price, Decimal("15.567"))

    def test_dry_run_writes_nothing(self):
        item = self._item(self.uae, "AED", Decimal("9.55"), Decimal("1.630"))

        result = repair_foreign_currency_costs(dry_run=True)
        item.refresh_from_db()

        self.assertEqual(result["repaired"], 1)
        self.assertEqual(item.unit_cost_price, Decimal("1.630"))


class ApplyArabicNamesTestCase(TestCase):
    """The Arabic storefront rendered English because name_ar held the English text."""

    def setUp(self):
        self.source = Path(tempfile.mkdtemp()) / "names.json"
        self.source.write_text(
            json.dumps({
                "tags": {"baby-set": "طقم أطفال", "shampoo": "شامبو"},
                "products": {"lotion": "لوشن"},
            }, ensure_ascii=False),
            encoding="utf-8",
        )

    def _run(self, **options):
        call_command("apply_arabic_names", source=str(self.source), verbosity=0, **options)

    def test_a_name_still_holding_the_english_is_translated(self):
        tag = Tag.objects.create(slug="baby-set", name_en="Baby Set", name_ar="Baby Set")

        self._run()
        tag.refresh_from_db()

        self.assertEqual(tag.name_ar, "طقم أطفال")

    def test_an_empty_arabic_name_is_filled_in(self):
        tag = Tag.objects.create(slug="shampoo", name_en="Shampoo", name_ar="")

        self._run()
        tag.refresh_from_db()

        self.assertEqual(tag.name_ar, "شامبو")

    def test_a_real_translation_is_never_overwritten(self):
        tag = Tag.objects.create(slug="baby-set", name_en="Baby Set", name_ar="مجموعة مختارة")

        self._run()
        tag.refresh_from_db()

        self.assertEqual(tag.name_ar, "مجموعة مختارة")

    def test_force_overwrites_an_existing_translation(self):
        tag = Tag.objects.create(slug="baby-set", name_en="Baby Set", name_ar="مجموعة مختارة")

        self._run(force=True)
        tag.refresh_from_db()

        self.assertEqual(tag.name_ar, "طقم أطفال")

    def test_products_are_translated_too(self):
        product = Product.objects.create(slug="lotion", name_en="Lotion", name_ar="Lotion")

        self._run()
        product.refresh_from_db()

        self.assertEqual(product.name_ar, "لوشن")

    def test_dry_run_writes_nothing(self):
        tag = Tag.objects.create(slug="baby-set", name_en="Baby Set", name_ar="Baby Set")

        self._run(dry_run=True)
        tag.refresh_from_db()

        self.assertEqual(tag.name_ar, "Baby Set")

    def test_running_twice_changes_nothing_the_second_time(self):
        tag = Tag.objects.create(slug="baby-set", name_en="Baby Set", name_ar="Baby Set")

        self._run()
        self._run()
        tag.refresh_from_db()

        self.assertEqual(tag.name_ar, "طقم أطفال")

    def test_the_shipped_translation_file_is_valid_and_complete(self):
        shipped = Path(settings.BASE_DIR) / "store" / "data" / "arabic_names.json"
        payload = json.loads(shipped.read_text(encoding="utf-8"))

        for group in ("tags", "products"):
            for slug, arabic in payload[group].items():
                self.assertTrue(str(arabic).strip(), f"{group}/{slug} has an empty translation")
                # A translation that is still Latin would defeat the whole exercise.
                self.assertFalse(
                    re.fullmatch(r"[A-Za-z0-9 ,&'\-\.\+%/]+", str(arabic)),
                    f"{group}/{slug} is still Latin text: {arabic}",
                )


class LocalizedProductUnitTestCase(TestCase):
    """"Standard Set" was showing in English on the Arabic product cards."""

    def setUp(self):
        self.client_api = APIClient()
        self.region = _region("om", "Oman", "OMR", Decimal("1.000000"), is_default=True)

    def _product(self, slug, unit, unit_ar=""):
        product = Product.objects.create(
            slug=slug, name_en=slug, name_ar=slug, is_published=True,
            track_inventory=False, unit=unit, unit_ar=unit_ar,
        )
        ProductPrice.objects.create(product=product, region=self.region, price=Decimal("5.000"))
        return product

    def _unit(self, slug, locale):
        response = self.client_api.get("/api/products/", {"region": "om", "locale": locale})
        self.assertEqual(response.status_code, 200)
        return next(row["unit"] for row in response.data if row["slug"] == slug)

    def test_arabic_uses_the_arabic_unit(self):
        self._product("kit", "Standard Set", "طقم قياسي")

        self.assertEqual(self._unit("kit", "ar"), "طقم قياسي")

    def test_english_is_untouched(self):
        self._product("kit", "Standard Set", "طقم قياسي")

        self.assertEqual(self._unit("kit", "en"), "Standard Set")

    def test_a_measurement_needs_no_translation(self):
        # Left blank on purpose: "175 ml" reads the same either way, and blanking
        # the pill would be worse than showing it.
        self._product("lotion", "175 ml")

        self.assertEqual(self._unit("lotion", "ar"), "175 ml")
