from django.contrib import admin

from .models import (
    BlogPost,
    Category,
    HeroPromoCard,
    InstagramPost,
    CustomerAddress,
    NewsletterSubscription,
    NotificationLog,
    Order,
    OrderItem,
    Product,
    ProductPrice,
    PushDevice,
    Region,
    Review,
    SiteSettings,
    Tag,
    Testimonial,
    Coupon,
    PaymentTransaction,
    WishlistItem,
)

admin.site.site_header = "EnfhantOrganic Admin"
admin.site.site_title = "EnfhantOrganic"
admin.site.index_title = "Store operations"


class ProductPriceInline(admin.TabularInline):
    model = ProductPrice
    extra = 1


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = (
        "name_en",
        "code",
        "currency_code",
        "shipping_threshold",
        "whatsapp_phone",
        "shipping_fee",
        "free_shipping_threshold",
        "is_active",
        "is_default",
    )
    list_editable = ("is_default", "is_active")
    list_filter = ("is_active",)
    prepopulated_fields = {"code": ("name_en",)}


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = ("brand_name",)


@admin.register(HeroPromoCard)
class HeroPromoCardAdmin(admin.ModelAdmin):
    list_display = ("title_en", "size", "accent", "sort_order")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name_en", "slug", "sort_order")
    prepopulated_fields = {"slug": ("name_en",)}


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name_en", "slug", "sort_order")
    prepopulated_fields = {"slug": ("name_en",)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name_en",
        "slug",
        "brand",
        "unit",
        "category",
        "stock_quantity",
        "track_inventory",
        "is_featured",
        "show_in_new_arrivals",
        "show_in_baby_sets",
        "show_in_top_choices",
        "is_published",
    )
    list_filter = (
        "category",
        "brand",
        "track_inventory",
        "is_featured",
        "show_in_new_arrivals",
        "show_in_baby_sets",
        "show_in_top_choices",
        "is_published",
    )
    prepopulated_fields = {"slug": ("name_en",)}
    search_fields = ("name_en", "name_ar", "brand", "short_description_en")
    filter_horizontal = ("tags",)
    inlines = [ProductPriceInline]
    fieldsets = (
        (
            "Core",
            {
                "fields": (
                    "slug",
                    "name_en",
                    "name_ar",
                    "brand",
                    "unit",
                    "vendor_en",
                    "vendor_ar",
                    "category",
                    "tags",
                )
            },
        ),
        (
            "Content",
            {
                "fields": (
                    "short_description_en",
                    "short_description_ar",
                    "description_en",
                    "description_ar",
                    "details_en",
                    "details_ar",
                    "option_groups_en",
                    "option_groups_ar",
                )
            },
        ),
        (
            "Organic Product Details",
            {
                "fields": (
                    "ingredients_en",
                    "ingredients_ar",
                    "usage_instructions_en",
                    "usage_instructions_ar",
                    "origin_source_en",
                    "origin_source_ar",
                    "organic_certification_name",
                    "organic_certification_file",
                    "dietary_tags",
                    "shelf_life",
                    "expiry_date",
                )
            },
        ),
        (
            "Media",
            {
                "fields": (
                    "image",
                    "image_file",
                    "hover_image",
                    "hover_image_file",
                    "gallery",
                )
            },
        ),
        (
            "Merchandising",
            {
                "fields": (
                    "badge_en",
                    "badge_ar",
                    "review_count",
                    "rating",
                    "is_featured",
                    "show_in_new_arrivals",
                    "show_in_baby_sets",
                    "show_in_top_choices",
                    "is_published",
                )
            },
        ),
        (
            "Inventory",
            {
                "fields": (
                    "stock_quantity",
                    "track_inventory",
                )
            },
        ),
    )


@admin.register(Testimonial)
class TestimonialAdmin(admin.ModelAdmin):
    list_display = ("name", "location_en", "rating", "sort_order")


