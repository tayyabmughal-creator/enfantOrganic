from django.db import models

from .base import OrderedModel


class Region(OrderedModel):
    code = models.SlugField(unique=True, max_length=12)
    name_en = models.CharField(max_length=120)
    name_ar = models.CharField(max_length=120)
    currency_code = models.CharField(max_length=3)
    locale_code = models.CharField(max_length=12, default="en")
    shipping_threshold = models.DecimalField(max_digits=8, decimal_places=2)
    contact_phone = models.CharField(max_length=50)
    contact_email = models.EmailField(blank=True)
    address_en = models.TextField()
    address_ar = models.TextField()
    is_default = models.BooleanField(default=False)
    whatsapp_phone = models.CharField(max_length=32, blank=True)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=2.00)
    free_shipping_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name_en} ({self.currency_code})"


class SiteSettings(models.Model):
    brand_name = models.CharField(max_length=120, default="Enfant Organics")
    announcement_en = models.CharField(max_length=255)
    announcement_ar = models.CharField(max_length=255)
    footer_about_en = models.TextField()
    footer_about_ar = models.TextField()
    newsletter_title_en = models.CharField(max_length=255)
    newsletter_title_ar = models.CharField(max_length=255)
    newsletter_subtitle_en = models.TextField()
    newsletter_subtitle_ar = models.TextField()
    instagram_title_en = models.CharField(max_length=255)
    instagram_title_ar = models.CharField(max_length=255)
    instagram_cta_en = models.CharField(max_length=120)
    instagram_cta_ar = models.CharField(max_length=120)
    blog_title_en = models.CharField(max_length=255)
    blog_title_ar = models.CharField(max_length=255)
    free_gift_title_en = models.CharField(max_length=255)
    free_gift_title_ar = models.CharField(max_length=255)
    free_gift_subtitle_en = models.TextField()
    free_gift_subtitle_ar = models.TextField()
    why_choose_links = models.JSONField(default=list, blank=True)
    policy_links = models.JSONField(default=list, blank=True)
    static_links = models.JSONField(default=list, blank=True)

    def __str__(self):
        return self.brand_name


class HeroPromoCard(OrderedModel):
    LARGE = "large"
    SMALL = "small"
    CARD_SIZE_CHOICES = (
        (LARGE, "Large"),
        (SMALL, "Small"),
    )

    title_en = models.CharField(max_length=255, default="")
    title_ar = models.CharField(max_length=255, default="")
    subtitle_en = models.TextField(blank=True, default="")
    subtitle_ar = models.TextField(blank=True, default="")
    cta_en = models.CharField(max_length=120, blank=True, default="")
    cta_ar = models.CharField(max_length=120, blank=True, default="")
    href = models.CharField(max_length=255, blank=True)
    image = models.URLField(max_length=500)
    image_file = models.ImageField(upload_to="hero-cards/", blank=True, null=True)
    size = models.CharField(max_length=12, choices=CARD_SIZE_CHOICES, default=SMALL)
    accent = models.CharField(max_length=40, default="soft")

    def __str__(self):
        return self.title_en


class Category(OrderedModel):
    slug = models.SlugField(unique=True)
    name_en = models.CharField(max_length=120, default="")
    name_ar = models.CharField(max_length=120, default="")
    description_en = models.TextField(blank=True, default="")
    description_ar = models.TextField(blank=True, default="")
    image = models.URLField(max_length=500)
    image_file = models.ImageField(upload_to="categories/", blank=True, null=True)

    def __str__(self):
        return self.name_en


class Tag(OrderedModel):
    slug = models.SlugField(unique=True)
    name_en = models.CharField(max_length=120, default="")
    name_ar = models.CharField(max_length=120, default="")

    def __str__(self):
        return self.name_en


