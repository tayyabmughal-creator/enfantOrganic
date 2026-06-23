from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from rest_framework import serializers

from ..models import (
    CartMilestone,
    CmsPage,
    BlogPost,
    Category,
    HeroPromoCard,
    InstagramPost,
    Product,
    Region,
    Review,
    Tag,
    Testimonial,
)
from .localization import get_image_url, localized, localized_json
from ..services.payment_router import get_region_provider_options, get_region_provider_warnings
from ..services.carrier_router import get_region_carrier_options, get_region_carrier_warnings
from ..services.stock import get_region_available_stock, get_region_warehouses

MONEY_QUANTIZER = Decimal("0.01")


def _money(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value)).quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)
    except Exception:
        return None


def _converted_money(value, region):
    amount = _money(value)
    if amount is None:
        return None
    fx_rate = Decimal(str(getattr(region, "fx_rate", 1) or 1))
    return (amount * fx_rate).quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)


def _variant_options(raw):
    options = raw.get("options")
    if isinstance(options, dict):
        return {
            str(key).strip(): str(value).strip()
            for key, value in options.items()
            if str(key).strip() and str(value).strip()
        }
    return {}


def active_product_variants(product, locale="en", region=None):
    rows = product.variants if isinstance(getattr(product, "variants", None), list) else []
    variants = []
    for index, raw in enumerate(rows):
        if not isinstance(raw, dict) or raw.get("is_active") is False:
            continue

        options = _variant_options(raw)
        variant_id = str(raw.get("id") or raw.get("sku") or f"variant-{index + 1}").strip()
        if not variant_id:
            variant_id = f"variant-{index + 1}"

        title = str(
            (raw.get("title_ar") if locale == "ar" else raw.get("title_en"))
            or raw.get("title_en")
            or raw.get("title_ar")
            or " / ".join(options.values())
            or variant_id
        ).strip()

        nested = raw.get("pricing") or {}
        base_price = _money(raw.get("price") or raw.get("base_price") or nested.get("amount"))
        price = _converted_money(base_price, region) if region else base_price
        compare = _converted_money(
            raw.get("compare_at_price") or raw.get("base_compare_at_price") or nested.get("compare_amount"),
            region,
        ) if region else _money(raw.get("compare_at_price") or raw.get("base_compare_at_price") or nested.get("compare_amount"))
        stock_raw = raw.get("stock_quantity")
        stock_quantity = None
        if stock_raw not in (None, ""):
            try:
                stock_quantity = max(int(stock_raw), 0)
            except (TypeError, ValueError):
                stock_quantity = None

        variants.append({
            "id": variant_id,
            "sku": str(raw.get("sku") or "").strip(),
            "title": title,
            "title_en": str(raw.get("title_en") or "").strip(),
            "title_ar": str(raw.get("title_ar") or "").strip(),
            "options": options,
            "image": str(raw.get("image") or "").strip(),
            "pricing": {
                "amount": float(price) if price is not None else None,
                "compare_amount": float(compare) if compare is not None else None,
                "currency_code": getattr(region, "currency_code", "") if region else "",
                "region_code": getattr(region, "code", "") if region else "",
                "prefix": "",
                "unit_price_text": str(raw.get("unit_price_text") or "").strip(),
            },
            "stock_quantity": stock_quantity,
            "is_available": stock_quantity is None or stock_quantity > 0,
        })
    return variants


def option_groups_from_variants(variants):
    grouped = {}
    order = []
    for variant in variants:
        for name, value in (variant.get("options") or {}).items():
            if name not in grouped:
                grouped[name] = []
                order.append(name)
            if value and value not in grouped[name]:
                grouped[name].append(value)
    # Only include groups with >1 unique value; single-value groups aren't real choices
    return [{"name": name, "values": grouped[name]} for name in order if len(grouped[name]) > 1]


class CartMilestoneSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()

    class Meta:
        model = CartMilestone
        fields = ("threshold", "reward_type", "discount_value", "label")

    def get_label(self, obj):
        locale = self.context.get("locale", "en")
        if locale == "ar" and obj.label_ar:
            return obj.label_ar
        return obj.label_en or obj.get_reward_type_display()


class RegionSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()
    payment_provider_options = serializers.SerializerMethodField()
    payment_provider_warnings = serializers.SerializerMethodField()
    carrier_options = serializers.SerializerMethodField()
    carrier_warnings = serializers.SerializerMethodField()
    cart_milestones = serializers.SerializerMethodField()

    class Meta:
        model = Region
        fields = (
            "code",
            "name",
            "currency_code",
            "locale_code",
            "shipping_threshold",
            "whatsapp_phone",
            "contact_email",
            "shipping_fee",
            "free_shipping_threshold",
            "require_map_pin",
            "payment_enabled_providers",
            "default_payment_provider",
            "payment_supported_methods",
            "payment_mode",
            "payment_provider_options",
            "payment_provider_warnings",
            "carrier_enabled",
            "primary_carrier",
            "fallback_carrier",
            "carrier_options",
            "carrier_warnings",
            "is_active",
            "contact_phone",
            "address",
            "is_default",
            "cart_milestones",
        )

    def get_name(self, obj):
        return localized(obj, "name", self.context.get("locale"))

    def get_address(self, obj):
        return localized(obj, "address", self.context.get("locale"))

    def get_payment_provider_options(self, obj):
        return get_region_provider_options(obj)

    def get_payment_provider_warnings(self, obj):
        return get_region_provider_warnings(obj)

    def get_carrier_options(self, obj):
        return get_region_carrier_options(obj)

    def get_carrier_warnings(self, obj):
        return get_region_carrier_warnings(obj)

    def get_cart_milestones(self, obj):
        milestones = list(obj.cart_milestones.filter(is_active=True).order_by("sort_order", "threshold"))

        if milestones:
            return CartMilestoneSerializer(milestones, many=True, context=self.context).data

        # No milestones set for this region — auto-convert from the default (base) region.
        base_region = Region.objects.filter(is_default=True).exclude(id=obj.id).first()
        if not base_region:
            return []

        base_milestones = list(
            base_region.cart_milestones.filter(is_active=True).order_by("sort_order", "threshold")
        )
        if not base_milestones:
            return []

        base_fx = Decimal(str(base_region.fx_rate or 1))
        this_fx = Decimal(str(obj.fx_rate or 1))
        locale = self.context.get("locale", "en")

        result = []
        for m in base_milestones:
            # Convert: (base_threshold / base_fx) * this_fx
            converted = (Decimal(str(m.threshold)) / base_fx * this_fx).quantize(
                Decimal("0.001"), rounding=ROUND_HALF_UP
            )
            label = (m.label_ar if locale == "ar" and m.label_ar else None) or m.label_en or m.get_reward_type_display()
            result.append({
                "threshold": str(converted),
                "reward_type": m.reward_type,
                "discount_value": str(m.discount_value),
                "label": label,
            })
        return result


class HeroPromoCardSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    eyebrow = serializers.SerializerMethodField()
    subtitle = serializers.SerializerMethodField()
    cta = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    image_mobile = serializers.SerializerMethodField()

    class Meta:
        model = HeroPromoCard
        fields = ("title", "eyebrow", "subtitle", "cta", "href", "image", "image_mobile", "size", "accent")

    def get_image(self, obj):
        request = self.context.get("request")
        return get_image_url(obj, request, "image_file", "image")

    def get_image_mobile(self, obj):
        # Empty when no mobile artwork is set — frontend then reuses the desktop image.
        request = self.context.get("request")
        return get_image_url(obj, request, "image_file_mobile", "image_mobile")

    def get_title(self, obj):
        return localized(obj, "title", self.context.get("locale"))

    def get_eyebrow(self, obj):
        # Empty when no custom eyebrow is set — frontend then uses the accent preset.
        return localized(obj, "eyebrow", self.context.get("locale"))

    def get_subtitle(self, obj):
        return localized(obj, "subtitle", self.context.get("locale"))

    def get_cta(self, obj):
        return localized(obj, "cta", self.context.get("locale"))


class CategorySerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ("slug", "name", "description", "image", "product_count")

    def get_product_count(self, obj):
        # Populated only when the queryset is annotated (e.g. the nav menu);
        # elsewhere it stays None and the frontend simply ignores it.
        return getattr(obj, "product_count", None)

    def get_image(self, obj):
        request = self.context.get("request")
        return get_image_url(obj, request, "image_file", "image")

    def get_name(self, obj):
        return localized(obj, "name", self.context.get("locale"))

    def get_description(self, obj):
        return localized(obj, "description", self.context.get("locale"))


class TagSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = Tag
        fields = ("slug", "name")

    def get_name(self, obj):
        return localized(obj, "name", self.context.get("locale"))


class ProductCardSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    vendor = serializers.SerializerMethodField()
    short_description = serializers.SerializerMethodField()
    badge = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    categories = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    pricing = serializers.SerializerMethodField()
    option_groups = serializers.SerializerMethodField()
    has_variants = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    hover_image = serializers.SerializerMethodField()
    stock_status = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "slug",
            "name",
            "brand",
            "unit",
            "vendor",
            "short_description",
            "badge",
            "review_count",
            "rating",
            "image",
            "hover_image",
            "category",
            "categories",
            "tags",
            "pricing",
            "option_groups",
            "has_variants",
            "variants",
            "stock_status",
        )

    def get_image(self, obj):
        request = self.context.get("request")
        return get_image_url(obj, request, "image_file", "image")

    def get_hover_image(self, obj):
        request = self.context.get("request")
        return get_image_url(obj, request, "hover_image_file", "hover_image")

    def _find_price(self, obj):
        region = self.context["region"]
        prices = list(getattr(obj, "_prefetched_objects_cache", {}).get("prices", obj.prices.all()))
        for price in prices:
            if price.region_id == region.id:
                return price
        return None

    def get_name(self, obj):
        return localized(obj, "name", self.context.get("locale"))

    def get_vendor(self, obj):
        return localized(obj, "vendor", self.context.get("locale"))

    def get_short_description(self, obj):
        return localized(obj, "short_description", self.context.get("locale"))

    def get_badge(self, obj):
        value = localized(obj, "badge", self.context.get("locale"))
        return value or None

    def _all_categories(self, obj):
        return list(obj.categories.all())

    def get_category(self, obj):
        cats = self._all_categories(obj)
        return CategorySerializer(cats[0], context=self.context).data if cats else None

    def get_categories(self, obj):
        return CategorySerializer(self._all_categories(obj), many=True, context=self.context).data

    def get_tags(self, obj):
        return TagSerializer(obj.tags.all(), many=True, context=self.context).data

    def get_pricing(self, obj):
        locale = self.context.get("locale")
        price = self._find_price(obj)

        if not price:
            return None

        return {
            "amount": float(price.price),
            "compare_amount": float(price.compare_at_price) if price.compare_at_price is not None else None,
            "currency_code": price.region.currency_code,
            "region_code": price.region.code,
            "prefix": localized(price, "price_prefix", locale) if hasattr(price, "price_prefix_en") else "",
            "unit_price_text": localized(price, "unit_price_text", locale) if hasattr(price, "unit_price_text_en") else "",
        }

    def get_option_groups(self, obj):
        variants = active_product_variants(obj, self.context.get("locale"), self.context.get("region"))
        if variants:
            return option_groups_from_variants(variants)
        return localized_json(obj, "option_groups", self.context.get("locale"))

    def get_has_variants(self, obj):
        return bool(active_product_variants(obj, self.context.get("locale"), self.context.get("region")))

    def get_variants(self, obj):
        return active_product_variants(obj, self.context.get("locale"), self.context.get("region"))

    def _get_region_stocks(self, obj):
        region = self.context.get("region")
        if not region or not obj.track_inventory:
            return []
        warehouses = set(get_region_warehouses(region).values_list("id", flat=True))
        if not warehouses:
            return []
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("warehouse_stocks")
        if prefetched is not None:
            return [stock for stock in prefetched if stock.warehouse_id in warehouses and stock.warehouse.active]
        return list(
            obj.warehouse_stocks.select_related("warehouse").filter(
                warehouse_id__in=warehouses,
                warehouse__active=True,
            )
        )

    def get_stock_status(self, obj):
        variants = active_product_variants(obj, self.context.get("locale"), self.context.get("region"))
        if variants:
            available = [variant for variant in variants if variant.get("is_available")]
            quantities = [
                int(variant["stock_quantity"])
                for variant in variants
                if variant.get("stock_quantity") is not None
            ]
            return {
                "track_inventory": bool(quantities) or obj.track_inventory,
                "is_in_stock": bool(available),
                "available_quantity": sum(quantities) if quantities else None,
                "is_low_stock": bool(quantities) and sum(quantities) <= 10,
            }
        if not obj.track_inventory:
            return {
                "track_inventory": False,
                "is_in_stock": True,
                "available_quantity": None,
                "is_low_stock": False,
            }

        region = self.context.get("region")
        available_qty = get_region_available_stock(obj, region)
        region_stocks = self._get_region_stocks(obj)
        threshold = min([int(stock.low_stock_threshold or 0) for stock in region_stocks], default=10)
        return {
            "track_inventory": True,
            "is_in_stock": int(available_qty or 0) > 0,
            "available_quantity": int(available_qty or 0),
            "is_low_stock": int(available_qty or 0) <= int(threshold),
        }


