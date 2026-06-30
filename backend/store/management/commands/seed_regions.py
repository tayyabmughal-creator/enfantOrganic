from django.core.management.base import BaseCommand
from store.models import Region, SiteSettings
from store.sample_data import REGIONS, SITE_SETTINGS


class Command(BaseCommand):
    help = "Seed Region and SiteSettings rows without overwriting admin-edited values."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-overwrite",
            action="store_true",
            help="Overwrite existing Region and SiteSettings values with sample defaults.",
        )

    @staticmethod
    def _is_empty(value):
        return value is None or value == "" or value == [] or value == {}

    def handle(self, *args, **options):
        force = bool(options.get("force_overwrite"))
        # Seed regions
        valid_region_fields = {f.name for f in Region._meta.fields}
        for payload in REGIONS:
            defaults = {k: v for k, v in payload.items() if k in valid_region_fields and k != "code"}
            obj, created = Region.objects.get_or_create(code=payload["code"], defaults=defaults)
            changed = []
            if not created:
                for field, value in defaults.items():
                    if force or self._is_empty(getattr(obj, field, None)):
                        setattr(obj, field, value)
                        changed.append(field)
                if changed:
                    obj.save(update_fields=changed)
            action = "created" if created else ("updated" if changed else "kept")
            self.stdout.write(f"  {action} region: {obj.code}")
        self.stdout.write(self.style.SUCCESS(f"Regions ready: {Region.objects.count()} total."))

        # Seed SiteSettings (required for /api/navigation/)
        valid_settings_fields = {f.name for f in SiteSettings._meta.fields}
        defaults = {k: v for k, v in SITE_SETTINGS.items() if k in valid_settings_fields}
        obj, created = SiteSettings.objects.get_or_create(pk=1, defaults=defaults)
        changed = []
        if not created:
            for field, value in defaults.items():
                if force or self._is_empty(getattr(obj, field, None)):
                    setattr(obj, field, value)
                    changed.append(field)
            if changed:
                obj.save(update_fields=changed)
        action = "created" if created else ("updated" if changed else "kept")
        self.stdout.write(self.style.SUCCESS(f"  {action} SiteSettings."))
