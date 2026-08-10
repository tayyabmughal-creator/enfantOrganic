import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from store.models import Product, Tag

DEFAULT_SOURCE = Path(__file__).resolve().parents[2] / "data" / "arabic_names.json"

# Which JSON key feeds which model and field, looked up by slug. The third entry
# is the field holding the English text, used to tell "never translated" apart
# from "deliberately translated".
TARGETS = {
    "tags": (Tag, "name_ar", "name_en"),
    "products": (Product, "name_ar", "name_en"),
    "product_units": (Product, "unit_ar", "unit"),
    "product_badges": (Product, "badge_ar", "badge_en"),
}


class Command(BaseCommand):
    help = (
        "Fill in Arabic display names for records whose name_ar still holds the "
        "English text, so the Arabic storefront stops rendering English."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            type=str,
            default=str(DEFAULT_SOURCE),
            help="JSON file of {group: {slug: arabic name}}.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help=(
                "Also overwrite names that already differ from the English. Off by "
                "default so a real translation is never clobbered."
            ),
        )

    def handle(self, *args, **options):
        source = Path(options["source"])
        if not source.exists():
            raise CommandError(f"No translation file at {source}")

        try:
            payload = json.loads(source.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise CommandError(f"{source} is not valid JSON: {error}")

        dry_run = options["dry_run"]
        force = options["force"]
        total_written = 0
        total_skipped = 0
        missing = []

        for group, (model, arabic_field, english_field) in TARGETS.items():
            mapping = payload.get(group) or {}
            if not mapping:
                continue

            self.stdout.write(f"\n{group}:")
            by_slug = {obj.slug: obj for obj in model.objects.filter(slug__in=list(mapping))}

            for slug, arabic in mapping.items():
                arabic = str(arabic or "").strip()
                if not arabic:
                    continue

                obj = by_slug.get(slug)
                if obj is None:
                    missing.append(f"{group}/{slug}")
                    continue

                current = str(getattr(obj, arabic_field) or "").strip()
                english = str(getattr(obj, english_field) or "").strip()
                already_translated = bool(current) and current != english

                if current == arabic:
                    total_skipped += 1
                    continue
                if already_translated and not force:
                    self.stdout.write(f"  keep   {slug}: already translated ({current[:40]})")
                    total_skipped += 1
                    continue

                total_written += 1
                self.stdout.write(f"  set    {slug}: {arabic}")
                if not dry_run:
                    setattr(obj, arabic_field, arabic)
                    obj.save(update_fields=[arabic_field])

        verb = "would be updated" if dry_run else "updated"
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"{total_written} name(s) {verb}, {total_skipped} left alone."))

        if missing:
            self.stdout.write(self.style.WARNING(f"{len(missing)} slug(s) in the file matched no record:"))
            for entry in missing:
                self.stdout.write(f"  · {entry}")

        if dry_run:
            self.stdout.write(self.style.NOTICE("Dry run — nothing was written."))
