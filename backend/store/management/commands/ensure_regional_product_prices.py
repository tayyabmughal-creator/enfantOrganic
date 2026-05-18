from django.core.management.base import BaseCommand
from django.db import transaction

from store.management.commands.complete_demo_catalog import PRICE_DEFAULTS, PRODUCT_COMPLETIONS
from store.models import Product, ProductPrice, Region
from store.sample_data import PRODUCTS


def build_price_catalog():
    catalog = {}

    for payload in PRODUCTS:
        catalog[payload["slug"]] = payload.get("prices", {})

    for slug, payload in PRODUCT_COMPLETIONS.items():
        catalog[slug] = {
            region_code: {**PRICE_DEFAULTS, **price_payload}
            for region_code, price_payload in payload.get("prices", {}).items()
        }

    return catalog


class Command(BaseCommand):
    help = "Create missing regional ProductPrice rows without overwriting existing production prices."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview rows that would be created without writing to the database.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        created = 0
        existing = 0
        skipped_products = 0
        skipped_regions = 0

        regions = {region.code: region for region in Region.objects.all()}

        for slug, prices in build_price_catalog().items():
            product = Product.objects.filter(slug=slug).first()
            if not product:
                skipped_products += 1
                continue

            for region_code, price_payload in prices.items():
                region = regions.get(region_code)
                if not region:
                    skipped_regions += 1
                    continue

                if ProductPrice.objects.filter(product=product, region=region).exists():
                    existing += 1
                    continue

                created += 1
                if not dry_run:
                    ProductPrice.objects.create(
                        product=product,
                        region=region,
                        **price_payload,
                    )

        self.stdout.write(
            self.style.SUCCESS(
                "Regional price backfill complete. "
                f"created={created} existing={existing} "
                f"skipped_products={skipped_products} skipped_regions={skipped_regions} "
                f"dry_run={dry_run}"
            )
        )
