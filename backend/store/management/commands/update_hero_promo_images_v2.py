from django.core.management.base import BaseCommand
from django.db import transaction

from store.models import HeroPromoCard


IMAGE_MAPPING = {
    "Gift Box Offer": "/enfant/hero-gift-box-offer-v2.jpg",
    "Extra Mild Moisture Lotion": "/enfant/hero-extra-mild-moisture-lotion-v2.jpg",
    "Premium Baby Care Sets": "/enfant/hero-premium-baby-care-sets-v2.jpg",
    "Double Moisture Lotion": "/enfant/hero-double-moisture-lotion-v2.jpg",
    "Mom's Choice": "/enfant/hero-moms-choice-v2.jpg",
    "Mom’s Choice": "/enfant/hero-moms-choice-v2.jpg",
    "Relax Moisturizing Lotion": "/enfant/hero-relax-moisturizing-lotion-v2.jpg",
    "New Arrivals": "/enfant/hero-new-arrivals-v2.jpg",
    "Daily Sun Protection": "/enfant/hero-daily-sun-protection-v2.jpg",
}


class Command(BaseCommand):
    help = "Update HeroPromoCard image URLs to regenerated v2 homepage hero assets."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview updates without writing to the database.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        updated = 0
        unchanged = 0
        missing = []

        for title, image_path in IMAGE_MAPPING.items():
            card = HeroPromoCard.objects.filter(title_en=title).first()
            if not card:
                missing.append(title)
                continue

            if card.image == image_path:
                unchanged += 1
                continue

            updated += 1
            if not dry_run:
                card.image = image_path
                card.save(update_fields=["image"])

        if dry_run:
            transaction.set_rollback(True)

        if missing:
            self.stdout.write(
                self.style.WARNING(f"Missing titles: {', '.join(sorted(set(missing)))}")
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Hero image update complete. updated={updated} unchanged={unchanged} "
                f"missing={len(set(missing))} dry_run={dry_run}"
            )
        )
