from django.core.management.base import BaseCommand
from django.db import transaction

from store.models import HeroPromoCard


ASSET_BASE = "/enfant"
HERO_PROMO_CARD_TARGETS = [
    {
        "title_en": "Gift Box Offer",
        "title_ar": "عرض صندوق الهدايا",
        "subtitle_en": "Discover curated gift-ready bundles for baby care routines.",
        "subtitle_ar": "اكتشف باقات مختارة جاهزة للهدايا لروتين عناية الطفل.",
        "cta_en": "Explore gift boxes",
        "cta_ar": "اكتشف صناديق الهدايا",
        "href": "/collections?collection=baby_sets",
        "image": f"{ASSET_BASE}/complete-care-cream.jpg",
        "size": "large",
        "accent": "gift",
        "sort_order": 1,
    },
    {
        "title_en": "Extra Mild Moisture Lotion",
        "title_ar": "لوشن الترطيب فائق اللطف",
        "subtitle_en": "A premium daily lotion for delicate baby skin.",
        "subtitle_ar": "لوشن يومي فاخر لبشرة الطفل الحساسة.",
        "cta_en": "Shop daily moisture",
        "cta_ar": "تسوق الترطيب اليومي",
        "href": "/product/extra-mild-moisture-lotion",
        "image": f"{ASSET_BASE}/extra-mild-moisture-lotion.jpg",
        "size": "large",
        "accent": "soft",
        "sort_order": 1,
    },
    {
        "title_en": "Premium Baby Care Sets",
        "title_ar": "مجموعات عناية أطفال مميزة",
        "subtitle_en": "Top bundle picks designed for everyday baby essentials.",
        "subtitle_ar": "أفضل الباقات المصممة لاحتياجات العناية اليومية بالطفل.",
        "cta_en": "Shop premium sets",
        "cta_ar": "تسوق المجموعات المميزة",
        "href": "/collections?collection=baby_sets",
        "image": f"{ASSET_BASE}/extra-mild-moisture-lotion.jpg",
        "size": "small",
        "accent": "sets",
        "sort_order": 2,
    },
    {
        "title_en": "Double Moisture Lotion",
        "title_ar": "لوشن الترطيب المزدوج",
        "subtitle_en": "Rich nourishment for delicate skin comfort.",
        "subtitle_ar": "ترطيب غني لراحة البشرة الحساسة.",
        "cta_en": "See best seller",
        "cta_ar": "شاهد الأكثر مبيعًا",
        "href": "/best-sellers",
        "image": f"{ASSET_BASE}/double-moisture-lotion.png",
        "size": "small",
        "accent": "moisture",
        "sort_order": 2,
    },
    {
        "title_en": "Mom’s Choice",
        "title_ar": "اختيار الأمهات",
        "subtitle_en": "Parent-favorite picks trusted for gentle daily care.",
        "subtitle_ar": "اختيارات مفضلة لدى الأمهات لعناية يومية لطيفة.",
        "cta_en": "Shop top picks",
        "cta_ar": "تسوق الاختيارات المميزة",
        "href": "/collections?ordering=-rating",
        "image": f"{ASSET_BASE}/relax-moisturizing-lotion.png",
        "size": "small",
        "accent": "choice",
        "sort_order": 3,
    },
    {
        "title_en": "Relax Moisturizing Lotion",
        "title_ar": "لوشن الترطيب المريح",
        "subtitle_en": "Comforting moisture for calmer routines.",
        "subtitle_ar": "ترطيب مريح لروتين أكثر هدوءًا.",
        "cta_en": "Night routine",
        "cta_ar": "روتين المساء",
        "href": "/product/serene-knit-organic-blanket",
        "image": f"{ASSET_BASE}/relax-moisturizing-lotion.png",
        "size": "small",
        "accent": "relax",
        "sort_order": 3,
    },
    {
        "title_en": "New Arrivals",
        "title_ar": "وصل حديثًا",
        "subtitle_en": "Fresh additions to the Enfant baby care collection.",
        "subtitle_ar": "إضافات جديدة إلى مجموعة إنفانت لعناية الأطفال.",
        "cta_en": "See new arrivals",
        "cta_ar": "شاهد الجديد",
        "href": "/new-arrivals",
        "image": f"{ASSET_BASE}/moisture-shampoo.png",
        "size": "small",
        "accent": "new",
        "sort_order": 4,
    },
    {
        "title_en": "Daily Sun Protection",
        "title_ar": "حماية يومية من الشمس",
        "subtitle_en": "Lightweight sun care for everyday outings.",
        "subtitle_ar": "عناية خفيفة من الشمس للنزهات اليومية.",
        "cta_en": "Explore sun care",
        "cta_ar": "اكتشف العناية الشمسية",
        "href": "/product/organic-kids-toothpaste",
        "image": f"{ASSET_BASE}/daily-sun-protection-lotion.png",
        "size": "small",
        "accent": "sun",
        "sort_order": 4,
    },
]


def _title_variants(title_en):
    yield title_en
    if "'" in title_en:
        yield title_en.replace("'", "’")
    if "’" in title_en:
        yield title_en.replace("’", "'")


class Command(BaseCommand):
    help = "Ensure the canonical homepage HeroPromoCard records exist without duplicating existing rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview cards that would be created/updated without writing to the database.",
        )
        parser.add_argument(
            "--update-hrefs",
            action="store_true",
            help="Also update the href field on existing cards to match the canonical targets.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        update_hrefs = bool(options.get("update_hrefs"))
        created_count = 0
        skipped_count = 0
        updated_count = 0

        initial_count = HeroPromoCard.objects.count()

        for payload in HERO_PROMO_CARD_TARGETS:
            existing = None
            for title_variant in _title_variants(payload["title_en"]):
                existing = HeroPromoCard.objects.filter(title_en=title_variant).first()
                if existing:
                    break

            if existing:
                if update_hrefs and existing.href != payload["href"]:
                    if not dry_run:
                        existing.href = payload["href"]
                        existing.save(update_fields=["href"])
                    updated_count += 1
                    self.stdout.write(f"{'[dry-run] ' if dry_run else ''}Updated href for: {existing.title_en} -> {payload['href']}")
                else:
                    skipped_count += 1
                    self.stdout.write(f"Skipped existing card: {existing.title_en}")
                continue

            if dry_run:
                created_count += 1
                self.stdout.write(f"[dry-run] Would create: {payload['title_en']}")
                continue

            HeroPromoCard.objects.create(**payload)
            created_count += 1
            self.stdout.write(f"Created missing card: {payload['title_en']}")

        if dry_run:
            transaction.set_rollback(True)

        final_count = HeroPromoCard.objects.count() if not dry_run else initial_count + created_count
        self.stdout.write(
            self.style.SUCCESS(
                f"HeroPromoCard ensure complete. initial={initial_count} final={final_count} "
                f"created={created_count} updated={updated_count} skipped={skipped_count} dry_run={dry_run}"
            )
        )
