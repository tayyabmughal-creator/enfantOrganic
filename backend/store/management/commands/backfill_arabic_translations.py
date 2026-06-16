"""Backfill Arabic (name_ar / badge_ar / short_description_ar / description_ar)
for products and (name_ar / description_ar) for categories.

The storefront localizes via ``localized(obj, field, locale)`` which falls back
to the English value when the Arabic field is empty. Products and categories
imported from the client catalogue shipped without Arabic, so the AR toggle was
rendering English. This command loads the bundled translations and writes them
to the matching rows by slug.

Usage:
    python manage.py backfill_arabic_translations
    python manage.py backfill_arabic_translations --file /path/to/translations.json
    python manage.py backfill_arabic_translations --only-empty   # don't overwrite existing AR
"""

import json
import os

from django.core.management.base import BaseCommand

from store.domain_models.catalog import Product, Category

DEFAULT_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "data",
    "arabic_translations.json",
)


class Command(BaseCommand):
    help = "Backfill Arabic translations for products and categories from a JSON file."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=DEFAULT_FILE, help="Path to translations JSON.")
        parser.add_argument(
            "--only-empty",
            action="store_true",
            help="Only write fields that are currently blank (do not overwrite existing AR).",
        )

    def handle(self, *args, **options):
        with open(options["file"], encoding="utf-8") as fh:
            data = json.load(fh)
        only_empty = options["only_empty"]

        p_ok = p_miss = 0
        for row in data.get("products", []):
            try:
                obj = Product.objects.get(slug=row["slug"])
            except Product.DoesNotExist:
                self.stderr.write(f"missing product: {row['slug']}")
                p_miss += 1
                continue
            fields = {
                "name_ar": row["name_ar"],
                "badge_ar": row["badge_ar"],
                "short_description_ar": row["short_description_ar"],
                "description_ar": row["description_ar"],
            }
            changed = []
            for field, value in fields.items():
                if only_empty and getattr(obj, field):
                    continue
                setattr(obj, field, value)
                changed.append(field)
            if changed:
                obj.save(update_fields=changed)
                p_ok += 1

        c_ok = c_miss = 0
        for row in data.get("categories", []):
            try:
                obj = Category.objects.get(slug=row["slug"])
            except Category.DoesNotExist:
                self.stderr.write(f"missing category: {row['slug']}")
                c_miss += 1
                continue
            fields = {"name_ar": row["name_ar"], "description_ar": row["description_ar"]}
            changed = []
            for field, value in fields.items():
                if only_empty and getattr(obj, field):
                    continue
                setattr(obj, field, value)
                changed.append(field)
            if changed:
                obj.save(update_fields=changed)
                c_ok += 1

        self.stdout.write(self.style.SUCCESS(f"products updated={p_ok} missing={p_miss}"))
        self.stdout.write(self.style.SUCCESS(f"categories updated={c_ok} missing={c_miss}"))
