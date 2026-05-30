from django.db import models
from django.utils import timezone

from .base import OrderedModel


def default_enabled_payment_providers():
    return ["paymob"]


def default_supported_payment_methods():
    return {"cards": [], "wallets": [], "local": []}


class Region(OrderedModel):
    PAYMENT_PROVIDER_PAYMOB = "paymob"
    PAYMENT_PROVIDER_PAYTABS = "paytabs"
    PAYMENT_PROVIDER_HYPERPAY = "hyperpay"
    PAYMENT_PROVIDER_TELR = "telr"
    PAYMENT_PROVIDER_THAWANI = "thawani"
    PAYMENT_PROVIDER_OMANNET = "omannet"

    PAYMENT_PROVIDER_CHOICES = (
        (PAYMENT_PROVIDER_PAYMOB, "Paymob"),
        (PAYMENT_PROVIDER_PAYTABS, "PayTabs"),
        (PAYMENT_PROVIDER_HYPERPAY, "HyperPay"),
        (PAYMENT_PROVIDER_TELR, "Telr"),
        (PAYMENT_PROVIDER_THAWANI, "Thawani"),
        (PAYMENT_PROVIDER_OMANNET, "OmanNet"),
    )

    PAYMENT_MODE_SANDBOX = "sandbox"
    PAYMENT_MODE_LIVE = "live"

    PAYMENT_MODE_CHOICES = (
        (PAYMENT_MODE_SANDBOX, "Sandbox"),
        (PAYMENT_MODE_LIVE, "Live"),
    )

    CARRIER_MANUAL = "manual"
    CARRIER_ARAMEX = "aramex"
    CARRIER_SMSA = "smsa"
    CARRIER_FETCHR = "fetchr"

    CARRIER_CHOICES = (
        (CARRIER_MANUAL, "Manual"),
        (CARRIER_ARAMEX, "Aramex"),
        (CARRIER_SMSA, "SMSA"),
        (CARRIER_FETCHR, "Fetchr/Equivalent"),
    )

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
    seller_legal_name = models.CharField(max_length=255, blank=True, default="")
    seller_vat_number = models.CharField(max_length=64, blank=True, default="")
    seller_cr_number = models.CharField(max_length=64, blank=True, default="")
    seller_address_en = models.TextField(blank=True, default="")
    seller_address_ar = models.TextField(blank=True, default="")
    seller_phone = models.CharField(max_length=50, blank=True, default="")
    seller_email = models.EmailField(blank=True)
    is_default = models.BooleanField(default=False)
    whatsapp_phone = models.CharField(max_length=32, blank=True)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=2.00)
    free_shipping_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    require_map_pin = models.BooleanField(default=False)
    payment_enabled_providers = models.JSONField(default=default_enabled_payment_providers, blank=True)
    default_payment_provider = models.CharField(
        max_length=32,
        choices=PAYMENT_PROVIDER_CHOICES,
        default=PAYMENT_PROVIDER_PAYMOB,
    )
    payment_supported_methods = models.JSONField(default=default_supported_payment_methods, blank=True)
    payment_mode = models.CharField(
        max_length=12,
        choices=PAYMENT_MODE_CHOICES,
        default=PAYMENT_MODE_SANDBOX,
    )
    carrier_enabled = models.BooleanField(default=False)
    primary_carrier = models.CharField(
        max_length=24,
        choices=CARRIER_CHOICES,
        default=CARRIER_MANUAL,
    )
    fallback_carrier = models.CharField(
        max_length=24,
        choices=CARRIER_CHOICES,
        default=CARRIER_MANUAL,
    )
    fulfillment_warehouses = models.ManyToManyField(
        "Warehouse",
        blank=True,
        related_name="fulfillment_regions",
    )
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name_en} ({self.currency_code})"

    @classmethod
    def allowed_payment_provider_keys(cls):
        return [choice[0] for choice in cls.PAYMENT_PROVIDER_CHOICES]

    @classmethod
    def allowed_carrier_keys(cls):
        return [choice[0] for choice in cls.CARRIER_CHOICES]

    def _normalize_enabled_payment_providers(self):
        allowed = set(self.allowed_payment_provider_keys())
        raw = self.payment_enabled_providers
        if isinstance(raw, list):
            candidates = raw
        elif isinstance(raw, str):
            candidates = raw.split(",")
        else:
            candidates = []
        normalized = []
        seen = set()
        for item in candidates:
            key = str(item or "").strip().lower()
            if not key or key not in allowed or key in seen:
                continue
            seen.add(key)
            normalized.append(key)
        return normalized

    def save(self, *args, **kwargs):
        self.default_payment_provider = str(self.default_payment_provider or self.PAYMENT_PROVIDER_PAYMOB).strip().lower()
        if self.default_payment_provider not in set(self.allowed_payment_provider_keys()):
            self.default_payment_provider = self.PAYMENT_PROVIDER_PAYMOB

        self.primary_carrier = str(self.primary_carrier or self.CARRIER_MANUAL).strip().lower()
        if self.primary_carrier not in set(self.allowed_carrier_keys()):
            self.primary_carrier = self.CARRIER_MANUAL

        self.fallback_carrier = str(self.fallback_carrier or self.CARRIER_MANUAL).strip().lower()
        if self.fallback_carrier not in set(self.allowed_carrier_keys()):
            self.fallback_carrier = self.CARRIER_MANUAL

        enabled = self._normalize_enabled_payment_providers()
        if enabled and self.default_payment_provider not in enabled:
            enabled = [self.default_payment_provider, *[item for item in enabled if item != self.default_payment_provider]]
        self.payment_enabled_providers = enabled
        super().save(*args, **kwargs)

    def get_fulfillment_warehouses(self):
        mapped = self.fulfillment_warehouses.filter(active=True)
        if mapped.exists():
            return mapped
        return Warehouse.objects.filter(region=self, active=True)


