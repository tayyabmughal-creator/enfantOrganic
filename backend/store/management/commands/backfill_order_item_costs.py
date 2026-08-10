from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_date

from store.domain_models.commerce import OrderItem
from store.services.costing import backfill_missing_order_item_costs


class Command(BaseCommand):
    help = (
        "Fill in order item cost snapshots that were never captured, using each "
        "product's current cost price converted into the order's currency."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )
        parser.add_argument(
            "--since",
            type=str,
            default="",
            help="Only touch items on orders created on or after this date (YYYY-MM-DD).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        since_raw = (options["since"] or "").strip()

        queryset = OrderItem.objects.all()
        if since_raw:
            since = parse_date(since_raw)
            if not since:
                self.stderr.write(self.style.ERROR(f"Could not read --since {since_raw!r} as YYYY-MM-DD."))
                return
            queryset = queryset.filter(order__created_at__date__gte=since)
            self.stdout.write(f"Scope: orders created on or after {since}")
        else:
            self.stdout.write("Scope: every order")

        result = backfill_missing_order_item_costs(queryset=queryset, dry_run=dry_run)

        verb = "would be priced" if dry_run else "priced"
        self.stdout.write(self.style.SUCCESS(f"{result['updated']} item(s) {verb} from the current cost price."))

        if result["still_missing"]:
            self.stdout.write(
                self.style.WARNING(
                    f"{result['still_missing']} item(s) still have no cost — their product has no cost price set."
                )
            )
            for slug, name in sorted(result["missing_products"].items(), key=lambda row: row[1]):
                self.stdout.write(f"  · {name}  ({slug})")

        if dry_run:
            self.stdout.write(self.style.NOTICE("Dry run — nothing was written."))