class Product(OrderedModel):
    slug = models.SlugField(unique=True)
    name_en = models.CharField(max_length=255, default="")
    name_ar = models.CharField(max_length=255, default="")
    brand = models.CharField(max_length=120, default="Enfant")
    unit = models.CharField(max_length=80, blank=True, default="")
    vendor_en = models.CharField(max_length=120, default="Enfant Organics")
    vendor_ar = models.CharField(max_length=120, default="إنفانت أورجانيكس")
    short_description_en = models.TextField(default="")
    short_description_ar = models.TextField(default="")
    description_en = models.TextField(default="")
    description_ar = models.TextField(default="")
    ingredients_en = models.TextField(blank=True, default="")
    ingredients_ar = models.TextField(blank=True, default="")
    usage_instructions_en = models.TextField(blank=True, default="")
    usage_instructions_ar = models.TextField(blank=True, default="")
    origin_source_en = models.CharField(max_length=255, blank=True, default="")
    origin_source_ar = models.CharField(max_length=255, blank=True, default="")
    organic_certification_name = models.CharField(max_length=160, blank=True, default="")
    organic_certification_file = models.FileField(
        upload_to="certifications/",
        blank=True,
        null=True,
    )
    dietary_tags = models.JSONField(default=list, blank=True)
    shelf_life = models.CharField(max_length=120, blank=True, default="")
    expiry_date = models.DateField(blank=True, null=True)
    details_en = models.JSONField(default=list, blank=True)
    details_ar = models.JSONField(default=list, blank=True)
    reviews_en = models.JSONField(default=list, blank=True)
    reviews_ar = models.JSONField(default=list, blank=True)
    badge_en = models.CharField(max_length=60, blank=True)
    badge_ar = models.CharField(max_length=60, blank=True)
    review_count = models.PositiveIntegerField(default=0)
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=5.0)
    image = models.URLField(max_length=500, default="")
    image_file = models.ImageField(upload_to="products/", blank=True, null=True)
    hover_image = models.URLField(max_length=500, default="")
    hover_image_file = models.ImageField(upload_to="products/hover/", blank=True, null=True)
    gallery = models.JSONField(default=list, blank=True)
    option_groups_en = models.JSONField(default=list, blank=True)
    option_groups_ar = models.JSONField(default=list, blank=True)
    show_in_new_arrivals = models.BooleanField(default=False)
    show_in_baby_sets = models.BooleanField(default=False)
    show_in_top_choices = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)
    stock_quantity = models.PositiveIntegerField(default=100)
    track_inventory = models.BooleanField(default=False)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="products")
    tags = models.ManyToManyField(Tag, related_name="products", blank=True)

    def __str__(self):
        return self.name_en


class ProductPrice(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="prices")
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="product_prices")
    price = models.DecimalField(max_digits=8, decimal_places=2)
    compare_at_price = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
    )
    price_prefix_en = models.CharField(max_length=20, blank=True)
    price_prefix_ar = models.CharField(max_length=20, blank=True)
    unit_price_text_en = models.CharField(max_length=120, blank=True)
    unit_price_text_ar = models.CharField(max_length=120, blank=True)

    class Meta:
        unique_together = ("product", "region")
        ordering = ("region__sort_order", "product__sort_order")

    def __str__(self):
        return f"{self.product.name_en} · {self.region.currency_code}"


class Testimonial(OrderedModel):
    name = models.CharField(max_length=120, default="")
    location_en = models.CharField(max_length=120, default="")
    location_ar = models.CharField(max_length=120, default="")
    quote_en = models.TextField(default="")
    quote_ar = models.TextField(default="")
    rating = models.PositiveSmallIntegerField(default=5)

    def __str__(self):
        return self.name


class InstagramPost(OrderedModel):
    image = models.URLField(max_length=500, default="")
    image_file = models.ImageField(upload_to="instagram/", blank=True, null=True)
    href = models.URLField(max_length=500, default="")

    def __str__(self):
        return self.href


class BlogPost(OrderedModel):
    slug = models.SlugField(unique=True)
    title_en = models.CharField(max_length=255, default="")
    title_ar = models.CharField(max_length=255, default="")
    excerpt_en = models.TextField(default="")
    excerpt_ar = models.TextField(default="")
    image = models.URLField(max_length=500, default="")
    image_file = models.ImageField(upload_to="blog/", blank=True, null=True)
    published_at = models.DateField()

    def __str__(self):
        return self.title_en