class ShippingRule(models.Model):
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="shipping_rules")
    city = models.CharField(max_length=120, blank=True, default="")
    area = models.CharField(max_length=120, blank=True, default="")
    min_order_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_order_value = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    free_shipping_threshold = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    eta_min_days = models.PositiveSmallIntegerField(blank=True, null=True)
    eta_max_days = models.PositiveSmallIntegerField(blank=True, null=True)
    carrier_name = models.CharField(max_length=120, blank=True, default="")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = (
            "region__sort_order",
            "region__id",
            "-active",
            "city",
            "area",
            "-min_order_value",
            "id",
        )

    def __str__(self):
        location_bits = [item for item in [self.city, self.area] if item]
        location = " / ".join(location_bits) if location_bits else "All locations"
        ceiling = self.max_order_value if self.max_order_value is not None else "∞"
        return f"{self.region.code.upper()} {location} [{self.min_order_value} - {ceiling}]"


class TaxRate(models.Model):
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="tax_rates")
    country_code = models.CharField(max_length=12, blank=True)
    label = models.CharField(max_length=120, default="VAT")
    rate = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    is_active = models.BooleanField(default=True)
    is_inclusive = models.BooleanField(default=False)
    applies_to_shipping = models.BooleanField(default=True)
    effective_from = models.DateField(default=timezone.localdate)
    effective_to = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("region__sort_order", "-effective_from", "-id")

    def __str__(self):
        return f"{self.label} {self.region.code.upper()} {self.rate}"

    def save(self, *args, **kwargs):
        if not self.country_code:
            self.country_code = self.region.code.upper()
        else:
            self.country_code = self.country_code.upper()
        super().save(*args, **kwargs)

    @classmethod
    def get_effective_rate(cls, region, at_date=None):
        if not region:
            return None
        target_date = at_date or timezone.localdate()
        return (
            cls.objects.filter(
                region=region,
                is_active=True,
                effective_from__lte=target_date,
            )
            .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=target_date))
            .order_by("-effective_from", "-id")
            .first()
        )


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

    # Branding & Identity
    logo_url = models.CharField(max_length=500, blank=True, default="")
    favicon_url = models.CharField(max_length=500, blank=True, default="")
    tagline_en = models.CharField(max_length=255, blank=True, default="")
    tagline_ar = models.CharField(max_length=255, blank=True, default="")
    primary_color = models.CharField(max_length=20, blank=True, default="")
    accent_color = models.CharField(max_length=20, blank=True, default="")

    # Navigation
    nav_links = models.JSONField(default=list, blank=True)

    # Social Media
    facebook_url = models.CharField(max_length=500, blank=True, default="")
    instagram_url = models.CharField(max_length=500, blank=True, default="")
    twitter_url = models.CharField(max_length=500, blank=True, default="")
    youtube_url = models.CharField(max_length=500, blank=True, default="")
    tiktok_url = models.CharField(max_length=500, blank=True, default="")
    whatsapp_number = models.CharField(max_length=30, blank=True, default="")

    # Footer
    copyright_en = models.CharField(max_length=255, blank=True, default="")
    copyright_ar = models.CharField(max_length=255, blank=True, default="")

    # Global Contact
    contact_email = models.EmailField(blank=True, default="")
    contact_phone = models.CharField(max_length=30, blank=True, default="")
    address_en = models.CharField(max_length=500, blank=True, default="")
    address_ar = models.CharField(max_length=500, blank=True, default="")

    # SEO
    seo_title_en = models.CharField(max_length=255, blank=True, default="")
    seo_title_ar = models.CharField(max_length=255, blank=True, default="")
    seo_description_en = models.TextField(blank=True, default="")
    seo_description_ar = models.TextField(blank=True, default="")
    og_image_url = models.CharField(max_length=500, blank=True, default="")

    # Legal Pages
    return_policy_en = models.TextField(blank=True, default="")
    return_policy_ar = models.TextField(blank=True, default="")
    privacy_policy_en = models.TextField(blank=True, default="")
    privacy_policy_ar = models.TextField(blank=True, default="")

    # Social Pixels
    facebook_pixel_id = models.CharField(max_length=50, blank=True, default="")
    facebook_app_id = models.CharField(max_length=50, blank=True, default="")
    tiktok_pixel_id = models.CharField(max_length=50, blank=True, default="")
    snapchat_pixel_id = models.CharField(max_length=50, blank=True, default="")
    pinterest_tag_id = models.CharField(max_length=50, blank=True, default="")
    twitter_pixel_id = models.CharField(max_length=50, blank=True, default="")

    # Analytics & Ads
    google_analytics_id = models.CharField(max_length=30, blank=True, default="")
    google_ads_id = models.CharField(max_length=30, blank=True, default="")
    google_tag_manager_id = models.CharField(max_length=20, blank=True, default="")

    # Email Marketing
    klaviyo_public_key = models.CharField(max_length=50, blank=True, default="")
    mailchimp_api_key = models.CharField(max_length=120, blank=True, default="")
    mailchimp_list_id = models.CharField(max_length=50, blank=True, default="")

    # Instagram Shopping
    instagram_catalog_id = models.CharField(max_length=50, blank=True, default="")
    instagram_business_id = models.CharField(max_length=50, blank=True, default="")

    # WhatsApp Business Cloud API
    whatsapp_api_token = models.CharField(max_length=255, blank=True, default="")
    whatsapp_phone_number_id = models.CharField(max_length=50, blank=True, default="")

    # Zendesk
    zendesk_subdomain = models.CharField(max_length=80, blank=True, default="")
    zendesk_api_key = models.CharField(max_length=120, blank=True, default="")

    # Cloudinary
    cloudinary_cloud_name = models.CharField(max_length=80, blank=True, default="")
    cloudinary_api_key = models.CharField(max_length=50, blank=True, default="")

    # Algolia
    algolia_app_id = models.CharField(max_length=20, blank=True, default="")
    algolia_search_key = models.CharField(max_length=80, blank=True, default="")

    # Zapier
    zapier_order_webhook = models.CharField(max_length=500, blank=True, default="")

    # Stripe
    stripe_publishable_key = models.CharField(max_length=255, blank=True, default="")

    # Shippo
    shippo_api_token = models.CharField(max_length=120, blank=True, default="")

    # ── Payment Gateway Credentials ──────────────────────────────────────────
    # Stored in DB so admins can configure credentials without a redeploy.
    # Each service reads DB first, falls back to environment variables.

    # Paymob
    paymob_api_key              = models.CharField(max_length=200, blank=True, default="")
    paymob_integration_id       = models.CharField(max_length=20,  blank=True, default="")
    paymob_iframe_id            = models.CharField(max_length=20,  blank=True, default="")
    paymob_hmac_secret          = models.CharField(max_length=100, blank=True, default="")
    paymob_currency             = models.CharField(max_length=5,   blank=True, default="")
    paymob_apple_pay_integration_id = models.CharField(max_length=20, blank=True, default="")
    paymob_apple_pay_iframe_id  = models.CharField(max_length=20,  blank=True, default="")

    # PayTabs (global credentials; per-region keys stay in env vars)
    paytabs_profile_id          = models.CharField(max_length=20,  blank=True, default="")
    paytabs_server_key          = models.CharField(max_length=100, blank=True, default="")
    paytabs_region              = models.CharField(max_length=10,  blank=True, default="", help_text="e.g. SA, AE, OM")

    # HyperPay
    hyperpay_entity_id          = models.CharField(max_length=100, blank=True, default="")
    hyperpay_access_token       = models.CharField(max_length=200, blank=True, default="")

    # Telr
    telr_store_id               = models.CharField(max_length=20,  blank=True, default="")
    telr_auth_key               = models.CharField(max_length=100, blank=True, default="")

    # Thawani
    thawani_publishable_key     = models.CharField(max_length=100, blank=True, default="")
    thawani_secret_key          = models.CharField(max_length=100, blank=True, default="")
    thawani_webhook_secret      = models.CharField(max_length=100, blank=True, default="")
    thawani_base_url            = models.CharField(max_length=200, blank=True, default="")

    # OmanNet
    omannet_merchant_id         = models.CharField(max_length=50,  blank=True, default="")
    omannet_access_code         = models.CharField(max_length=100, blank=True, default="")
    omannet_sha_request         = models.CharField(max_length=100, blank=True, default="")
    omannet_sha_response        = models.CharField(max_length=100, blank=True, default="")
    omannet_webhook_secret      = models.CharField(max_length=100, blank=True, default="")

    # Inventory operations
    inventory_low_stock_threshold = models.PositiveIntegerField(default=10)

    def __str__(self):
        return self.brand_name