class ProductDetailSerializer(ProductCardSerializer):
    description = serializers.SerializerMethodField()
    ingredients = serializers.SerializerMethodField()
    usage_instructions = serializers.SerializerMethodField()
    origin_source = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()
    reviews = serializers.SerializerMethodField()
    customer_reviews = serializers.SerializerMethodField()
    certification_file = serializers.SerializerMethodField()
    gallery = serializers.SerializerMethodField()
    stock_quantity = serializers.SerializerMethodField()
    seo_title = serializers.SerializerMethodField()
    seo_description = serializers.SerializerMethodField()

    class Meta(ProductCardSerializer.Meta):
        fields = ProductCardSerializer.Meta.fields + (
            "description",
            "ingredients",
            "usage_instructions",
            "origin_source",
            "organic_certification_name",
            "certification_file",
            "dietary_tags",
            "shelf_life",
            "expiry_date",
            "stock_quantity",
            "track_inventory",
            "is_featured",
            "details",
            "reviews",
            "customer_reviews",
            "gallery",
            "seo_title",
            "seo_description",
            "shopify_meta",
        )

    def get_description(self, obj):
        return localized(obj, "description", self.context.get("locale"))

    def get_ingredients(self, obj):
        return localized(obj, "ingredients", self.context.get("locale"))

    def get_usage_instructions(self, obj):
        return localized(obj, "usage_instructions", self.context.get("locale"))

    def get_origin_source(self, obj):
        return localized(obj, "origin_source", self.context.get("locale"))

    def get_details(self, obj):
        return localized_json(obj, "details", self.context.get("locale"))

    def get_reviews(self, obj):
        return localized_json(obj, "reviews", self.context.get("locale"))

    def get_customer_reviews(self, obj):
        reviews = Review.objects.filter(product=obj, is_approved=True).order_by("-created_at")
        return [
            {
                "customer_name": review.customer_name,
                "rating": review.rating,
                "title": review.title,
                "comment": review.comment,
                "is_verified_purchase": review.is_verified_purchase,
                "created_at": review.created_at,
            }
            for review in reviews
        ]

    def get_gallery(self, obj):
        request = self.context.get("request")
        urls = []

        for img in obj.gallery_images.all():
            if img.image_file:
                url = img.image_file.url
                media_host = getattr(settings, "MEDIA_HOST_URL", "").rstrip("/")
                urls.append(f"{media_host}{url}" if media_host else (request.build_absolute_uri(url) if request else url))
            elif img.image_url:
                urls.append(img.image_url)

        for entry in obj.gallery or []:
            value = str(entry or "").strip()
            if not value:
                continue
            if value.startswith("http://") or value.startswith("https://"):
                urls.append(value)
                continue
            if not value.startswith("/"):
                value = f"{settings.MEDIA_URL.rstrip('/')}/{value.lstrip('/')}"
            media_host = getattr(settings, "MEDIA_HOST_URL", "").rstrip("/")
            if media_host:
                urls.append(f"{media_host}{value}")
            else:
                urls.append(request.build_absolute_uri(value) if request else value)
        return urls

    def get_seo_title(self, obj):
        return localized(obj, "seo_title", self.context.get("locale"))

    def get_seo_description(self, obj):
        return localized(obj, "seo_description", self.context.get("locale"))

    def get_certification_file(self, obj):
        request = self.context.get("request")
        if not obj.organic_certification_file:
            return ""
        url = obj.organic_certification_file.url
        return request.build_absolute_uri(url) if request else url

    def get_stock_quantity(self, obj):
        if not obj.track_inventory:
            return obj.stock_quantity
        return int(get_region_available_stock(obj, self.context.get("region")) or 0)


