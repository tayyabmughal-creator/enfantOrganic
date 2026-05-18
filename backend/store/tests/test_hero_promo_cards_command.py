from django.core.management import call_command
from django.test import TestCase

from store.models import HeroPromoCard


class EnsureHeroPromoCardsCommandTestCase(TestCase):
    def setUp(self):
        HeroPromoCard.objects.create(
            title_en="Extra Mild Moisture Lotion",
            title_ar="لوشن الترطيب فائق اللطف",
            subtitle_en="Existing",
            subtitle_ar="",
            cta_en="Shop",
            cta_ar="",
            href="/collections",
            image="/enfant/extra-mild-moisture-lotion.jpg",
            size="large",
            accent="soft",
            sort_order=1,
        )
        HeroPromoCard.objects.create(
            title_en="Double Moisture Lotion",
            title_ar="لوشن الترطيب المزدوج",
            subtitle_en="Existing",
            subtitle_ar="",
            cta_en="Shop",
            cta_ar="",
            href="/collections",
            image="/enfant/double-moisture-lotion.png",
            size="small",
            accent="moisture",
            sort_order=2,
        )
        HeroPromoCard.objects.create(
            title_en="Relax Moisturizing Lotion",
            title_ar="لوشن الترطيب المريح",
            subtitle_en="Existing",
            subtitle_ar="",
            cta_en="Shop",
            cta_ar="",
            href="/collections",
            image="/enfant/relax-moisturizing-lotion.png",
            size="small",
            accent="relax",
            sort_order=3,
        )
        HeroPromoCard.objects.create(
            title_en="Daily Sun Protection",
            title_ar="حماية يومية من الشمس",
            subtitle_en="Existing",
            subtitle_ar="",
            cta_en="Shop",
            cta_ar="",
            href="/collections",
            image="/enfant/daily-sun-protection-lotion.png",
            size="small",
            accent="sun",
            sort_order=4,
        )

    def test_command_is_idempotent_and_creates_missing_cards(self):
        self.assertEqual(HeroPromoCard.objects.count(), 4)

        call_command("ensure_hero_promo_cards")
        self.assertEqual(HeroPromoCard.objects.count(), 8)

        expected_titles = {
            "Gift Box Offer",
            "Extra Mild Moisture Lotion",
            "Premium Baby Care Sets",
            "Double Moisture Lotion",
            "Mom’s Choice",
            "Relax Moisturizing Lotion",
            "New Arrivals",
            "Daily Sun Protection",
        }
        self.assertEqual(
            set(HeroPromoCard.objects.values_list("title_en", flat=True)),
            expected_titles,
        )

        call_command("ensure_hero_promo_cards")
        self.assertEqual(HeroPromoCard.objects.count(), 8)