class PaymobRegionConfig(models.Model):
    """Per-region Paymob credentials, manageable from the admin panel.

    One row per supported region (Oman / Saudi Arabia / UAE). Each region needs
    its own Paymob-supported integration, so credentials never cross regions.
    Blank fields fall back to environment variables in
    ``store.services.payment_config.get_paymob_config`` — saving a blank value
    here never overwrites or disables a working env-based config.
    """

    REGION_OM = "OM"
    REGION_SA = "SA"
    REGION_AE = "AE"
    REGION_CHOICES = [
        (REGION_OM, "Oman (OMR)"),
        (REGION_SA, "Saudi Arabia (SAR)"),
        (REGION_AE, "United Arab Emirates (AED)"),
    ]
    DEFAULT_CURRENCY = {REGION_OM: "OMR", REGION_SA: "SAR", REGION_AE: "AED"}

    region_code    = models.CharField(max_length=2, choices=REGION_CHOICES, unique=True)
    enabled        = models.BooleanField(
        default=True,
        help_text="When off, Paymob is treated as disabled for this region even if credentials exist.",
    )
    api_key        = models.CharField(max_length=500, blank=True, default="")
    integration_id = models.CharField(max_length=20,  blank=True, default="")
    iframe_id      = models.CharField(max_length=20,  blank=True, default="")
    hmac_secret    = models.CharField(max_length=200, blank=True, default="")
    base_url       = models.CharField(max_length=200, blank=True, default="")
    currency       = models.CharField(max_length=5,   blank=True, default="")

    class Meta:
        verbose_name = "Paymob region config"
        verbose_name_plural = "Paymob region configs"
        ordering = ("region_code",)

    def save(self, *args, **kwargs):
        self.region_code = (self.region_code or "").strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Paymob · {self.get_region_code_display()}"


