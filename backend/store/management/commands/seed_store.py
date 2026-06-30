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

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-overwrite",
            action="store_true",
            help="Overwrite existing rows with sample data. Without this flag, existing admin edits are preserved.",
        )

    @staticmethod
    def _is_empty(value):
        return value is None or value == "" or value == [] or value == {}

    def _apply_defaults(self, obj, defaults, *, force=False):
        changed = []
        for field, value in defaults.items():
            if force or self._is_empty(getattr(obj, field, None)):
                setattr(obj, field, value)
                changed.append(field)
        if changed:
            obj.save(update_fields=changed)
        return changed

    @transaction.atomic
    def handle(self, *args, **options):
        force = bool(options.get("force_overwrite"))
        region_map = {}
        category_map = {}
        tag_map = {}

        settings, created = SiteSettings.objects.get_or_create(pk=1, defaults=SITE_SETTINGS)
        if not created:
            self._apply_defaults(settings, SITE_SETTINGS, force=force)

        for payload in REGIONS:
            defaults = payload.copy()
            region, created = Region.objects.get_or_create(
                code=payload["code"],
                defaults=defaults,
            )
            if not created:
                self._apply_defaults(region, defaults, force=force)
            region_map[payload["code"]] = region

        for payload in TAX_RATES:
            defaults = payload.copy()
            region_code = defaults.pop("region_code")
            region = region_map.get(region_code) or Region.objects.filter(code=region_code).first()
            if not region:
                continue
            tax_rate, created = TaxRate.objects.get_or_create(
                region=region,
                label=defaults["label"],
                effective_from=defaults["effective_from"],
                defaults=defaults,
            )
            if not created:
                self._apply_defaults(tax_rate, defaults, force=force)

        for payload in HERO_PROMO_CARDS:
            card, created = HeroPromoCard.objects.get_or_create(
                title_en=payload["title_en"],
                defaults=payload,
            )
            if not created:
                self._apply_defaults(card, payload, force=force)

        for payload in CATEGORIES:
            category, created = Category.objects.get_or_create(
                slug=payload["slug"],
                defaults=payload,
            )
            if not created:
                self._apply_defaults(category, payload, force=force)
            category_map[payload["slug"]] = category

        for payload in TAGS:
            tag, created = Tag.objects.get_or_create(
                slug=payload["slug"],
                defaults=payload,
            )
            if not created:
                self._apply_defaults(tag, payload, force=force)
            tag_map[payload["slug"]] = tag

        for payload in PRODUCTS:
            payload_copy = payload.copy()
            prices = payload_copy.pop("prices")
            category_slug = payload_copy.pop("category_slug")
            tag_slugs = payload_copy.pop("tag_slugs")

            product_defaults = {**payload_copy}
            product, created = Product.objects.get_or_create(
                slug=payload_copy["slug"],
                defaults=product_defaults,
            )
            if not created:
                self._apply_defaults(product, product_defaults, force=force)
            if created or force:
                product.categories.set([category_map[category_slug]])
                product.tags.set([tag_map[slug] for slug in tag_slugs])

            for region_code, price_payload in prices.items():
                price, created = ProductPrice.objects.get_or_create(
                    product=product,
                    region=region_map[region_code],
                    defaults=price_payload,
                )
                if not created:
                    self._apply_defaults(price, price_payload, force=force)

        for payload in TESTIMONIALS:
            testimonial, created = Testimonial.objects.get_or_create(
                name=payload["name"],
                defaults=payload,
            )
            if not created:
                self._apply_defaults(testimonial, payload, force=force)

        for payload in INSTAGRAM_POSTS:
            post, created = InstagramPost.objects.get_or_create(
                href=payload["href"],
                sort_order=payload["sort_order"],
                defaults=payload,
            )
            if not created:
                self._apply_defaults(post, payload, force=force)

        for payload in BLOG_POSTS:
            post, created = BlogPost.objects.get_or_create(
                slug=payload["slug"],
                defaults=payload,
            )
            if not created:
                self._apply_defaults(post, payload, force=force)

        self.stdout.write(self.style.SUCCESS("Storefront data seeded successfully."))
