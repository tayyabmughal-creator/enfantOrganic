from decimal import Decimal

from django.core.management.base import BaseCommand

from store.models import Region
from store.services.pricing import apply_fx_conversion, get_base_region

# Official pegged conversion rates from OMR (Oman home currency):
#   1 OMR = 2.6008 USD ; 1 USD = 3.6725 AED ; 1 USD = 3.75 SAR
DEFAULT_RATES = {"ae": Decimal("9.55"), "sa": Decimal("9.75")}


class Command(BaseCommand):
    help = (
        "Persist FX rates onto regions and recompute AED/SAR product prices from the "
        "OMR base price. Shares logic with the admin 'Apply conversion rates' action."
    )

    def add_arguments(self, parser):
        parser.add_argument("--aed-rate", type=Decimal, default=DEFAULT_RATES["ae"], help="OMR->AED rate (default 9.55).")
        parser.add_argument("--sar-rate", type=Decimal, default=DEFAULT_RATES["sa"], help="OMR->SAR rate (default 9.75).")
        parser.add_argument(
            "--keep-rates",
            action="store_true",
            help="Do not change existing Region.fx_rate values; just re-apply them.",
        )
        parser.add_argument("--dry-run", action="store_true", help="Preview without writing.")

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])

        if not options["keep_rates"] and not dry_run:
            base = get_base_region()
            if base:
                Region.objects.filter(pk=base.pk).update(fx_rate=Decimal("1"))
            for code, rate in (("ae", options["aed_rate"]), ("sa", options["sar_rate"])):
                Region.objects.filter(code=code).update(fx_rate=rate)

        result = apply_fx_conversion(dry_run=dry_run)
        if not result.get("ok"):
            self.stderr.write(self.style.ERROR(result.get("error", "Conversion failed.")))
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Conversion done (base={result['base_region']}/{result['base_currency']}). "
                f"updated={result['updated']} created={result['created']} "
                f"unchanged={result['unchanged']} dry_run={result['dry_run']}"
            )
        )