class TaxRule(models.Model):
    region = models.ForeignKey(
        "Region",
        on_delete=models.CASCADE,
        related_name="tax_rules",
        null=True,
        blank=True,
        help_text="Leave blank to apply globally across all regions.",
    )
    name_en = models.CharField(max_length=120, default="VAT")
    name_ar = models.CharField(max_length=120, blank=True, default="ضريبة القيمة المضافة")
    rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        help_text="Decimal rate, e.g. 0.05 for 5%.",
    )
    is_inclusive = models.BooleanField(
        default=False,
        help_text="True if prices already include this tax.",
    )
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("region__code", "name_en")

    def __str__(self):
        pct = round(float(self.rate) * 100, 2)
        return f"{self.name_en} ({pct}%)"


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
    is_visible = models.BooleanField(default=True)

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


class Warehouse(models.Model):
    code = models.SlugField(unique=True, max_length=40)
    name_en = models.CharField(max_length=160)
    name_ar = models.CharField(max_length=160)
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="warehouses")
    city = models.CharField(max_length=120, blank=True, default="")
    address = models.TextField(blank=True, default="")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("region__sort_order", "region__id", "code")

    def __str__(self):
        return f"{self.code.upper()} ({self.region.code.upper()})"


class ProductStock(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="warehouse_stocks")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="product_stocks")
    quantity = models.PositiveIntegerField(default=0)
    reserved_quantity = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.PositiveIntegerField(default=10)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product", "warehouse")
        ordering = ("warehouse__region__sort_order", "warehouse__code", "product__sort_order")

    def __str__(self):
        return f"{self.product.slug} @ {self.warehouse.code} ({self.quantity})"

    @property
    def available_quantity(self):
        return max(int(self.quantity or 0) - int(self.reserved_quantity or 0), 0)

    @property
    def is_low_stock(self):
        return self.available_quantity <= int(self.low_stock_threshold or 0)


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
    body_en = models.TextField(default="")
    body_ar = models.TextField(default="")
    image = models.URLField(max_length=500, default="")
    image_file = models.ImageField(upload_to="blog/", blank=True, null=True)
    category_en = models.CharField(max_length=120, default="", blank=True)
    category_ar = models.CharField(max_length=120, default="", blank=True)
    published_at = models.DateField(blank=True, null=True)
    is_published = models.BooleanField(default=False, db_index=True)

    def __str__(self):
        return self.title_en


class CmsPage(models.Model):
    slug = models.SlugField(max_length=120)
    title_en = models.CharField(max_length=255, default="")
    title_ar = models.CharField(max_length=255, default="")
    body_en = models.TextField(default="")
    body_ar = models.TextField(default="")
    seo_title_en = models.CharField(max_length=255, blank=True, default="")
    seo_title_ar = models.CharField(max_length=255, blank=True, default="")
    seo_description_en = models.TextField(blank=True, default="")
    seo_description_ar = models.TextField(blank=True, default="")
    is_published = models.BooleanField(default=False, db_index=True)
    region = models.ForeignKey(
        Region,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="cms_pages",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("slug", "region__sort_order", "region__id", "-updated_at", "id")
        constraints = (
            models.UniqueConstraint(
                fields=("slug",),
                condition=models.Q(region__isnull=True),
                name="uniq_cms_page_slug_global",
            ),
            models.UniqueConstraint(
                fields=("slug", "region"),
                condition=models.Q(region__isnull=False),
                name="uniq_cms_page_slug_region",
            ),
        )

    def __str__(self):
        suffix = self.region.code.upper() if self.region_id else "GLOBAL"
        return f"{self.slug} ({suffix})"
