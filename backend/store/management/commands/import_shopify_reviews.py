"""Import reviews from a Shopify Judge.me review export (.xlsx) into the Review model.

Only "Published" rows with a non-null Rating are imported. Each becomes a Review
with is_approved=True. After import, Product.review_count and Product.rating
(average) are recalculated from the actual Review records.

Idempotent — keyed on (product_slug, customer_name, title[:160]). Re-running
safely skips already-imported rows, so it is the way to pick up products added
to the catalogue after an earlier import (their rows were skipped back then
because the product did not exist yet).

Handles that were re-slugged after a previous import are mapped through
HANDLE_ALIASES; anything still unmatched is listed at the end of the run.

Usage:
    python manage.py import_shopify_reviews /path/to/review-export.xlsx [--dry-run]
    python manage.py import_shopify_reviews /path/to/review-export.xlsx --backfill-images

Requires openpyxl:
    pip install openpyxl
"""
import collections
import datetime
import re
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


# Some products were re-slugged after their reviews were first imported, so the
# handle in the Shopify export no longer resolves to a Product and every row for
# them was being counted as skipped_no_slug. Map the export handle onto the slug
# the product carries today. Verified by reviewer-name overlap against the rows
# already in the database.
HANDLE_ALIASES = {
    "enfant-organic-plus-moisture-conditioner-for-kids": "Enfant-Organic-Kids-Hair-Conditioner",
    "best-newborn-gift-set-uae-relaxing-night-routine": "newborn-baby-gift-set",
    "enfant-organic-plus-extra-mild-face-body-wipes": "Enfant-Organic-Plus-Extra-Mild-Wipes",
    "enfant-organic-body-wash-shampoo-500-ml": "enfant-organic-body-wash-shampoo",
    "enfant-ultimate-newborn-essential-kit-uae-and-oman": "organic-newborn-essential-kit",
    "enfant-ultra-care-organic-plus-shampoo-body-wash-uae-oman": "Ultra-Care-Shampoo",
}

# Columns holding photos the customer attached to the review. "Reviewer Image
# Url" is deliberately absent — that is the reviewer's avatar (Facebook / LINE
# profile picture), not a picture of the product, and it does not belong in the
# review's image gallery.
MEDIA_COLUMNS = ("Media URLs",)


class Command(BaseCommand):
    help = "Import a Shopify review export (.xlsx) into Review records."

    def add_arguments(self, parser):
        parser.add_argument("xlsx_path", help="Path to the .xlsx review export file")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and report counts without writing to the database.",
        )
        parser.add_argument(
            "--backfill-images",
            action="store_true",
            help=(
                "Also attach media to reviews that already exist (imported before "
                "photo support). Only fills reviews whose images are empty."
            ),
        )

    def handle(self, *args, **options):
        xlsx_path = Path(options["xlsx_path"]).expanduser()
        if not xlsx_path.exists():
            raise CommandError(f"File not found: {xlsx_path}")

        dry_run = bool(options["dry_run"])
        backfill_images = bool(options["backfill_images"])

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

        def review_images(row_dict):
            values = []
            for header in MEDIA_COLUMNS:
                raw = row_dict.get(header)
                if raw is None:
                    continue
                values.extend(re.split(r"[\n,;]+", str(raw)))

            images = []
            for value in values:
                url = str(value or "").strip()
                if url.startswith(("http://", "https://")) and url not in images:
                    images.append(url)
            return images

        # Pre-load product slug → pk mapping (slug is unique index).
        slug_to_pk = dict(Product.objects.values_list("slug", "pk"))
        lower_slug_to_pk = {slug.lower(): pk for slug, pk in slug_to_pk.items()}

        def resolve_pk(handle):
            """Export handle → Product pk, tolerating case and post-import re-slugs."""
            if not handle:
                return None
            candidates = [handle, HANDLE_ALIASES.get(handle, "")]
            for candidate in candidates:
                if not candidate:
                    continue
                pk = slug_to_pk.get(candidate) or lower_slug_to_pk.get(candidate.lower())
                if pk:
                    return pk
            return None

        stats = {
            "rows": 0,
            "imported": 0,
            "skipped_status": 0,
            "skipped_no_slug": 0,
            "skipped_duplicate": 0,
            "images_backfilled": 0,
            "errors": 0,
        }

        def dedup_key_for(product_pk, customer_name, title, comment):
            # Reviewer names arrive anonymised ("r***a") and titles are often
            # blank, so name+title alone collapses genuinely different reviews
            # from the same product. The body disambiguates them.
            return (
                product_pk,
                (customer_name or "").lower(),
                (title or "")[:160].lower(),
                (comment or "")[:200].strip().lower(),
            )

        # dedup key → pk of the review already stored
        existing_keys: dict = {}
        for review in Review.objects.values("pk", "product_id", "customer_name", "title", "comment"):
            existing_keys.setdefault(
                dedup_key_for(
                    review["product_id"],
                    review["customer_name"],
                    review["title"],
                    review["comment"],
                ),
                review["pk"],
            )

        created_reviews: list[tuple[int, datetime.datetime]] = []  # (pk, date)
        affected_pks: set = set()
        unmatched_handles: collections.Counter = collections.Counter()

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
                product_pk = resolve_pk(slug)
                if product_pk is None:
                    stats["skipped_no_slug"] += 1
                    unmatched_handles[slug or "(blank)"] += 1
                    continue

                affected_pks.add(product_pk)
                customer_name = col(row, "Reviewer Name")[:160] or "Anonymous"
                title = col(row, "Title")[:160]
                comment = col(row, "Body")
                rating = max(1, min(5, int(rating_raw)))
                images = review_images(row)

                # Idempotency check
                dedup_key = dedup_key_for(product_pk, customer_name, title, comment)
                if dedup_key in existing_keys:
                    stats["skipped_duplicate"] += 1
                    # Reviews imported before photo support have no images; give
                    # them the media from the export without touching their text.
                    if backfill_images and images and not dry_run:
                        filled = Review.objects.filter(
                            pk=existing_keys[dedup_key], images=[]
                        ).update(images=images)
                        stats["images_backfilled"] += filled
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
                            images=images,
                            is_approved=True,
                            is_verified_purchase=False,
                        )
                        created_reviews.append((review_obj.pk, review_date))
                        existing_keys[dedup_key] = review_obj.pk

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
                "skipped_duplicate={skipped_duplicate} "
                "images_backfilled={images_backfilled} errors={errors}".format(
                    dry_run=dry_run, **stats
                )
            )
        )

        # A handle no product answers to means those reviews are silently lost.
        # Print them so the gap is visible instead of hiding inside a count.
        if unmatched_handles:
            self.stdout.write(
                self.style.WARNING(
                    "Handles with no matching product (add to HANDLE_ALIASES if re-slugged):"
                )
            )
            for handle, count in unmatched_handles.most_common():
                self.stdout.write(self.style.WARNING(f"  {count:>4} review(s)  {handle}"))