@admin.register(InstagramPost)
class InstagramPostAdmin(admin.ModelAdmin):
    list_display = ("href", "sort_order")


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = ("title_en", "published_at", "sort_order")
    prepopulated_fields = {"slug": ("title_en",)}


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = (
        "product",
        "product_slug",
        "product_name",
        "selected_options_text",
        "quantity",
        "unit_price",
        "line_total",
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.action(description="Mark selected orders as confirmed")
def mark_confirmed(modeladmin, request, queryset):
    queryset.update(status=Order.STATUS_CONFIRMED)


@admin.action(description="Mark selected orders as preparing")
def mark_preparing(modeladmin, request, queryset):
    queryset.update(status=Order.STATUS_PREPARING)


@admin.action(description="Mark selected orders as out for delivery")
def mark_out_for_delivery(modeladmin, request, queryset):
    queryset.update(status=Order.STATUS_OUT_FOR_DELIVERY)


@admin.action(description="Mark selected orders as delivered")
def mark_delivered(modeladmin, request, queryset):
    queryset.update(status=Order.STATUS_DELIVERED)


@admin.action(description="Mark selected orders as cancelled")
def mark_cancelled(modeladmin, request, queryset):
    queryset.update(status=Order.STATUS_CANCELLED)


@admin.action(description="Mark selected orders as paid")
def mark_paid(modeladmin, request, queryset):
    queryset.update(payment_status=Order.PAYMENT_PAID)


class PaymentTransactionInline(admin.TabularInline):
    model = PaymentTransaction
    extra = 0
    readonly_fields = (
        "provider",
        "provider_reference",
        "amount",
        "currency_code",
        "status",
        "raw_response",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "customer_name",
        "customer_phone",
        "region",
        "grand_total",
        "currency_code",
        "status",
        "payment_method",
        "payment_status",
        "tracking_number",
        "created_at",
    )

    list_filter = (
        "status",
        "payment_status",
        "payment_method",
        "region",
        "created_at",
    )

    search_fields = (
        "order_number",
        "customer_name",
        "customer_phone",
        "customer_email",
        "city",
    )

    readonly_fields = (
        "order_number",
        "subtotal",
        "discount_total",
        "shipping_total",
        "grand_total",
        "currency_code",
        "coupon_code",
        "created_at",
        "updated_at",
        "customer_snapshot",
        "address_snapshot",
    )

    list_editable = (
        "status",
        "payment_status",
    )

    fieldsets = (
        (
            "Order Info",
            {
                "fields": (
                    "order_number",
                    "region",
                    "locale",
                    "status",
                    "notes",
                )
            },
        ),
        (
            "Customer Details",
            {
                "fields": (
                    "customer_name",
                    "customer_email",
                    "customer_phone",
                )
            },
        ),
        (
            "Address",
            {
                "fields": (
                    "address_line_1",
                    "address_line_2",
                    "city",
                    "country",
                )
            },
        ),
        (
            "Payment",
            {
                "fields": (
                    "payment_method",
                    "payment_status",
                    "tracking_number",
                    "tracking_url",
                )
            },
        ),
        (
            "Totals",
            {
                "fields": (
                    "subtotal",
                    "discount_total",
                    "shipping_total",
                    "grand_total",
                    "currency_code",
                )
            },
        ),
        (
            "Timeline",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )

    inlines = [OrderItemInline, PaymentTransactionInline]

    actions = [
        mark_confirmed,
        mark_preparing,
        mark_out_for_delivery,
        mark_delivered,
        mark_cancelled,
        mark_paid,
    ]


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "discount_type",
        "value",
        "is_active",
        "minimum_subtotal",
        "max_uses",
        "used_count",
        "starts_at",
        "ends_at",
    )
    list_filter = (
        "discount_type",
        "is_active",
        "regions",
        "starts_at",
        "ends_at",
    )
    search_fields = ("code", "description")
    filter_horizontal = ("regions", "products", "categories")


@admin.register(CustomerAddress)
class CustomerAddressAdmin(admin.ModelAdmin):
    list_display = ("full_name", "phone", "city", "country", "is_default", "updated_at")
    list_filter = ("country", "city", "is_default")
    search_fields = ("full_name", "phone", "address_line_1", "city")


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "customer_name",
        "rating",
        "is_verified_purchase",
        "is_approved",
        "created_at",
    )
    list_filter = ("is_approved", "is_verified_purchase", "rating", "created_at")
    search_fields = ("product__name_en", "customer_name", "title", "comment")
    list_editable = ("is_approved",)


@admin.register(PushDevice)
class PushDeviceAdmin(admin.ModelAdmin):
    list_display = ("platform", "user", "is_active", "updated_at")
    list_filter = ("platform", "is_active")
    search_fields = ("token", "user__username", "user__email")


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ("event", "title", "success", "created_at")
    list_filter = ("event", "success", "created_at")
    search_fields = ("title", "body", "error_message")
    readonly_fields = ("event", "title", "body", "payload", "success", "error_message", "created_at")


@admin.register(WishlistItem)
class WishlistItemAdmin(admin.ModelAdmin):
    list_display = ("user", "product", "created_at")
    search_fields = ("user__username", "user__email", "product__name_en")


@admin.register(NewsletterSubscription)
class NewsletterSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("email", "region", "locale", "is_active", "created_at")
    list_filter = ("is_active", "region", "locale")
    search_fields = ("email",)


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "order",
        "provider",
        "amount",
        "currency_code",
        "status",
        "created_at",
    )
    list_filter = (
        "provider",
        "status",
        "currency_code",
        "created_at",
    )
    search_fields = (
        "order__order_number",
        "provider_reference",
    )
