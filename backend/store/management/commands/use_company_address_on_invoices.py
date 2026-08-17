from django.core.management.base import BaseCommand

from store.models import Region

# Regions whose seller address is a fulfilment location rather than the company's
# registered address. Recognised by the place name so the command cannot clear an
# address someone has since entered on purpose.
FULFILMENT_MARKERS = ("mabella", "muscat", "fulfillment", "fulfilment")


class Command(BaseCommand):
    help = (
        "Clear the per-region seller address where it holds a warehouse or "
        "fulfilment location instead of the company's registered address, so "
        "invoices fall through to the one address kept in Settings."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        cleared = 0
        kept = 0

        for region in Region.objects.order_by("code"):
            address = (region.seller_address_en or "").strip()
            if not address:
                self.stdout.write(f"  skip   {region.code}: already falls through to Settings")
                kept += 1
                continue

            lowered = address.lower()
            if not any(marker in lowered for marker in FULFILMENT_MARKERS):
                # A real registered address for that market — KSA invoices need
                # one for VAT — so leave it exactly as it is.
                self.stdout.write(f"  keep   {region.code}: {address[:60]}")
                kept += 1
                continue

            cleared += 1
            self.stdout.write(f"  clear  {region.code}: {address[:60]}")
            if dry_run:
                continue
            region.seller_address_en = ""
            region.save(update_fields=["seller_address_en"])

        verb = "would be cleared" if dry_run else "cleared"
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"{cleared} region(s) {verb}, {kept} left alone."))
        if dry_run:
            self.stdout.write(self.style.NOTICE("Dry run — nothing was written."))
