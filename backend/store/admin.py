from django.contrib import admin

from .models import (
    AbandonedCart,
    AdminAuditLog,
    BlogPost,
    BackInStockRequest,
    Category,
    GiftCard,
    GiftCardRedemption,
    HeroPromoCard,
    InstagramPost,
    CustomerAddress,
    NewsletterSubscription,
    NotificationLog,
    WhatsAppLog,
    Order,
    OrderStatusHistory,
    OrderItem,
    Product,
    ProductPrice,
    PushDevice,
    Region,
    ReturnRequest,
    Review,
    ShippingRule,
    SiteSettings,
    TaxRate,
    TaxRule,
    Tag,
    Testimonial,
    Coupon,
    PaymentTransaction,
    PaymobRegionConfig,
    ProductStock,
    WishlistItem,
    Warehouse,
)
from .services.admin_audit import log_admin_action, serialize_for_audit
from .services.carrier_router import get_region_carrier_warnings
from .services.payment_router import get_region_provider_warnings
from .services.shipment import create_order_shipment, refresh_order_tracking

admin.site.site_header = "EnfhantOrganic Admin"
admin.site.site_title = "EnfhantOrganic"
admin.site.index_title = "Store operations"


class ProductPriceInline(admin.TabularInline):
    model = ProductPrice
    extra = 1


def _product_price_snapshot(product):
    rows = (
        ProductPrice.objects.filter(product=product)
        .order_by("region__sort_order", "region_id", "id")
        .values(
            "id",
            "region_id",
            "price",
            "compare_at_price",
            "price_prefix_en",
            "price_prefix_ar",
            "unit_price_text_en",
            "unit_price_text_ar",
        )
    )
    return serialize_for_audit(list(rows))


@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = (
        "name_en",
        "code",
        "currency_code",
        "seller_legal_name",
        "seller_vat_number",
        "default_payment_provider",
        "payment_mode",
        "payment_config_warnings",
        "carrier_enabled",
        "primary_carrier",
        "fallback_carrier",
        "carrier_config_warnings",
        "shipping_threshold",
        "whatsapp_phone",
        "shipping_fee",
        "free_shipping_threshold",
        "require_map_pin",
        "is_active",
        "is_default",
    )
    list_editable = ("is_default", "is_active", "require_map_pin", "carrier_enabled")
    list_filter = ("is_active", "payment_mode", "carrier_enabled")
    prepopulated_fields = {"code": ("name_en",)}
    readonly_fields = ("payment_config_warnings", "carrier_config_warnings")

    @admin.display(description="Payment warnings")
    def payment_config_warnings(self, obj):
        warnings = get_region_provider_warnings(obj)
        return "; ".join(warnings) if warnings else "OK"

    @admin.display(description="Carrier warnings")
    def carrier_config_warnings(self, obj):
        warnings = get_region_carrier_warnings(obj)
        return "; ".join(warnings) if warnings else "OK"


@admin.register(TaxRate)
class TaxRateAdmin(admin.ModelAdmin):
    list_display = (
        "label",
        "region",
        "country_code",
        "rate",
        "is_active",
        "is_inclusive",
        "applies_to_shipping",
        "effective_from",
        "effective_to",
    )
    list_filter = ("is_active", "is_inclusive", "applies_to_shipping", "region")
    search_fields = ("label", "country_code", "region__code", "region__name_en")


@admin.register(TaxRule)
class TaxRuleAdmin(admin.ModelAdmin):
    list_display = ("name_en", "region", "rate", "is_inclusive", "is_active")
    list_filter = ("is_active", "is_inclusive", "region")
    search_fields = ("name_en", "name_ar", "description")
    list_editable = ("is_active",)


@admin.register(ShippingRule)
class ShippingRuleAdmin(admin.ModelAdmin):
    list_display = (
        "region",
        "city",
        "area",
        "min_order_value",
        "max_order_value",
        "shipping_fee",
        "free_shipping_threshold",
        "eta_min_days",
        "eta_max_days",
        "carrier_name",
        "active",
    )
    list_filter = ("region", "active", "city", "area")
    search_fields = ("region__code", "region__name_en", "city", "area", "carrier_name")


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "name_en",
        "region",
        "city",
        "active",
    )
    list_filter = ("active", "region")
    search_fields = ("code", "name_en", "name_ar", "city")


