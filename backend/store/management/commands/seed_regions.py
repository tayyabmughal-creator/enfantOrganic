from django.core.management.base import BaseCommand
from store.models import Region, SiteSettings
from store.sample_data import REGIONS, SITE_SETTINGS


class Command(BaseCommand):
    help = "Seed Region and SiteSettings rows (idempotent — safe to re-run)."

    def handle(self, *args, **options):
        # Seed regions
        valid_region_fields = {f.name for f in Region._meta.fields}
        for payload in REGIONS:
            defaults = {k: v for k, v in payload.items() if k in valid_region_fields and k != "code"}
            obj, created = Region.objects.update_or_create(code=payload["code"], defaults=defaults)
            self.stdout.write(("  created" if created else "  updated") + f" region: {obj.code}")
        self.stdout.write(self.style.SUCCESS(f"Regions ready: {Region.objects.count()} total."))

        # Seed SiteSettings (required for /api/navigation/)
        valid_settings_fields = {f.name for f in SiteSettings._meta.fields}
        defaults = {k: v for k, v in SITE_SETTINGS.items() if k in valid_settings_fields}
        obj, created = SiteSettings.objects.update_or_create(pk=1, defaults=defaults)
        self.stdout.write(
            self.style.SUCCESS("  created" if created else "  updated" + " SiteSettings.")
        )
