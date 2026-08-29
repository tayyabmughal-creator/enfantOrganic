"""
An order line shows the variant that was bought, not the product it belongs to.

The client caught this on an invoice: five of the 600ml refill pouch, pictured
as the 700ml starter bottle. The warehouse packs from that sheet, so the wrong
item goes in the box and the customer, who also reads it, has no way to tell.

The data was never the problem — every variant in the catalogue carries its own
image and every order line already snapshots the one that was chosen. Only the
two reading surfaces, the invoice PDF and the admin order list, fell back to the
parent product. Both are covered here, plus the resolution itself.
"""
from decimal import Decimal

from django.test import TestCase, override_settings

from store.models import Order, OrderItem, Product, Region
from store.api_serializers.admin_ops import AdminOrderItemSerializer
from store.services import invoice

BOTTLE_IMAGE = "/media/products/gallery/1-9b4168ac.webp"
POUCH_IMAGE = "/media/products/gallery/2-9c73276d.webp"
PARENT_IMAGE = "https://www.enfantorganic.com/media/products/IMG-27.jpg_1.webp"


class OrderLineVariantImageTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(
            code="ae",
            name_en="United Arab Emirates",
            name_ar="الإمارات",
            currency_code="AED",
            locale_code="en",
            shipping_threshold=Decimal("0.00"),
            contact_phone="123",
            address_en="A",
            address_ar="ب",
        )
        self.product = Product.objects.create(
            slug="enfant-organic-nipple-bottle-liquid-cleaner",
            name_en="ENFANT Organic Nipple & Bottle Wash",
            name_ar="إنفانت",
            image=PARENT_IMAGE,
            variants=[
                {"id": "v1", "title_en": "Starter Bottle (700ml)", "image": BOTTLE_IMAGE, "price": "3.950"},
                {"id": "v2", "title_en": "Refill Pouch (600ml)", "image": POUCH_IMAGE, "price": "2.400"},
            ],
        )
        self.order = Order.objects.create(
            region=self.region,
            customer_name="Warehouse Test",
            customer_email="shopper@example.com",
            customer_phone="971501234567",
            address_line_1="Sheikh Zayed Road",
            city="Dubai",
            country="United Arab Emirates",
            subtotal=Decimal("114.60"),
            shipping_total=Decimal("19.10"),
            grand_total=Decimal("133.70"),
            currency_code="AED",
        )

    def line(self, price_snapshot):
        return OrderItem.objects.create(
            order=self.order,
            product=self.product,
            product_slug=self.product.slug,
            product_name=self.product.name_en,
            selected_options_text="Refill Pouch (600ml)",
            quantity=5,
            unit_price=Decimal("22.92"),
            line_total=Decimal("114.60"),
            price_snapshot=price_snapshot,
        )

    def test_the_checkout_snapshot_names_the_picture(self):
        item = self.line({"variant_id": "v2", "variant": {"id": "v2", "image": POUCH_IMAGE}})
        self.assertEqual(item.variant_image_ref, POUCH_IMAGE)

    def test_an_older_line_falls_back_to_the_variant_row(self):
        """Lines written before a variant had an image carry no image in their
        snapshot; the product's current row still knows which one it is."""
        item = self.line({"variant_id": "v2", "variant": {"id": "v2", "title": "Refill Pouch (600ml)"}})
        self.assertEqual(item.variant_image_ref, POUCH_IMAGE)

    def test_a_line_with_no_variant_asks_for_nothing(self):
        self.assertEqual(self.line({}).variant_image_ref, "")
        self.assertEqual(self.line({"variant_id": "", "variant": None}).variant_image_ref, "")

    def test_an_unknown_variant_id_does_not_borrow_another_variants_picture(self):
        item = self.line({"variant_id": "v9", "variant": {"id": "v9"}})
        self.assertEqual(item.variant_image_ref, "")

    @override_settings(MEDIA_HOST_URL="https://www.enfantorganic.com")
    def test_the_admin_order_list_shows_the_bought_variant(self):
        item = self.line({"variant_id": "v2", "variant": {"id": "v2", "image": POUCH_IMAGE}})
        data = AdminOrderItemSerializer(item).data
        self.assertEqual(data["product_image"], f"https://www.enfantorganic.com{POUCH_IMAGE}")
        self.assertNotEqual(data["product_image"], PARENT_IMAGE)

    @override_settings(MEDIA_HOST_URL="https://www.enfantorganic.com")
    def test_a_line_without_a_variant_still_shows_the_product(self):
        data = AdminOrderItemSerializer(self.line({})).data
        self.assertEqual(data["product_image"], PARENT_IMAGE)

    def test_the_invoice_reads_the_variant_image_off_disk(self):
        """
        Variant images are "/media/…" paths, so they are read from MEDIA_ROOT
        rather than fetched over HTTP — on prod that would be the server calling
        itself while it renders the response.
        """
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "products/gallery"
            target.mkdir(parents=True)
            (target / "2-9c73276d.webp").write_bytes(b"pouch-bytes")
            with override_settings(MEDIA_ROOT=root, MEDIA_URL="/media/"):
                self.assertEqual(invoice._media_bytes(POUCH_IMAGE), b"pouch-bytes")
                self.assertIsNone(invoice._media_bytes("/media/products/gallery/missing.webp"))
                self.assertIsNone(invoice._media_bytes(""))

    def test_the_invoice_will_not_read_outside_the_media_tree(self):
        """The reference comes from admin-entered variant data, so it is not
        trusted to stay put on its own."""
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as parent:
            secret = Path(parent) / "secret.txt"
            secret.write_bytes(b"not-an-image")
            root = Path(parent) / "media"
            root.mkdir()
            with override_settings(MEDIA_ROOT=str(root), MEDIA_URL="/media/"):
                self.assertIsNone(invoice._media_bytes("/media/../secret.txt"))