@admin.register(ProductStock)
class ProductStockAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "warehouse",
        "quantity",
        "reserved_quantity",
        "low_stock_threshold",
    )
    list_filter = ("warehouse__region", "warehouse", "warehouse__active")
    search_fields = ("product__slug", "product__name_en", "warehouse__code")


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = ("brand_name",)
    fieldsets = (
        ("Branding", {"fields": ("brand_name", "logo_url", "favicon_url", "tagline_en", "tagline_ar", "primary_color", "accent_color")}),
        ("SEO & Legal", {"fields": ("seo_title_en", "seo_title_ar", "seo_description_en", "seo_description_ar", "og_image_url", "return_policy_en", "return_policy_ar", "privacy_policy_en", "privacy_policy_ar")}),
        ("Navigation", {"fields": ("nav_links", "static_links")}),
        ("Footer & Social", {"fields": ("footer_about_en", "footer_about_ar", "copyright_en", "copyright_ar", "policy_links", "facebook_url", "instagram_url", "twitter_url", "youtube_url", "tiktok_url", "whatsapp_number", "contact_email", "contact_phone", "address_en", "address_ar")}),
        ("Homepage Content", {"fields": ("announcement_en", "announcement_ar", "newsletter_title_en", "newsletter_title_ar", "newsletter_subtitle_en", "newsletter_subtitle_ar", "instagram_title_en", "instagram_title_ar", "instagram_cta_en", "instagram_cta_ar", "blog_title_en", "blog_title_ar", "free_gift_title_en", "free_gift_title_ar", "free_gift_subtitle_en", "free_gift_subtitle_ar", "why_choose_links")}),
        ("Paymob", {"fields": ("paymob_api_key", "paymob_integration_id", "paymob_iframe_id", "paymob_hmac_secret", "paymob_currency", "paymob_apple_pay_integration_id", "paymob_apple_pay_iframe_id"), "classes": ("collapse",)}),
        ("PayTabs", {"fields": ("paytabs_profile_id", "paytabs_server_key", "paytabs_region"), "classes": ("collapse",)}),
        ("HyperPay", {"fields": ("hyperpay_entity_id", "hyperpay_access_token"), "classes": ("collapse",)}),
        ("Inventory", {"fields": ("inventory_low_stock_threshold",)}),
        ("Telr", {"fields": ("telr_store_id", "telr_auth_key"), "classes": ("collapse",)}),
        ("Thawani", {"fields": ("thawani_publishable_key", "thawani_secret_key", "thawani_webhook_secret", "thawani_base_url"), "classes": ("collapse",)}),
        ("OmanNet", {"fields": ("omannet_merchant_id", "omannet_access_code", "omannet_sha_request", "omannet_sha_response", "omannet_webhook_secret"), "classes": ("collapse",)}),
        ("Social Pixels", {"fields": ("facebook_pixel_id", "tiktok_pixel_id", "instagram_access_token", "snapchat_pixel_id", "pinterest_tag_id", "twitter_pixel_id"), "classes": ("collapse",)}),
        ("Marketing Tools", {"fields": ("ga4_measurement_id", "gtm_container_id", "google_ads_conversion_id", "klaviyo_public_key", "mailchimp_api_key", "whatsapp_cloud_phone_id", "zendesk_key"), "classes": ("collapse",)}),
        ("Apps", {"fields": ("expo_push_token", "cloudinary_cloud_name", "cloudinary_api_key", "cloudinary_api_secret", "algolia_app_id", "algolia_api_key", "zapier_webhook_url", "stripe_publishable_key", "stripe_secret_key", "shippo_api_token"), "classes": ("collapse",)}),
    )


