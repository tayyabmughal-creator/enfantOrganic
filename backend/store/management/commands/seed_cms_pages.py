import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from store.models import CmsPage

DEFAULT_SOURCE = Path(__file__).resolve().parents[2] / "data" / "cms_seed_pages.json"


class Command(BaseCommand):
    help = (
        "Create CmsPage rows for pages whose text only existed in the frontend, so "
        "the admin can edit them. Never rewrites the copy of a page that already "
        "exists, but does publish it: an unpublished row is invisible to the "
        "storefront, so editing it changes nothing on the live site."
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
        published = 0
        kept = 0

        existing = {
            page.slug: page
            for page in CmsPage.objects.filter(slug__in=list(payload))
        }

        for slug, row in payload.items():
            page = existing.get(slug)
            if page is not None:
                # Whatever the admin has since written is the live copy; the
                # frontend text is only a starting point for a page that has none.
                # Publishing is a different matter: CmsPage.is_published defaults
                # to False, so a seeded page never reached the storefront and the
                # admin's edits went nowhere.
                if page.is_published:
                    self.stdout.write(f"  keep    {slug}: already a published CMS page")
                    kept += 1
                    continue

                published += 1
                self.stdout.write(f"  publish {slug}: existed but was unpublished")
                if dry_run:
                    continue
                page.is_published = True
                page.save(update_fields=["is_published"])
                continue

            created += 1
            self.stdout.write(f"  create  {slug}: {row.get('title_en', '')}")
            if dry_run:
                continue

            CmsPage.objects.create(
                slug=slug,
                title_en=row.get("title_en", ""),
                title_ar=row.get("title_ar", ""),
                body_en=row.get("body_en", ""),
                body_ar=row.get("body_ar", ""),
                is_published=True,
            )

        verb = "would be created" if dry_run else "created"
        published_verb = "would be published" if dry_run else "published"
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"{created} page(s) {verb}, {published} {published_verb}, {kept} left alone."
            )
        )
        if dry_run:
            self.stdout.write(self.style.NOTICE("Dry run — nothing was written."))
