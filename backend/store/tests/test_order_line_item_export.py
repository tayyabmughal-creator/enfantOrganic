"""
The whole order book downloads in one file, one row per product sold.

The Orders screen's "Export CSV" was assembled in the browser out of the rows
the admin had selected, and the list only ever renders 25 at a time — so
exporting 200 orders meant selecting and downloading eight times, then stitching
the files together. Worse, the file it produced was one row per order, with no
sight of what was actually in the box.

This covers the replacement: a server-side export that answers to the same
filters as the list, is not paginated, and emits an order line per row with the
trade codes the client's reporting spreadsheet is keyed on.
"""
import csv
import io
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from store.models import Order, OrderItem, Product, Region
from store.services.admin_roles import ROLE_MANAGER, ensure_default_admin_roles

User = get_user_model()

EXPORT_URL = "/api/admin/orders/export/"


class OrderLineItemExportTests(TestCase):
    def setUp(self):
        ensure_default_admin_roles()
        self.api_client = APIClient()
        self.staff_user = User.objects.create_user(username="manager", password="Pass12345!", is_staff=True)
        self.staff_user.groups.add(Group.objects.get(name=ROLE_MANAGER))
        self.api_client.force_authenticate(self.staff_user)

        self.uae = Region.objects.create(
            code="ae",
            name_en="UAE",
            currency_code="AED",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Dubai",
        )
        self.oman = Region.objects.create(
            code="om",
            name_en="Oman",
            currency_code="OMR",
            shipping_fee=Decimal("2.00"),
            shipping_threshold=Decimal("0.00"),
            contact_phone="12345678",
            address_en="Muscat",
        )

        self.shampoo = Product.objects.create(
            slug="enfant-organic-plus-shampoo-body-wash-300-ml",
            name_en="ENFANT ORGANIC PLUS SHAMPOO&BODY WASH 300ML",
            sku="ATNHP3",
            ean="8852525753631",
            cost_price=Decimal("1.160"),
        )
        self.lotion = Product.objects.create(
            slug="enfant-organic-plus-double-moisture-lotion-250ml",
            name_en="ENFANT ORGANIC PLUS DOUBLE MOISTURE LOTION 250ML",
            sku="ATNLP2",
            ean="8852525753754",
            cost_price=Decimal("1.160"),
            variants=[
                {"id": "v1", "title_en": "Single", "sku": "ATNLP2-1", "ean": "8852525753761"},
                {"id": "v2", "title_en": "Pack of 2", "sku": "ATNLP2-2", "ean": "8852525753778"},
            ],
        )

    # ── helpers ──────────────────────────────────────────────────────────────
    def make_order(self, *, number, region, placed_on, payment_status=Order.PAYMENT_PAID):
        order = Order.objects.create(
            order_number=number,
            region=region,
            customer_name="Elisabeth D Souza Jansson",
            customer_email="shopper@example.com",
            customer_phone="971553065107",
            address_line_1="Sheikh Zayed Road",
            city="Dubai",
            country="United Arab Emirates",
            subtotal=Decimal("14.10"),
            grand_total=Decimal("14.10"),
            currency_code=region.currency_code,
            payment_status=payment_status,
        )
        # created_at is auto_now_add, so it has to be written back afterwards.
        Order.objects.filter(pk=order.pk).update(created_at=placed_on)
        order.refresh_from_db()
        return order

    def add_line(self, order, product, *, quantity=1, unit_price="4.60", price_snapshot=None, sku=""):
        return OrderItem.objects.create(
            order=order,
            product=product,
            product_slug=product.slug,
            product_name=product.name_en,
            sku=sku,
            quantity=quantity,
            unit_price=Decimal(unit_price),
            line_total=Decimal(unit_price) * quantity,
            unit_cost_price=Decimal("1.160"),
            line_cost_total=Decimal("1.160") * quantity,
            tax_total=Decimal("0.00"),
            price_snapshot=price_snapshot or {},
        )

    def export_rows(self, params=None):
        response = self.api_client.get(EXPORT_URL, params or {})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        return list(csv.reader(io.StringIO(response.content.decode("utf-8"))))

    def monday_of(self, moment):
        day = timezone.localtime(moment).date()
        return (day - timedelta(days=day.weekday())).isoformat()

    # ── the shape of the file ────────────────────────────────────────────────
    def test_every_line_of_every_order_is_its_own_row(self):
        """order_number repeats across the lines of the same order."""
        placed = timezone.now() - timedelta(days=3)
        order = self.make_order(number="EO-20260810-0003", region=self.uae, placed_on=placed)
        self.add_line(order, self.shampoo, quantity=2, unit_price="4.60")
        self.add_line(order, self.lotion, quantity=1, unit_price="4.90")

        header, *rows = self.export_rows()
        self.assertEqual(header[:5], ["order_number", "date", "week_start", "ean", "sku"])
        self.assertEqual(len(rows), 2)
        self.assertEqual([row[0] for row in rows], ["EO-20260810-0003", "EO-20260810-0003"])
        self.assertEqual([row[5] for row in rows], [self.shampoo.name_en, self.lotion.name_en])
        self.assertEqual([row[6] for row in rows], ["2", "1"])
        self.assertEqual([row[10] for row in rows], ["9.20", "4.90"])
        self.assertEqual([row[12] for row in rows], ["AED", "AED"])

    def test_the_week_starts_on_monday(self):
        # 2026-09-01 is a Tuesday; its week begins Monday 2026-08-31.
        tuesday = timezone.make_aware(timezone.datetime(2026, 9, 1, 11, 46))
        order = self.make_order(number="EO-20260901-0005", region=self.oman, placed_on=tuesday)
        self.add_line(order, self.shampoo)

        _, row = self.export_rows()
        self.assertEqual(row[1], "2026-09-01")
        self.assertEqual(row[2], "2026-08-31")
        self.assertEqual(row[2], self.monday_of(tuesday))

    def test_the_columns_are_the_ones_the_client_asked_for(self):
        placed = timezone.now()
        order = self.make_order(number="EO-1", region=self.uae, placed_on=placed, payment_status=Order.PAYMENT_UNPAID)
        self.add_line(order, self.shampoo, quantity=3, unit_price="3.99")

        header, row = self.export_rows()
        self.assertEqual(
            header,
            [
                "order_number", "date", "week_start", "ean", "sku", "product_name",
                "quantity", "rsp_unit_price", "cost_per_unit", "tax_amount",
                "line_total", "payment_status", "currency",
            ],
        )
        self.assertEqual(row[7], "3.99")            # rsp_unit_price
        self.assertEqual(row[8], "1.160")           # cost_per_unit
        self.assertEqual(row[9], "0.00")            # tax_amount
        self.assertEqual(row[10], "11.97")          # line_total
        self.assertEqual(row[11], "unpaid")

    # ── the trade codes ──────────────────────────────────────────────────────
    def test_a_plain_line_takes_the_products_codes(self):
        order = self.make_order(number="EO-2", region=self.uae, placed_on=timezone.now())
        self.add_line(order, self.shampoo)

        _, row = self.export_rows()
        self.assertEqual(row[3], "8852525753631")
        self.assertEqual(row[4], "ATNHP3")

    def test_a_variant_line_takes_the_variants_codes(self):
        order = self.make_order(number="EO-3", region=self.uae, placed_on=timezone.now())
        self.add_line(order, self.lotion, price_snapshot={"variant_id": "v2", "variant": {"id": "v2"}})

        _, row = self.export_rows()
        self.assertEqual(row[3], "8852525753778")
        self.assertEqual(row[4], "ATNLP2-2")

    def test_codes_entered_today_reach_orders_placed_before_they_existed(self):
        """The codes are new fields, so every historic sale has to pick them up
        from the product — otherwise the client's back-catalogue exports blank."""
        order = self.make_order(number="EO-4", region=self.uae, placed_on=timezone.now() - timedelta(days=90))
        self.add_line(order, self.shampoo)

        self.shampoo.sku = "ATNHP3-NEW"
        self.shampoo.ean = "8852525999999"
        self.shampoo.save(update_fields=["sku", "ean"])

        _, row = self.export_rows()
        self.assertEqual(row[3], "8852525999999")
        self.assertEqual(row[4], "ATNHP3-NEW")

    def test_a_product_with_no_codes_yet_exports_blank_rather_than_a_slug(self):
        bare = Product.objects.create(slug="enfant-cotton-buds", name_en="Cotton Buds")
        order = self.make_order(number="EO-5", region=self.uae, placed_on=timezone.now())
        self.add_line(order, bare)

        _, row = self.export_rows()
        self.assertEqual(row[3], "")
        self.assertEqual(row[4], "")

    # ── it answers to the list's filters ─────────────────────────────────────
    def test_the_export_is_not_capped_at_a_page(self):
        """The complaint that started this: 25 rows per download."""
        for index in range(40):
            order = self.make_order(number=f"EO-P{index:03d}", region=self.uae, placed_on=timezone.now())
            self.add_line(order, self.shampoo)

        _, *rows = self.export_rows()
        self.assertEqual(len(rows), 40)

    def test_the_date_range_narrows_the_file(self):
        old = self.make_order(number="EO-OLD", region=self.uae, placed_on=timezone.now() - timedelta(days=40))
        self.add_line(old, self.shampoo)
        recent = self.make_order(number="EO-NEW", region=self.uae, placed_on=timezone.now())
        self.add_line(recent, self.shampoo)

        cutoff = (timezone.localdate() - timedelta(days=7)).isoformat()
        _, *rows = self.export_rows({"date_from": cutoff})
        self.assertEqual([row[0] for row in rows], ["EO-NEW"])

    def test_the_market_filter_narrows_the_file(self):
        emirati = self.make_order(number="EO-AE", region=self.uae, placed_on=timezone.now())
        self.add_line(emirati, self.shampoo)
        omani = self.make_order(number="EO-OM", region=self.oman, placed_on=timezone.now())
        self.add_line(omani, self.shampoo)

        _, *rows = self.export_rows({"market": "om"})
        self.assertEqual([row[0] for row in rows], ["EO-OM"])
        self.assertEqual(rows[0][12], "OMR")

    def test_a_search_narrows_the_file_without_duplicating_lines(self):
        """The search joins order items, so an order matching on two of its own
        lines must still come out once per line, not once per match."""
        match = self.make_order(number="EO-FIND", region=self.uae, placed_on=timezone.now())
        self.add_line(match, self.shampoo)
        self.add_line(match, self.shampoo, quantity=2)
        other = self.make_order(number="EO-MISS", region=self.uae, placed_on=timezone.now())
        self.add_line(other, self.lotion)

        _, *rows = self.export_rows({"search": "SHAMPOO"})
        self.assertEqual([row[0] for row in rows], ["EO-FIND", "EO-FIND"])

    def test_draft_orders_can_be_kept_out(self):
        online = self.make_order(number="EO-ONLINE", region=self.uae, placed_on=timezone.now())
        self.add_line(online, self.shampoo)
        draft = self.make_order(number="EO-DRAFT", region=self.uae, placed_on=timezone.now())
        Order.objects.filter(pk=draft.pk).update(sales_channel=Order.SALES_CHANNEL_DRAFT_ORDER)
        self.add_line(draft, self.shampoo)

        _, *rows = self.export_rows({"sales_channel": Order.SALES_CHANNEL_ONLINE_STORE})
        self.assertEqual([row[0] for row in rows], ["EO-ONLINE"])

    # ── the other format, and the door ───────────────────────────────────────
    def test_excel_carries_the_same_rows(self):
        import openpyxl

        order = self.make_order(number="EO-XL", region=self.uae, placed_on=timezone.now())
        self.add_line(order, self.shampoo, quantity=2, unit_price="4.60")

        response = self.api_client.get(EXPORT_URL, {"export_format": "xlsx"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("spreadsheetml", response["Content-Type"])

        sheet = openpyxl.load_workbook(io.BytesIO(response.content)).active
        header, row = list(sheet.values)
        self.assertEqual(header[0], "order_number")
        self.assertEqual(row[0], "EO-XL")
        self.assertEqual(row[3], "8852525753631")
        self.assertEqual(row[6], 2)
        self.assertEqual(row[10], 9.20)

    def test_a_signed_out_visitor_gets_nothing(self):
        self.api_client.force_authenticate(None)
        self.assertEqual(self.api_client.get(EXPORT_URL).status_code, 401)

    def test_export_is_not_mistaken_for_an_order_number(self):
        """`admin/orders/<order_number>/` would happily match "export"."""
        from django.urls import resolve

        self.assertEqual(resolve(EXPORT_URL).url_name, "admin-orders-export")