@admin.register(PaymobRegionConfig)
class PaymobRegionConfigAdmin(admin.ModelAdmin):
    list_display = ("region_code", "enabled", "integration_id", "iframe_id", "currency")
    list_filter = ("enabled", "region_code")


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

    def save_related(self, request, form, formsets, change):
        before_prices = _product_price_snapshot(form.instance)
        super().save_related(request, form, formsets, change)
        after_prices = _product_price_snapshot(form.instance)
        if before_prices != after_prices:
            log_admin_action(
                request=request,
                actor=request.user,
                action=AdminAuditLog.ACTION_PRODUCT_PRICE_CHANGED,
                resource_type="product",
                resource_id=str(form.instance.pk),
                before_snapshot={"prices": before_prices},
                after_snapshot={"prices": after_prices},
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
        "taxable_amount",
        "tax_rate",
        "tax_total",
        "tax_inclusive",
        "tax_breakdown",
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.action(description="Mark selected orders as confirmed")
def mark_confirmed(modeladmin, request, queryset):
    updated_count = 0
    for order in queryset:
        if order.status == Order.STATUS_CONFIRMED:
            continue
        if order.can_transition_to(Order.STATUS_CONFIRMED):
            order.transition_to(
                Order.STATUS_CONFIRMED,
                actor=request.user,
                note="Status updated from Django admin bulk action.",
            )
            updated_count += 1
    modeladmin.message_user(request, f"Marked {updated_count} order(s) as confirmed.")


@admin.action(description="Mark selected orders as processing")
def mark_processing(modeladmin, request, queryset):
    updated_count = 0
    for order in queryset:
        if order.status != Order.STATUS_PROCESSING and order.can_transition_to(Order.STATUS_PROCESSING):
            order.transition_to(
                Order.STATUS_PROCESSING,
                actor=request.user,
                note="Status updated from Django admin bulk action.",
            )
            updated_count += 1
        try:
            create_order_shipment(order)
        except Exception:
            continue
    modeladmin.message_user(request, f"Marked {updated_count} order(s) as processing.")


@admin.action(description="Mark selected orders as shipped")
def mark_shipped(modeladmin, request, queryset):
    updated_count = 0
    for order in queryset:
        if order.status != Order.STATUS_SHIPPED and order.can_transition_to(Order.STATUS_SHIPPED):
            order.transition_to(
                Order.STATUS_SHIPPED,
                actor=request.user,
                note="Status updated from Django admin bulk action.",
            )
            updated_count += 1
        try:
            create_order_shipment(order)
        except Exception:
            continue
    modeladmin.message_user(request, f"Marked {updated_count} order(s) as shipped.")


@admin.action(description="Mark selected orders as delivered")
def mark_delivered(modeladmin, request, queryset):
    updated_count = 0
    for order in queryset:
        if order.status == Order.STATUS_DELIVERED:
            continue
        if order.can_transition_to(Order.STATUS_DELIVERED):
            order.transition_to(
                Order.STATUS_DELIVERED,
                actor=request.user,
                note="Status updated from Django admin bulk action.",
            )
            updated_count += 1
    modeladmin.message_user(request, f"Marked {updated_count} order(s) as delivered.")


@admin.action(description="Mark selected orders as cancelled")
def mark_cancelled(modeladmin, request, queryset):
    cancelled_count = 0
    for order in queryset:
        if order.status == Order.STATUS_CANCELLED:
            continue
        order.cancel(
            actor=request.user,
            note="Order cancelled from Django admin bulk action.",
        )
        cancelled_count += 1
    modeladmin.message_user(request, f"Cancelled {cancelled_count} order(s).")


@admin.action(description="Mark selected orders as paid")
def mark_paid(modeladmin, request, queryset):
    from .services.invoice import ensure_paid_order_invoice

    for order in queryset:
        if order.payment_status != Order.PAYMENT_PAID:
            order.payment_status = Order.PAYMENT_PAID
            order.save(update_fields=["payment_status", "updated_at"])
        if order.can_transition_to(Order.STATUS_PAID):
            order.transition_to(
                Order.STATUS_PAID,
                actor=request.user,
                note="Payment marked paid from Django admin bulk action.",
            )
        ensure_paid_order_invoice(order)


@admin.action(description="Create shipment for selected orders")
def create_shipments(modeladmin, request, queryset):
    created_count = 0
    for order in queryset:
        try:
            result = create_order_shipment(order)
            if result.get("created"):
                created_count += 1
        except Exception:
            continue
    modeladmin.message_user(request, f"Shipment processing executed for {created_count} order(s).")


@admin.action(description="Refresh tracking for selected orders")
def refresh_tracking(modeladmin, request, queryset):
    refreshed_count = 0
    for order in queryset:
        try:
            refresh_order_tracking(order)
            refreshed_count += 1
        except Exception:
            continue
    modeladmin.message_user(request, f"Tracking refreshed for {refreshed_count} order(s).")


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


class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = (
        "old_status",
        "new_status",
        "actor",
        "note",
        "timestamp",
    )
    can_delete = False

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
        "invoice_status",
        "refund_status",
        "carrier",
        "shipment_status",
        "tracking_number",
        "delivered_at",
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
        "shipping_fee",
        "shipping_method",
        "shipping_carrier_name",
        "shipping_eta_min_days",
        "shipping_eta_max_days",
        "shipping_total",
        "taxable_amount",
        "tax_rate",
        "tax_total",
        "tax_inclusive",
        "tax_applies_to_shipping",
        "tax_label",
        "tax_breakdown",
        "grand_total",
        "currency_code",
        "invoice_number",
        "invoice_date",
        "invoice_pdf",
        "invoice_status",
        "invoice_access_token",
        "shipment_created_at",
        "delivered_at",
        "refund_amount",
        "refund_status",
        "refund_reference",
        "refunded_at",
        "inventory_released",
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
                )
            },
        ),
        (
            "Shipment",
            {
                "fields": (
                    "carrier",
                    "tracking_number",
                    "tracking_url",
                    "shipment_status",
                    "shipment_created_at",
                    "delivered_at",
                )
            },
        ),
        (
            "Invoice",
            {
                "fields": (
                    "invoice_number",
                    "invoice_date",
                    "invoice_status",
                    "invoice_pdf",
                    "invoice_access_token",
                )
            },
        ),
        (
            "Refund",
            {
                "fields": (
                    "refund_amount",
                    "refund_status",
                    "refund_reference",
                    "refunded_at",
                )
            },
        ),
        (
            "Totals",
            {
                "fields": (
                    "subtotal",
                    "discount_total",
                    "shipping_fee",
                    "shipping_method",
                    "shipping_carrier_name",
                    "shipping_eta_min_days",
                    "shipping_eta_max_days",
                    "shipping_total",
                    "taxable_amount",
                    "tax_rate",
                    "tax_total",
                    "tax_inclusive",
                    "tax_applies_to_shipping",
                    "tax_label",
                    "tax_breakdown",
                    "grand_total",
                    "currency_code",
                )
            },
        ),
        (
            "Timeline",
            {
                "fields": (
                    "inventory_released",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )

    inlines = [OrderItemInline, PaymentTransactionInline, OrderStatusHistoryInline]

    actions = [
        mark_confirmed,
        mark_processing,
        mark_shipped,
        mark_delivered,
        mark_cancelled,
        mark_paid,
        create_shipments,
        refresh_tracking,
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
    list_display = ("event", "channel", "recipient", "status", "provider", "order", "created_at")
    list_filter = ("event", "channel", "status", "provider", "created_at")
    search_fields = (
        "title",
        "body",
        "recipient",
        "provider_message_id",
        "error_message",
        "order__order_number",
    )
    readonly_fields = (
        "event",
        "channel",
        "recipient",
        "status",
        "provider",
        "provider_message_id",
        "order",
        "title",
        "body",
        "payload",
        "success",
        "error_message",
        "created_at",
    )


@admin.register(AdminAuditLog)
class AdminAuditLogAdmin(admin.ModelAdmin):
    list_display = (
        "timestamp",
        "actor",
        "action",
        "resource_type",
        "resource_id",
        "ip_address",
    )
    list_filter = ("action", "resource_type", "timestamp")
    search_fields = ("resource_id", "actor__username", "actor__email", "ip_address", "user_agent")
    readonly_fields = (
        "actor",
        "action",
        "resource_type",
        "resource_id",
        "before_snapshot",
        "after_snapshot",
        "ip_address",
        "user_agent",
        "timestamp",
    )


@admin.register(WhatsAppLog)
class WhatsAppLogAdmin(admin.ModelAdmin):
    list_display = (
        "event",
        "recipient",
        "status",
        "template_name",
        "provider",
        "provider_message_id",
        "order",
        "created_at",
    )
    list_filter = ("event", "status", "provider", "locale", "created_at")
    search_fields = (
        "recipient",
        "template_name",
        "provider_message_id",
        "error_message",
        "order__order_number",
    )
    readonly_fields = (
        "order",
        "event",
        "recipient",
        "locale",
        "template_name",
        "provider",
        "provider_message_id",
        "status",
        "request_payload",
        "response_payload",
        "webhook_payload",
        "error_message",
        "created_at",
        "updated_at",
    )


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


@admin.register(ReturnRequest)
class ReturnRequestAdmin(admin.ModelAdmin):
    list_display = (
        "order",
        "customer_name",
        "customer_email",
        "status",
        "requested_at",
        "reviewed_by",
    )
    list_filter = ("status", "requested_at")
    search_fields = ("order__order_number", "customer_name", "customer_email", "reason", "admin_note")


@admin.register(GiftCard)
class GiftCardAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "initial_balance",
        "remaining_balance",
        "currency_code",
        "status",
        "recipient_email",
        "expiry_date",
        "created_at",
    )
    list_filter = ("status", "currency_code", "created_at")
    search_fields = ("code", "recipient_name", "recipient_email", "sender_name")
    readonly_fields = ("code", "created_at", "updated_at")


@admin.register(GiftCardRedemption)
class GiftCardRedemptionAdmin(admin.ModelAdmin):
    list_display = (
        "order",
        "gift_card",
        "requested_amount",
        "applied_amount",
        "status",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("order__order_number", "gift_card__code", "order__customer_email")


@admin.register(BackInStockRequest)
class BackInStockRequestAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "region",
        "email",
        "phone",
        "status",
        "created_at",
        "notified_at",
    )
    list_filter = ("status", "region", "created_at")
    search_fields = ("product__slug", "product__name_en", "email", "phone")


@admin.register(AbandonedCart)
class AbandonedCartAdmin(admin.ModelAdmin):
    list_display = (
        "customer_email",
        "customer_phone",
        "subtotal",
        "currency_code",
        "status",
        "recovery_sent_count",
        "abandoned_at",
        "recovered_at",
    )
    list_filter = ("status", "currency_code", "abandoned_at")
    search_fields = ("customer_email", "customer_name", "customer_phone", "session_token")
    readonly_fields = ("session_token", "abandoned_at", "updated_at")
