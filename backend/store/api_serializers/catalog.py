from django.conf import settings
from rest_framework import serializers

from ..models import (
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


class RegionSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()
    payment_provider_options = serializers.SerializerMethodField()
    payment_provider_warnings = serializers.SerializerMethodField()
    carrier_options = serializers.SerializerMethodField()
    carrier_warnings = serializers.SerializerMethodField()

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


class HeroPromoCardSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    subtitle = serializers.SerializerMethodField()
    cta = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = HeroPromoCard
        fields = ("title", "subtitle", "cta", "href", "image", "size", "accent")

    def get_image(self, obj):
        request = self.context.get("request")
        return get_image_url(obj, request, "image_file", "image")

    def get_title(self, obj):
        return localized(obj, "title", self.context.get("locale"))

    def get_subtitle(self, obj):
        return localized(obj, "subtitle", self.context.get("locale"))

    def get_cta(self, obj):
        return localized(obj, "cta", self.context.get("locale"))


class CategorySerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ("slug", "name", "description", "image")

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
    tags = serializers.SerializerMethodField()
    pricing = serializers.SerializerMethodField()
    option_groups = serializers.SerializerMethodField()
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
            "tags",
            "pricing",
            "option_groups",
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

    def get_category(self, obj):
        return CategorySerializer(obj.category, context=self.context).data

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
        return localized_json(obj, "option_groups", self.context.get("locale"))

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
        reviews = Review.objects.filter(product=obj, is_approved=True)[:10]
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
