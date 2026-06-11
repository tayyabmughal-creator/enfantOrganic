from django.core.management.base import BaseCommand
from store.models import Region
from store.sample_data import REGIONS


class Command(BaseCommand):
    help = "Seed Region rows (idempotent — safe to re-run)."

    def handle(self, *args, **options):
        valid_fields = {f.name for f in Region._meta.fields}
        for payload in REGIONS:
            defaults = {k: v for k, v in payload.items() if k in valid_fields and k != "code"}
            obj, created = Region.objects.update_or_create(code=payload["code"], defaults=defaults)
            self.stdout.write(("  created" if created else "  updated") + f" region: {obj.code}")
        self.stdout.write(self.style.SUCCESS(f"Regions ready: {Region.objects.count()} total."))
