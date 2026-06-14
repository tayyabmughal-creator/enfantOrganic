"""Import reviews from a Shopify Judge.me review export (.xlsx) into the Review model.

Only "Published" rows with a non-null Rating are imported. Each becomes a Review
with is_approved=True. After import, Product.review_count and Product.rating
(average) are recalculated from the actual Review records.

Idempotent — keyed on (product_slug, customer_name, title[:160]). Re-running
safely skips already-imported rows.

Usage:
    python manage.py import_shopify_reviews /path/to/review-export.xlsx [--dry-run]

Requires openpyxl:
    pip install openpyxl
"""
import datetime
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone

try:
    import openpyxl
except ImportError as exc:
    raise ImportError("openpyxl is required: pip install openpyxl") from exc

from store.models import Product, Review


class Command(BaseCommand):
    help = "Import a Shopify review export (.xlsx) into Review records."

    def add_arguments(self, parser):
        parser.add_argument("xlsx_path", help="Path to the .xlsx review export file")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and report counts without writing to the database.",
        )

    def handle(self, *args, **options):
        xlsx_path = Path(options["xlsx_path"]).expanduser()
        if not xlsx_path.exists():
            raise CommandError(f"File not found: {xlsx_path}")

        dry_run = bool(options["dry_run"])

        self.stdout.write(f"Loading {xlsx_path.name} …")
        wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
        ws = wb.active

        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            raise CommandError("Workbook is empty.")

        headers = [str(h).strip() if h is not None else "" for h in rows[0]]
        wb.close()

        def col(row_dict, *names):
            for name in names:
                v = row_dict.get(name)
                if v is not None:
                    return str(v).strip()
            return ""

        # Pre-load product slug → pk mapping (slug is unique index).
        slug_to_pk = dict(Product.objects.values_list("slug", "pk"))

        stats = {
            "rows": 0,
            "imported": 0,
            "skipped_status": 0,
            "skipped_no_slug": 0,
            "skipped_duplicate": 0,
            "errors": 0,
        }

        # (product_pk, customer_name_lower, title_lower) → already exists
        existing_keys: set = set()
        for review in Review.objects.values("product_id", "customer_name", "title"):
            existing_keys.add(
                (
                    review["product_id"],
                    (review["customer_name"] or "").lower(),
                    (review["title"] or "")[:160].lower(),
                )
            )

        created_reviews: list[tuple[int, datetime.datetime]] = []  # (pk, date)

        with transaction.atomic():
            for raw_row in rows[1:]:
                stats["rows"] += 1
                row = dict(zip(headers, raw_row))

                status = col(row, "Status")
                rating_raw = row.get("Rating")

                if status != "Published" or rating_raw is None:
                    stats["skipped_status"] += 1
                    continue

                slug = col(row, "Product Handle")
                if not slug or slug not in slug_to_pk:
                    stats["skipped_no_slug"] += 1
                    continue

                product_pk = slug_to_pk[slug]
                customer_name = col(row, "Reviewer Name")[:160] or "Anonymous"
                title = col(row, "Title")[:160]
                comment = col(row, "Body")
                rating = max(1, min(5, int(rating_raw)))

                # Idempotency check
                dedup_key = (product_pk, customer_name.lower(), title.lower())
                if dedup_key in existing_keys:
                    stats["skipped_duplicate"] += 1
                    continue

                # Parse date (Judge.me exports as datetime or string). Make tz-aware.
                date_raw = row.get("Date")
                if isinstance(date_raw, datetime.datetime):
                    naive = date_raw
                elif isinstance(date_raw, datetime.date):
                    naive = datetime.datetime(date_raw.year, date_raw.month, date_raw.day)
                else:
                    naive = datetime.datetime(2025, 1, 1)
                review_date = timezone.make_aware(naive) if timezone.is_naive(naive) else naive

                try:
                    if not dry_run:
                        review_obj = Review.objects.create(
                            product_id=product_pk,
                            customer_name=customer_name,
                            rating=rating,
                            title=title,
                            comment=comment,
                            is_approved=True,
                            is_verified_purchase=False,
                        )
                        created_reviews.append((review_obj.pk, review_date))
                        existing_keys.add(dedup_key)

                    stats["imported"] += 1
                except Exception as exc:
                    stats["errors"] += 1
                    self.stderr.write(
                        self.style.WARNING(f"Row {stats['rows']} ({slug}): {exc}")
                    )

            # Back-fill created_at — auto_now_add prevents setting it at creation time.
            if not dry_run:
                for pk, date in created_reviews:
                    Review.objects.filter(pk=pk).update(created_at=date)

                # Recalculate Product.review_count and Product.rating from Review table.
                affected_pks = {pk for slug, pk in slug_to_pk.items() if slug in {
                    col(dict(zip(headers, r)), "Product Handle")
                    for r in rows[1:]
                    if col(dict(zip(headers, r)), "Status") == "Published"
                    and dict(zip(headers, r)).get("Rating") is not None
                }}

                agg = (
                    Review.objects.filter(product_id__in=affected_pks, is_approved=True)
                    .values("product_id")
                    .annotate(cnt=Count("pk"), avg=Avg("rating"))
                )
                for row_agg in agg:
                    Product.objects.filter(pk=row_agg["product_id"]).update(
                        review_count=row_agg["cnt"],
                        rating=round(row_agg["avg"] or 5.0, 1),
                    )

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(
            self.style.SUCCESS(
                "Import complete (dry_run={dry_run}). "
                "rows={rows} imported={imported} "
                "skipped_status={skipped_status} skipped_no_slug={skipped_no_slug} "
                "skipped_duplicate={skipped_duplicate} errors={errors}".format(
                    dry_run=dry_run, **stats
                )
            )
        )
