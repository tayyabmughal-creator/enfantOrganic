from rest_framework import serializers

from ..models import (
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


class RegionSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()

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
            "is_active",
            "contact_phone",
            "address",
            "is_default",
        )

    def get_name(self, obj):
        return localized(obj, "name", self.context.get("locale"))

    def get_address(self, obj):
        return localized(obj, "address", self.context.get("locale"))


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
        return prices[0] if prices else None

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


class ProductDetailSerializer(ProductCardSerializer):
    description = serializers.SerializerMethodField()
    ingredients = serializers.SerializerMethodField()
    usage_instructions = serializers.SerializerMethodField()
    origin_source = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()
    reviews = serializers.SerializerMethodField()
    customer_reviews = serializers.SerializerMethodField()
    certification_file = serializers.SerializerMethodField()
    gallery = serializers.ReadOnlyField()

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

    def get_certification_file(self, obj):
        request = self.context.get("request")
        if not obj.organic_certification_file:
            return ""
        url = obj.organic_certification_file.url
        return request.build_absolute_uri(url) if request else url


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
