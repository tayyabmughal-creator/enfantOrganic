import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from store.models import CmsPage

DEFAULT_SOURCE = Path(__file__).resolve().parents[2] / "data" / "cms_seed_pages.json"


class Command(BaseCommand):
    help = (
        "Create CmsPage rows for pages whose text only existed in the frontend, so "
        "the admin can edit them. Never touches a page that already exists."
    )

    def add_arguments(self, parser):
        parser.add_argument("--source", type=str, default=str(DEFAULT_SOURCE))
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created without writing anything.",
        )

    def handle(self, *args, **options):
        source = Path(options["source"])
        if not source.exists():
            raise CommandError(f"No seed file at {source}")

        try:
            payload = json.loads(source.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise CommandError(f"{source} is not valid JSON: {error}")

        dry_run = options["dry_run"]
        created = 0
        kept = 0

        existing = set(CmsPage.objects.filter(slug__in=list(payload)).values_list("slug", flat=True))

        for slug, row in payload.items():
            if slug in existing:
                # Whatever the admin has since written is the live copy; the
                # frontend text is only a starting point for a page that has none.
                self.stdout.write(f"  keep   {slug}: already a CMS page")
                kept += 1
                continue

            created += 1
            self.stdout.write(f"  create {slug}: {row.get('title_en', '')}")
            if dry_run:
                continue

            CmsPage.objects.create(
                slug=slug,
                title_en=row.get("title_en", ""),
                title_ar=row.get("title_ar", ""),
                body_en=row.get("body_en", ""),
                body_ar=row.get("body_ar", ""),
            )

        verb = "would be created" if dry_run else "created"
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"{created} page(s) {verb}, {kept} left alone."))
        if dry_run:
            self.stdout.write(self.style.NOTICE("Dry run — nothing was written."))
