import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from store.models import Product, Tag

DEFAULT_SOURCE = Path(__file__).resolve().parents[2] / "data" / "arabic_names.json"

# Which JSON key feeds which model, looked up by slug.
TARGETS = {
    "tags": Tag,
    "products": Product,
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

        for group, model in TARGETS.items():
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

                current = str(obj.name_ar or "").strip()
                already_translated = bool(current) and current != str(obj.name_en or "").strip()

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
                    obj.name_ar = arabic
                    obj.save(update_fields=["name_ar"])

        verb = "would be updated" if dry_run else "updated"
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"{total_written} name(s) {verb}, {total_skipped} left alone."))

        if missing:
            self.stdout.write(self.style.WARNING(f"{len(missing)} slug(s) in the file matched no record:"))
            for entry in missing:
                self.stdout.write(f"  · {entry}")

        if dry_run:
            self.stdout.write(self.style.NOTICE("Dry run — nothing was written."))
