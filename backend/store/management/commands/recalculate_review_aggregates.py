from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand
from django.db.models import Avg, Count

from store.models import Product, Review
from store.services.reviews import recalculate_product_review_aggregates


class Command(BaseCommand):
    help = "Recalculate Product.review_count and Product.rating from approved Review records."

    def add_arguments(self, parser):
        parser.add_argument("--slug", dest="slug", default="", help="Limit repair to one product slug.")
        parser.add_argument("--dry-run", action="store_true", help="Report current/recalculated values without saving.")

    def handle(self, *args, **options):
        queryset = Product.objects.all().order_by("slug")
        slug = str(options.get("slug") or "").strip()
        if slug:
            queryset = queryset.filter(slug=slug)

        total = queryset.count()
        changed = 0
        for product in queryset.iterator():
            before = {"review_count": product.review_count, "rating": product.rating}
            if options["dry_run"]:
                aggregate = Review.objects.filter(product=product, is_approved=True).aggregate(
                    review_count=Count("id"),
                    average_rating=Avg("rating"),
                )
                after = {
                    "review_count": int(aggregate["review_count"] or 0),
                    "rating": Decimal(str(aggregate["average_rating"] or 5)).quantize(
                        Decimal("0.1"),
                        rounding=ROUND_HALF_UP,
                    ),
                }
            else:
                recalculate_product_review_aggregates(product.pk)
                product.refresh_from_db(fields=["review_count", "rating"])
                after = {"review_count": product.review_count, "rating": product.rating}
            if before != after:
                changed += 1
            self.stdout.write(
                f"{product.slug}: {before['review_count']} / {before['rating']} -> "
                f"{after['review_count']} / {after['rating']}"
            )

        suffix = "would change" if options["dry_run"] else "changed"
        self.stdout.write(self.style.SUCCESS(f"Reviewed {total} product(s); {changed} {suffix}."))
