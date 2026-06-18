from django.core.management.base import BaseCommand
from django.db import transaction

from store.models import (
    BlogPost,
    Category,
    HeroPromoCard,
    InstagramPost,
    Product,
    ProductPrice,
    Region,
    SiteSettings,
    TaxRate,
    Tag,
    Testimonial,
)
from store.sample_data import (
    BLOG_POSTS,
    CATEGORIES,
    HERO_PROMO_CARDS,
    INSTAGRAM_POSTS,
    PRODUCTS,
    REGIONS,
    SITE_SETTINGS,
    TAX_RATES,
    TAGS,
    TESTIMONIALS,
)


class Command(BaseCommand):
    help = "Seed the Enfant Organic storefront data."

    @transaction.atomic
    def handle(self, *args, **options):
        region_map = {}
        category_map = {}
        tag_map = {}

        SiteSettings.objects.update_or_create(pk=1, defaults=SITE_SETTINGS)

        for payload in REGIONS:
            region, _ = Region.objects.update_or_create(
                code=payload["code"],
                defaults=payload,
            )
            region_map[payload["code"]] = region

        for payload in TAX_RATES:
            defaults = payload.copy()
            region_code = defaults.pop("region_code")
            region = region_map.get(region_code) or Region.objects.filter(code=region_code).first()
            if not region:
                continue
            TaxRate.objects.update_or_create(
                region=region,
                label=defaults["label"],
                effective_from=defaults["effective_from"],
                defaults=defaults,
            )

        for payload in HERO_PROMO_CARDS:
            HeroPromoCard.objects.update_or_create(
                title_en=payload["title_en"],
                defaults=payload,
            )

        for payload in CATEGORIES:
            category, _ = Category.objects.update_or_create(
                slug=payload["slug"],
                defaults=payload,
            )
            category_map[payload["slug"]] = category

        for payload in TAGS:
            tag, _ = Tag.objects.update_or_create(
                slug=payload["slug"],
                defaults=payload,
            )
            tag_map[payload["slug"]] = tag

        for payload in PRODUCTS:
            payload_copy = payload.copy()
            prices = payload_copy.pop("prices")
            category_slug = payload_copy.pop("category_slug")
            tag_slugs = payload_copy.pop("tag_slugs")

            product_defaults = {**payload_copy}
            product, _ = Product.objects.update_or_create(
                slug=payload_copy["slug"],
                defaults=product_defaults,
            )
            product.categories.set([category_map[category_slug]])
            product.tags.set([tag_map[slug] for slug in tag_slugs])

            for region_code, price_payload in prices.items():
                ProductPrice.objects.update_or_create(
                    product=product,
                    region=region_map[region_code],
                    defaults=price_payload,
                )

        for payload in TESTIMONIALS:
            Testimonial.objects.update_or_create(
                name=payload["name"],
                defaults=payload,
            )

        for payload in INSTAGRAM_POSTS:
            InstagramPost.objects.update_or_create(
                href=payload["href"],
                sort_order=payload["sort_order"],
                defaults=payload,
            )

        for payload in BLOG_POSTS:
            BlogPost.objects.update_or_create(
                slug=payload["slug"],
                defaults=payload,
            )

        self.stdout.write(self.style.SUCCESS("Storefront data seeded successfully."))