class TestimonialSerializer(serializers.ModelSerializer):
    location = serializers.SerializerMethodField()
    quote = serializers.SerializerMethodField()

    class Meta:
        model = Testimonial
        fields = ("name", "location", "quote", "rating")

    def get_location(self, obj):
        return localized(obj, "location", self.context.get("locale"))

    def get_quote(self, obj):
        return localized(obj, "quote", self.context.get("locale"))


class InstagramPostSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = InstagramPost
        fields = ("image", "href")

    def get_image(self, obj):
        request = self.context.get("request")
        return get_image_url(obj, request, "image_file", "image")


class BlogPostSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    excerpt = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "image", "published_at")

    def get_image(self, obj):
        request = self.context.get("request")
        return get_image_url(obj, request, "image_file", "image")

    def get_title(self, obj):
        return localized(obj, "title", self.context.get("locale"))

    def get_excerpt(self, obj):
        return localized(obj, "excerpt", self.context.get("locale"))


class BlogPostDetailSerializer(BlogPostSerializer):
    body = serializers.SerializerMethodField()

    class Meta(BlogPostSerializer.Meta):
        fields = BlogPostSerializer.Meta.fields + ("body",)

    def get_body(self, obj):
        return localized(obj, "body", self.context.get("locale"))


class CmsPageSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    body = serializers.SerializerMethodField()
    seo_title = serializers.SerializerMethodField()
    seo_description = serializers.SerializerMethodField()
    region_code = serializers.SerializerMethodField()

    class Meta:
        model = CmsPage
        fields = (
            "slug",
            "title",
            "body",
            "seo_title",
            "seo_description",
            "is_published",
            "region_code",
        )

    def get_title(self, obj):
        return localized(obj, "title", self.context.get("locale"))

    def get_body(self, obj):
        return localized(obj, "body", self.context.get("locale"))

    def get_seo_title(self, obj):
        return localized(obj, "seo_title", self.context.get("locale"))

    def get_seo_description(self, obj):
        return localized(obj, "seo_description", self.context.get("locale"))

    def get_region_code(self, obj):
        return obj.region.code if obj.region_id else ""
