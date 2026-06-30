import logging
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db.models import Max, Min
from django.urls import reverse
from rest_framework import serializers

from ..models import (
    BackInStockRequest,
    AbandonedCart,
    AdminAuditLog,
    AnalyticsEvent,
    BlogPost,
    CartMilestone,
    CmsPage,
    Category,
    Coupon,
    GiftCard,
    HeroPromoCard,
    InstagramPost,
    Order,
    OrderItem,
    PaymentTransaction,
    PaymobRegionConfig,
    NotificationLog,
    Product,
    ProductPrice,
    ProductStock,
    Region,
    ReturnRequest,
    Review,
    ShippingRule,
    SiteSettings,
    TaxRate,
    Warehouse,
)
from ..services.payment_router import get_region_provider_options, get_region_provider_warnings
from ..services.carrier_router import get_region_carrier_options, get_region_carrier_warnings
from ..services.payment_config import (
    get_hyperpay_config,
    get_omannet_config,
    get_paymob_config,
    get_paytabs_config,
    get_telr_config,
    get_thawani_config,
    paymob_config_is_complete,
)
from .orders import (
    OrderStatusHistorySerializer,
    PaymentTransactionSerializer,
    ReturnRequestSerializer,
)
from .localization import get_image_url


logger = logging.getLogger(__name__)


class AdminProductPriceSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True)

    class Meta:
        model = ProductPrice
        fields = ("id", "region", "region_code", "price", "compare_at_price", "unit_price_text_en", "unit_price_text_ar")


class AdminProductSerializer(serializers.ModelSerializer):
    prices = AdminProductPriceSerializer(many=True, read_only=True)
    # Editable base-region (default region, e.g. Oman/OMR) price. Saved into the
    # default region's ProductPrice row; other regions are derived from it via the
    # "Apply conversion rates" action (base_price × Region.fx_rate).
    base_price = serializers.DecimalField(
        max_digits=8, decimal_places=2, required=False, allow_null=True, write_only=True
    )
    base_compare_at_price = serializers.DecimalField(
        max_digits=8, decimal_places=2, required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = Product
        fields = "__all__"
        extra_kwargs = {
            "image_file": {"required": False},
            "hover_image_file": {"required": False},
        }

    @staticmethod
    def _base_region():
        # Single source of truth shared with pricing.convert_product_prices /
        # apply_fx_conversion so the admin form and conversion never disagree.
        from ..services.pricing import get_base_region
        return get_base_region()

    def _upsert_base_price(self, product, price, compare_at):
        if price in (None, ""):
            return
        region = self._base_region()
        if region is None:
            return
        defaults = {"price": price}
        if compare_at not in (None, ""):
            defaults["compare_at_price"] = compare_at
        ProductPrice.objects.update_or_create(product=product, region=region, defaults=defaults)
        # Immediately derive the other regions' prices (AED/SAR) from this base.
        try:
            from ..services.pricing import convert_product_prices
            convert_product_prices(product)
        except Exception:
            logger.exception("Regional price conversion failed for product %s", product.pk)

    def validate_cost_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Cost price cannot be negative.")
        return value

    def validate_variants(self, value):
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Variants must be a list.")
        for index, variant in enumerate(value, start=1):
            if not isinstance(variant, dict):
                raise serializers.ValidationError(f"Variant {index} must be an object.")
            raw_cost = variant.get("cost_price")
            if raw_cost in (None, ""):
                continue
            try:
                if Decimal(str(raw_cost)) < 0:
                    raise serializers.ValidationError(f"Variant {index} unit cost cannot be negative.")
            except (InvalidOperation, TypeError, ValueError):
                raise serializers.ValidationError(f"Variant {index} unit cost must be a valid number.")
        return value

    def create(self, validated_data):
        base_price = validated_data.pop("base_price", None)
        base_compare_at = validated_data.pop("base_compare_at_price", None)
        product = super().create(validated_data)
        self._upsert_base_price(product, base_price, base_compare_at)
        return product

    def update(self, instance, validated_data):
        base_price = validated_data.pop("base_price", serializers.empty)
        base_compare_at = validated_data.pop("base_compare_at_price", serializers.empty)
        product = super().update(instance, validated_data)
        if base_price is not serializers.empty:
            cmp_val = None if base_compare_at is serializers.empty else base_compare_at
            self._upsert_base_price(product, base_price, cmp_val)
        return product

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        data["image"] = get_image_url(instance, request, "image_file", "image")
        data["hover_image"] = get_image_url(instance, request, "hover_image_file", "hover_image")
        # Surface the current base-region price so the admin form can show/edit it.
        region = self._base_region()
        base_row = None
        if region is not None:
            base_row = next(
                (p for p in instance.prices.all() if p.region_id == region.id),
                None,
            )
        data["base_price"] = str(base_row.price) if base_row else ""
        data["base_compare_at_price"] = (
            str(base_row.compare_at_price) if base_row and base_row.compare_at_price is not None else ""
        )
        return data


class AdminCategorySerializer(serializers.ModelSerializer):
    products_info = serializers.SerializerMethodField(read_only=True)
    product_slugs = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )

    class Meta:
        model = Category
        fields = "__all__"
        extra_kwargs = {
            "image_file": {"required": False},
        }

    def get_products_info(self, obj):
        return [
            {"id": p.id, "slug": p.slug, "name": p.name_en or p.name_ar or "", "image": p.image or ""}
            for p in obj.category_products.all()[:100]
        ]

    def create(self, validated_data):
        product_slugs = validated_data.pop("product_slugs", None)
        instance = super().create(validated_data)
        if product_slugs is not None:
            for product in Product.objects.filter(slug__in=set(product_slugs)):
                product.categories.add(instance)
        return instance

    def update(self, instance, validated_data):
        product_slugs = validated_data.pop("product_slugs", None)
        instance = super().update(instance, validated_data)
        if product_slugs is not None:
            new_slugs = set(product_slugs)
            current_products = list(instance.category_products.all())
            current_slugs = {p.slug for p in current_products}
            to_add = Product.objects.filter(slug__in=new_slugs - current_slugs)
            for product in to_add:
                product.categories.add(instance)
            for product in current_products:
                if product.slug not in new_slugs:
                    product.categories.remove(instance)
        return instance


class AdminInstagramPostSerializer(serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = InstagramPost
        fields = ("id", "image", "image_file", "href", "sort_order")
        read_only_fields = ("id",)


class AdminHeroPromoCardSerializer(serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_blank=True)
    image_mobile = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = HeroPromoCard
        fields = (
            "id",
            "title_en",
            "title_ar",
            "eyebrow_en",
            "eyebrow_ar",
            "subtitle_en",
            "subtitle_ar",
            "cta_en",
            "cta_ar",
            "href",
            "image",
            "image_file",
            "image_mobile",
            "image_file_mobile",
            "size",
            "accent",
            "sort_order",
            "is_visible",
        )
        extra_kwargs = {
            "image_file": {"required": False},
            "image_file_mobile": {"required": False},
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance:
            return attrs

        image_value = attrs.get("image")
        image_file = attrs.get("image_file")
        if not image_value and not image_file:
            raise serializers.ValidationError({"image": "Provide either image URL or image file."})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        data["image"] = get_image_url(instance, request, "image_file", "image")
        return data


class AdminCouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = "__all__"


class AdminOrderItemSerializer(serializers.ModelSerializer):
    product_image = serializers.SerializerMethodField(read_only=True)
    sku = serializers.SerializerMethodField(read_only=True)
    variant = serializers.CharField(source="selected_options_text", read_only=True)

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "product_slug",
            "sku",
            "product_name",
            "product_image",
            "variant",
            "quantity",
            "unit_price",
            "line_total",
        )
        read_only_fields = fields

    def get_product_image(self, obj):
        product = getattr(obj, "product", None)
        if not product:
            return ""
        request = self.context.get("request")
        return get_image_url(product, request, "image_file", "image")

    def get_sku(self, obj):
        item_sku = str(getattr(obj, "sku", "") or "").strip()
        if item_sku:
            return item_sku
        product = getattr(obj, "product", None)
        product_sku = str(getattr(product, "sku", "") or "").strip() if product else ""
        return product_sku or str(obj.product_slug or "")


class AdminOrderSerializer(serializers.ModelSerializer):
    admin_invoice_download_url = serializers.SerializerMethodField()
    map_link = serializers.SerializerMethodField()
    status_timeline = serializers.SerializerMethodField(read_only=True)
    conversion_summary = serializers.SerializerMethodField(read_only=True)
    allowed_status_transitions = serializers.SerializerMethodField(read_only=True)
    previous_status = serializers.SerializerMethodField(read_only=True)
    previous_status_label = serializers.SerializerMethodField(read_only=True)
    can_revert_status = serializers.SerializerMethodField(read_only=True)
    revert_status_label = serializers.SerializerMethodField(read_only=True)
    revert_status_helper = serializers.SerializerMethodField(read_only=True)
    rollback_action = serializers.SerializerMethodField(read_only=True)
    notification_summary = serializers.SerializerMethodField(read_only=True)
    notification_history = serializers.SerializerMethodField(read_only=True)
    previous_status_option = serializers.SerializerMethodField(read_only=True)
    status_note = serializers.CharField(write_only=True, required=False, allow_blank=True)
    region_code = serializers.CharField(source="region.code", read_only=True)
    region_name = serializers.CharField(source="region.name_en", read_only=True)
    items_count = serializers.SerializerMethodField(read_only=True)
    items = AdminOrderItemSerializer(many=True, read_only=True)
    transactions = PaymentTransactionSerializer(many=True, read_only=True)
    return_requests = ReturnRequestSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = "__all__"
        read_only_fields = (
            "order_number",
            "user",
            "customer_snapshot",
            "address_snapshot",
            "subtotal",
            "discount_total",
            "shipping_fee",
            "shipping_method",
            "shipping_carrier_name",
            "shipping_eta_min_days",
            "shipping_eta_max_days",
            "shipping_total",
            "shipment_created_at",
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
            "refund_amount",
            "refund_status",
            "refund_reference",
            "refunded_at",
            "inventory_released",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        new_status = attrs.get("status")
        if instance and new_status and new_status != instance.status:
            if not instance.can_transition_to(new_status):
                raise serializers.ValidationError(
                    {"status": f"Invalid status transition from '{instance.status}' to '{new_status}'."}
                )
        return attrs

    def update(self, instance, validated_data):
        status_note = str(validated_data.pop("status_note", "")).strip()
        request = self.context.get("request")
        actor = getattr(request, "user", None) if request else None
        next_status = validated_data.get("status")
        if next_status and next_status != instance.status:
            instance._status_actor = actor
            instance._status_note = status_note
        return super().update(instance, validated_data)

    def create(self, validated_data):
        validated_data.pop("status_note", None)
        return super().create(validated_data)

    def get_admin_invoice_download_url(self, obj):
        path = reverse("admin-order-invoice-download", kwargs={"order_number": obj.order_number})
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path

    def get_map_link(self, obj):
        if obj.latitude is None or obj.longitude is None:
            return ""
        return f"https://www.google.com/maps?q={obj.latitude},{obj.longitude}"

    def get_status_timeline(self, obj):
        entries = list(obj.status_history.select_related("actor").all())
        if not entries:
            return []
        serializer = OrderStatusHistorySerializer(
            entries,
            many=True,
            context={"current_entry": entries[-1]},
        )
        return serializer.data

    def _notification_logs(self, obj):
        return list(
            obj.notification_logs.filter(channel=NotificationLog.CHANNEL_EMAIL)
            .order_by("-created_at", "-id")
        )

    def get_notification_summary(self, obj):
        logs = self._notification_logs(obj)
        latest = logs[0] if logs else None
        if latest is None:
            return {
                "has_email": bool(obj.customer_email),
                "latest_status": "",
                "latest_event": "",
                "latest_error": "",
                "sent_at": None,
                "updated_at": None,
            }
        return {
            "has_email": bool(obj.customer_email),
            "latest_status": latest.status,
            "latest_event": latest.event,
            "latest_error": latest.error_message,
            "sent_at": latest.sent_at,
            "updated_at": latest.updated_at,
        }

    def get_notification_history(self, obj):
        return [
            {
                "id": log.id,
                "event": log.event,
                "channel": log.channel,
                "recipient": log.recipient,
                "status": log.status,
                "attempt_count": log.attempt_count,
                "task_id": log.task_id,
                "error_message": log.error_message,
                "sent_at": log.sent_at,
                "created_at": log.created_at,
                "updated_at": log.updated_at,
            }
            for log in self._notification_logs(obj)[:10]
        ]

    @staticmethod
    def _ordinal(value):
        number = max(1, int(value or 1))
        if 10 <= number % 100 <= 20:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(number % 10, "th")
        return f"{number}{suffix}"

    @staticmethod
    def _plural(value, singular, plural=None):
        count = int(value or 0)
        label = singular if count == 1 else (plural or f"{singular}s")
        return f"{count} {label}"

    def _customer_orders_queryset(self, obj):
        qs = Order.objects.filter(sales_channel=Order.SALES_CHANNEL_ONLINE_STORE)
        if obj.user_id:
            return qs.filter(user_id=obj.user_id)
        customer_email = str(obj.customer_email or "").strip()
        if customer_email:
            return qs.filter(customer_email__iexact=customer_email)
        customer_phone = str(obj.customer_phone or "").strip()
        if customer_phone:
            return qs.filter(customer_phone=customer_phone)
        return qs.filter(pk=obj.pk)

    def get_conversion_summary(self, obj):
        attribution = obj.conversion_attribution if isinstance(obj.conversion_attribution, dict) else {}
        session_key = str(obj.conversion_session_key or attribution.get("session_key") or "").strip()
        events = AnalyticsEvent.objects.none()
        event_summary = {"first_seen": None, "last_seen": None}
        event_count = 0

        if session_key:
            events = AnalyticsEvent.objects.filter(session_key=session_key)
            event_summary = events.aggregate(first_seen=Min("created_at"), last_seen=Max("created_at"))
            event_count = events.count()

        source = str(
            attribution.get("source")
            or attribution.get("utm_source")
            or ""
        ).strip()
        if not source and session_key:
            for event in events.order_by("created_at")[:25]:
                metadata = event.metadata if isinstance(event.metadata, dict) else {}
                source = str(metadata.get("source") or metadata.get("utm_source") or "").strip()
                if source:
                    break
        source = source or "Direct"

        customer_orders = self._customer_orders_queryset(obj)
        if obj.created_at:
            order_sequence = customer_orders.filter(created_at__lte=obj.created_at).count()
        elif obj.pk:
            order_sequence = customer_orders.filter(pk__lte=obj.pk).count()
        else:
            order_sequence = 1
        order_sequence = max(1, order_sequence)

        first_seen = event_summary.get("first_seen")
        last_seen = event_summary.get("last_seen") or first_seen
        session_days = 1
        if first_seen and last_seen:
            session_days = max(1, (last_seen.date() - first_seen.date()).days + 1)

        session_count = 1 if session_key else 0
        has_conversion_data = bool(session_key or attribution)
        order_line = f"This is their {self._ordinal(order_sequence)} order"
        source_line = f"{self._ordinal(1)} session from {source}" if has_conversion_data else ""
        session_line = (
            f"{self._plural(session_count, 'session')} over {self._plural(session_days, 'day')}"
            if has_conversion_data
            else ""
        )

        return {
            "available": has_conversion_data,
            "helper": "" if has_conversion_data else "No conversion data captured for this order.",
            "is_first_order": order_sequence == 1,
            "order_sequence": order_sequence,
            "order_line": order_line,
            "session_key": session_key,
            "source": source if has_conversion_data else "",
            "source_line": source_line,
            "session_count": session_count,
            "session_duration_days": session_days if has_conversion_data else 0,
            "session_line": session_line,
            "event_count": event_count,
            "details": {
                "landing_page": attribution.get("landing_page", ""),
                "current_page": attribution.get("current_page", ""),
                "referrer": attribution.get("referrer", ""),
                "utm_source": attribution.get("utm_source", ""),
                "utm_medium": attribution.get("utm_medium", ""),
                "utm_campaign": attribution.get("utm_campaign", ""),
                "first_seen": first_seen.isoformat() if first_seen else "",
                "last_seen": last_seen.isoformat() if last_seen else "",
            },
        }

    def get_allowed_status_transitions(self, obj):
        allowed = set(obj.STATUS_TRANSITIONS.get(obj.status, set()))
        return [
            {
                "value": status_key,
                "label": obj.get_status_label(status_key, locale="en"),
            }
            for status_key, _ in obj.STATUS_CHOICES
            if status_key in allowed
        ]

    def _get_previous_status_metadata(self, obj):
        cached = getattr(obj, "_admin_previous_status_metadata", None)
        if cached is not None:
            return cached

        previous_status = obj.get_previous_status()
        source = "status_history" if previous_status else ""

        if not previous_status:
            audit_entries = (
                AdminAuditLog.objects.filter(resource_type="order", resource_id=obj.order_number)
                .order_by("-timestamp", "-id")[:25]
            )
            current_status = str(obj.status or "").strip().lower()
            for entry in audit_entries:
                before_snapshot = entry.before_snapshot or {}
                after_snapshot = entry.after_snapshot or {}
                # Skip rollback entries — they would produce the same bounce-back bug
                if after_snapshot.get("rollback"):
                    continue
                before_status = str(before_snapshot.get("status") or "").strip().lower()
                after_status = str(after_snapshot.get("status") or "").strip().lower()
                if before_status and after_status == current_status and before_status != after_status:
                    previous_status = before_status
                    source = "audit_log"
                    break

        can_revert = bool(previous_status)
        previous_label = obj.get_status_label(previous_status, locale="en") if previous_status else ""
        rollback_path = (
            reverse("admin-order-status-rollback", kwargs={"order_number": obj.order_number})
            if can_revert and obj.order_number
            else ""
        )
        helper = (
            ""
            if can_revert
            else "No previous status found in history."
        )
        metadata = {
            "previous_status": previous_status,
            "previous_status_label": previous_label,
            "can_revert_status": can_revert,
            "revert_status_label": f"Revert to {previous_label}" if previous_label else "",
            "revert_status_helper": helper,
            "rollback_action": (
                {
                    "label": f"Revert to {previous_label}",
                    "method": "POST",
                    "url": rollback_path,
                    "enabled": True,
                    "source": source or "unknown",
                }
                if can_revert
                else {
                    "label": "",
                    "method": "POST",
                    "url": rollback_path,
                    "enabled": False,
                    "source": source or "",
                }
            ),
        }
        obj._admin_previous_status_metadata = metadata
        return metadata

    def get_previous_status(self, obj):
        return self._get_previous_status_metadata(obj)["previous_status"]

    def get_previous_status_label(self, obj):
        return self._get_previous_status_metadata(obj)["previous_status_label"]

    def get_can_revert_status(self, obj):
        return self._get_previous_status_metadata(obj)["can_revert_status"]

    def get_revert_status_label(self, obj):
        return self._get_previous_status_metadata(obj)["revert_status_label"]

    def get_revert_status_helper(self, obj):
        return self._get_previous_status_metadata(obj)["revert_status_helper"]

    def get_rollback_action(self, obj):
        return self._get_previous_status_metadata(obj)["rollback_action"]

    def get_previous_status_option(self, obj):
        previous_status = self.get_previous_status(obj)
        if not previous_status:
            return None
        return {
            "value": previous_status,
            "label": self.get_previous_status_label(obj),
        }

    def get_items_count(self, obj):
        if hasattr(obj, "items") and hasattr(obj.items, "all"):
            return sum(int(item.quantity or 0) for item in obj.items.all())
        return 0


class AdminPaymentTransactionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    customer_name = serializers.CharField(source="order.customer_name", read_only=True)
    # Whitelist only the fields admins actually need. raw_response is intentionally
    # omitted because it can contain raw provider payloads with PII / debugging data.
    # A redacted summary is exposed separately.
    raw_response_summary = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PaymentTransaction
        fields = (
            "id",
            "order",
            "order_number",
            "customer_name",
            "provider",
            "provider_reference",
            "amount",
            "currency_code",
            "status",
            "raw_response_summary",
            "created_at",
            "updated_at",
        )

    _RAW_SAFE_KEYS = {
        "id",
        "status",
        "success",
        "amount_cents",
        "amount",
        "currency",
        "merchant_order_id",
        "order_id",
        "transaction_id",
        "created_at",
        "updated_at",
    }

    def get_raw_response_summary(self, obj):
        payload = obj.raw_response or {}
        if not isinstance(payload, dict):
            return {"shape": type(payload).__name__}
        return {key: payload[key] for key in self._RAW_SAFE_KEYS if key in payload}


class AdminReturnRequestSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ReturnRequest
        fields = "__all__"
        read_only_fields = (
            "requested_at",
            "customer_name",
            "customer_email",
            "order",
            "reviewed_by",
        )

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by_id:
            return ""
        return obj.reviewed_by.get_full_name() or obj.reviewed_by.username or obj.reviewed_by.email or ""


class AdminReviewSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name_en", read_only=True)

    class Meta:
        model = Review
        fields = "__all__"


class AdminCustomerSerializer(serializers.ModelSerializer):
    orders_count = serializers.IntegerField(source="orders.count", read_only=True)
    total_spent = serializers.SerializerMethodField(read_only=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = get_user_model()
        fields = (
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "date_joined",
            "orders_count",
            "total_spent",
        )
        read_only_fields = ("id", "date_joined", "orders_count", "total_spent")

    def get_total_spent(self, obj):
        from django.db.models import Sum
        total = obj.orders.filter(payment_status="paid").aggregate(total=Sum("grand_total"))["total"]
        return float(total) if total else 0

    def create(self, validated_data):
        password = validated_data.pop("password", "")
        if not validated_data.get("username"):
            validated_data["username"] = validated_data.get("email") or ""
        user = get_user_model().objects.create_user(password=password or None, **validated_data)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", "")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AdminRegionSerializer(serializers.ModelSerializer):
    payment_provider_options = serializers.SerializerMethodField(read_only=True)
    payment_provider_warnings = serializers.SerializerMethodField(read_only=True)
    carrier_options = serializers.SerializerMethodField(read_only=True)
    carrier_warnings = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Region
        fields = "__all__"

    def validate_payment_enabled_providers(self, value):
        allowed = {choice[0] for choice in Region.PAYMENT_PROVIDER_CHOICES}
        if not isinstance(value, list):
            raise serializers.ValidationError("payment_enabled_providers must be a list of provider keys.")
        normalized = []
        seen = set()
        for raw in value:
            key = str(raw or "").strip().lower()
            if not key:
                continue
            if key not in allowed:
                raise serializers.ValidationError(f"Unsupported payment provider '{key}'.")
            if key in seen:
                continue
            seen.add(key)
            normalized.append(key)
        return normalized

    def validate_default_payment_provider(self, value):
        allowed = {choice[0] for choice in Region.PAYMENT_PROVIDER_CHOICES}
        key = str(value or "").strip().lower()
        if key not in allowed:
            raise serializers.ValidationError(f"Unsupported default payment provider '{key}'.")
        return key

    def validate(self, attrs):
        attrs = super().validate(attrs)
        enabled = attrs.get("payment_enabled_providers")
        default_provider = attrs.get("default_payment_provider")
        if isinstance(enabled, list) and enabled and default_provider and default_provider not in enabled:
            attrs["payment_enabled_providers"] = [default_provider, *[item for item in enabled if item != default_provider]]
        return attrs

    def get_payment_provider_options(self, obj):
        return get_region_provider_options(obj)

    def get_payment_provider_warnings(self, obj):
        return get_region_provider_warnings(obj)

    def get_carrier_options(self, obj):
        return get_region_carrier_options(obj)

    def get_carrier_warnings(self, obj):
        return get_region_carrier_warnings(obj)


class AdminShippingRuleSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True)

    class Meta:
        model = ShippingRule
        fields = "__all__"


class AdminCartMilestoneSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True)
    region_currency = serializers.CharField(source="region.currency_code", read_only=True)

    class Meta:
        model = CartMilestone
        fields = "__all__"


class AdminWarehouseSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True)
    fulfillment_region_codes = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Warehouse
        fields = "__all__"

    def get_fulfillment_region_codes(self, obj):
        return list(obj.fulfillment_regions.values_list("code", flat=True))


class AdminProductStockSerializer(serializers.ModelSerializer):
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    warehouse_region_code = serializers.CharField(source="warehouse.region.code", read_only=True)
    available_quantity = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProductStock
        fields = "__all__"

    def get_available_quantity(self, obj):
        return int(obj.available_quantity)


class AdminSiteSettingsSerializer(serializers.ModelSerializer):
    """Site settings for the admin panel.

    The legacy GLOBAL Paymob credential fields (kept only as the Oman/default
    fallback behind the per-region PaymobRegionConfig system) are handled like
    secrets:
      - they are WRITE-ONLY — the raw value is never returned to the browser;
      - a read-only ``<field>_set`` boolean reports whether a value is stored;
      - a blank/null submission is IGNORED so it never erases a saved value;
      - an explicit ``clear_<field>: true`` flag erases that one field.
    """

    # Treated as credential-like: never echoed, blank-preserving on write.
    PAYMOB_SECRET_FIELDS = (
        "paymob_api_key",
        "paymob_hmac_secret",
        "paymob_integration_id",
        "paymob_iframe_id",
        "paymob_apple_pay_integration_id",
        "paymob_apple_pay_iframe_id",
    )

    PAYMENT_PROVIDER_SECRET_FIELDS = (
        "paytabs_server_key",
        "hyperpay_access_token",
        "telr_auth_key",
        "thawani_secret_key",
        "thawani_webhook_secret",
        "omannet_access_code",
        "omannet_sha_request",
        "omannet_sha_response",
        "omannet_webhook_secret",
    )

    paymob_api_key = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    paymob_hmac_secret = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    paymob_integration_id = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    paymob_iframe_id = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    paymob_apple_pay_integration_id = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)
    paymob_apple_pay_iframe_id = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    paymob_api_key_set = serializers.SerializerMethodField()
    paymob_hmac_secret_set = serializers.SerializerMethodField()
    paymob_integration_id_set = serializers.SerializerMethodField()
    paymob_iframe_id_set = serializers.SerializerMethodField()
    paymob_apple_pay_integration_id_set = serializers.SerializerMethodField()
    paymob_apple_pay_iframe_id_set = serializers.SerializerMethodField()
    payment_provider_statuses = serializers.SerializerMethodField()

    clear_paymob_api_key = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_hmac_secret = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_integration_id = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_iframe_id = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_apple_pay_integration_id = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_apple_pay_iframe_id = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = SiteSettings
        fields = "__all__"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for field in self.PAYMENT_PROVIDER_SECRET_FIELDS:
            data.pop(field, None)
            data[f"{field}_set"] = bool(str(getattr(instance, field, "") or "").strip())
        return data

    def _is_set(self, obj, field):
        return bool(str(getattr(obj, field, "") or "").strip())

    def get_paymob_api_key_set(self, obj):
        return self._is_set(obj, "paymob_api_key")

    def get_paymob_hmac_secret_set(self, obj):
        return self._is_set(obj, "paymob_hmac_secret")

    def get_paymob_integration_id_set(self, obj):
        return self._is_set(obj, "paymob_integration_id")

    def get_paymob_iframe_id_set(self, obj):
        return self._is_set(obj, "paymob_iframe_id")

    def get_paymob_apple_pay_integration_id_set(self, obj):
        return self._is_set(obj, "paymob_apple_pay_integration_id")

    def get_paymob_apple_pay_iframe_id_set(self, obj):
        return self._is_set(obj, "paymob_apple_pay_iframe_id")

    def _provider_payload(self, *, key, label, status, credentials, helper_text):
        return {
            "key": key,
            "label": label,
            "status": status,
            "credentials": credentials,
            "helper_text": helper_text,
        }

    def _is_test_url(self, value):
        lowered = str(value or "").strip().lower()
        if not lowered:
            return False
        return any(marker in lowered for marker in ("uat", "sandbox", "test"))

    def get_payment_provider_statuses(self, obj):
        paymob_configs = [get_paymob_config("om"), get_paymob_config("sa"), get_paymob_config("ae")]
        paymob_ready = any(paymob_config_is_complete(cfg) for cfg in paymob_configs)
        paymob_api_key_set = any(bool(cfg.get("api_key")) for cfg in paymob_configs)
        paymob_hmac_set = any(bool(cfg.get("hmac_secret")) for cfg in paymob_configs)
        paymob_integrations_set = any(bool(cfg.get("integration_id")) for cfg in paymob_configs)
        paymob_iframes_set = any(bool(cfg.get("iframe_id")) for cfg in paymob_configs)
        paymob_status = "ready" if paymob_ready else "missing_keys"
        paymob_helper = (
            "Configured per region in the Paymob panel."
            if paymob_ready
            else "This provider requires real API credentials for each enabled region."
        )

        paytabs_cfg = get_paytabs_config()
        paytabs_profile_set = bool(paytabs_cfg.get("profile_id"))
        paytabs_server_set = bool(paytabs_cfg.get("server_key"))
        paytabs_ready = paytabs_profile_set and paytabs_server_set
        paytabs_status = "ready" if paytabs_ready else "missing_keys"
        paytabs_helper = (
            "This provider requires real API credentials."
            if paytabs_ready
            else "Missing required PayTabs credentials."
        )

        hyperpay_cfg = get_hyperpay_config()
        hyperpay_entity_set = bool(hyperpay_cfg.get("entity_id"))
        hyperpay_token_set = bool(hyperpay_cfg.get("access_token"))
        hyperpay_status = "scaffold_only" if (hyperpay_entity_set and hyperpay_token_set) else "missing_keys"
        hyperpay_helper = (
            "This provider is scaffolded and not ready for live payments."
            if hyperpay_status == "scaffold_only"
            else "Missing required HyperPay credentials."
        )

        telr_cfg = get_telr_config()
        telr_store_set = bool(telr_cfg.get("store_id"))
        telr_auth_set = bool(telr_cfg.get("auth_key"))
        telr_status = "scaffold_only" if (telr_store_set and telr_auth_set) else "missing_keys"
        telr_helper = (
            "This provider is scaffolded and not ready for live payments."
            if telr_status == "scaffold_only"
            else "Missing required Telr credentials."
        )

        thawani_cfg = get_thawani_config()
        thawani_publishable_set = bool(thawani_cfg.get("publishable_key"))
        thawani_secret_set = bool(thawani_cfg.get("secret_key"))
        thawani_keys_set = thawani_publishable_set and thawani_secret_set
        if not thawani_keys_set:
            thawani_status = "missing_keys"
            thawani_helper = "Missing required Thawani credentials."
        elif not thawani_cfg.get("enable_real_api"):
            thawani_status = "scaffold_only"
            thawani_helper = "This provider is scaffolded and not ready for live payments."
        elif self._is_test_url(thawani_cfg.get("base_url")):
            thawani_status = "test_mode_only"
            thawani_helper = "This provider is in test mode."
        else:
            thawani_status = "ready"
            thawani_helper = "This provider requires real API credentials."

        omannet_cfg = get_omannet_config()
        omannet_merchant_set = bool(omannet_cfg.get("merchant_id"))
        omannet_access_set = bool(omannet_cfg.get("access_code"))
        omannet_sha_set = bool(omannet_cfg.get("sha_request"))
        omannet_status = "scaffold_only" if (omannet_merchant_set and omannet_access_set and omannet_sha_set) else "missing_keys"
        omannet_helper = (
            "This provider is scaffolded and not ready for live payments."
            if omannet_status == "scaffold_only"
            else "Missing required OmanNet credentials."
        )

        return {
            "paymob": self._provider_payload(
                key="paymob",
                label="Paymob",
                status=paymob_status,
                credentials={
                    "api_key_set": paymob_api_key_set,
                    "integration_id_set": paymob_integrations_set,
                    "iframe_id_set": paymob_iframes_set,
                    "hmac_secret_set": paymob_hmac_set,
                },
                helper_text=paymob_helper,
            ),
            "paytabs": self._provider_payload(
                key="paytabs",
                label="PayTabs",
                status=paytabs_status,
                credentials={
                    "profile_id_set": paytabs_profile_set,
                    "server_key_set": paytabs_server_set,
                },
                helper_text=paytabs_helper,
            ),
            "hyperpay": self._provider_payload(
                key="hyperpay",
                label="HyperPay",
                status=hyperpay_status,
                credentials={
                    "entity_id_set": hyperpay_entity_set,
                    "access_token_set": hyperpay_token_set,
                },
                helper_text=hyperpay_helper,
            ),
            "telr": self._provider_payload(
                key="telr",
                label="Telr",
                status=telr_status,
                credentials={
                    "store_id_set": telr_store_set,
                    "auth_key_set": telr_auth_set,
                },
                helper_text=telr_helper,
            ),
            "thawani": self._provider_payload(
                key="thawani",
                label="Thawani",
                status=thawani_status,
                credentials={
                    "publishable_key_set": thawani_publishable_set,
                    "secret_key_set": thawani_secret_set,
                    "webhook_secret_set": bool(thawani_cfg.get("webhook_secret")),
                },
                helper_text=thawani_helper,
            ),
            "omannet": self._provider_payload(
                key="omannet",
                label="OmanNet",
                status=omannet_status,
                credentials={
                    "merchant_id_set": omannet_merchant_set,
                    "access_code_set": omannet_access_set,
                    "sha_request_set": omannet_sha_set,
                    "sha_response_set": bool(omannet_cfg.get("sha_response")),
                },
                helper_text=omannet_helper,
            ),
        }

    def _apply_secret_directives(self, validated_data, *, creating):
        """Honor clear_* flags and never overwrite a stored secret with a blank."""
        for field in (*self.PAYMOB_SECRET_FIELDS, *self.PAYMENT_PROVIDER_SECRET_FIELDS):
            if validated_data.pop(f"clear_{field}", False):
                validated_data[field] = ""
                continue
            if field in validated_data:
                value = validated_data.get(field)
                if value is None or str(value).strip() == "":
                    # Blank submission: keep the existing value (empty on create).
                    if creating:
                        validated_data[field] = ""
                    else:
                        validated_data.pop(field, None)
        return validated_data

    def create(self, validated_data):
        self._apply_secret_directives(validated_data, creating=True)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self._apply_secret_directives(validated_data, creating=False)
        return super().update(instance, validated_data)


class AdminPaymobRegionConfigSerializer(serializers.ModelSerializer):
    """Per-region Paymob credentials for the admin Payment Setup UI.

    Secrets (api_key, hmac_secret) are write-only: the raw value is never sent
    back to the frontend — only a boolean "is set" indicator. Blank credential
    fields are ignored on write so they never overwrite a working value (DB or
    env fallback); send a value only when you intend to change it.
    """

    region_label    = serializers.CharField(source="get_region_code_display", read_only=True)
    api_key_set     = serializers.SerializerMethodField(read_only=True)
    hmac_secret_set = serializers.SerializerMethodField(read_only=True)
    # Secrets accepted on write, never echoed back.
    api_key     = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    hmac_secret = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")

    # Credential fields whose blank values must NOT overwrite stored/env config.
    _BLANK_PRESERVING_FIELDS = (
        "api_key", "integration_id", "iframe_id", "hmac_secret", "base_url", "currency",
    )

    class Meta:
        model = PaymobRegionConfig
        fields = (
            "region_code",
            "region_label",
            "enabled",
            "integration_id",
            "iframe_id",
            "base_url",
            "currency",
            "api_key",
            "hmac_secret",
            "api_key_set",
            "hmac_secret_set",
        )

    def get_api_key_set(self, obj):
        return bool((obj.api_key or "").strip())

    def get_hmac_secret_set(self, obj):
        return bool((obj.hmac_secret or "").strip())

    def _strip_blank_credentials(self, validated_data):
        """Drop blank credential fields so they don't overwrite existing values."""
        for field in self._BLANK_PRESERVING_FIELDS:
            if field in validated_data and not str(validated_data.get(field) or "").strip():
                validated_data.pop(field)
        return validated_data

    def update(self, instance, validated_data):
        self._strip_blank_credentials(validated_data)
        return super().update(instance, validated_data)


class AdminBlogPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = "__all__"
        extra_kwargs = {
            "image_file": {"required": False},
        }


class AdminCmsPageSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True, default="")

    class Meta:
        model = CmsPage
        fields = "__all__"


class AdminTaxRateSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True, default="")
    rate_pct = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TaxRate
        fields = (
            "id",
            "region",
            "region_code",
            "country_code",
            "label",
            "rate",
            "rate_pct",
            "is_inclusive",
            "applies_to_shipping",
            "is_active",
            "effective_from",
            "effective_to",
        )

    def get_rate_pct(self, obj):
        return round(float(obj.rate) * 100, 4)


class AdminStaffSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=[
            ("Owner/Super Admin", "Owner/Super Admin"),
            ("Manager", "Manager"),
            ("Product Editor", "Product Editor"),
            ("Order Support", "Order Support"),
            ("Finance", "Finance"),
            ("Marketing", "Marketing"),
        ],
        write_only=True,
        required=False,
        allow_blank=True,
    )
    roles = serializers.SerializerMethodField(read_only=True)
    capabilities = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = get_user_model()
        fields = (
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "date_joined",
            "role",
            "roles",
            "capabilities",
        )
        read_only_fields = ("id", "date_joined", "roles", "capabilities")

    def get_roles(self, obj):
        return list(obj.groups.values_list("name", flat=True))

    def get_capabilities(self, obj):
        from ..services.admin_roles import get_user_admin_capabilities
        return list(get_user_admin_capabilities(obj))

    def _assign_role(self, user, role_name):
        from django.contrib.auth.models import Group
        from ..services.admin_roles import ensure_default_admin_roles
        if not role_name:
            return
        ensure_default_admin_roles()
        user.groups.clear()
        try:
            group = Group.objects.get(name=role_name)
            user.groups.add(group)
        except Group.DoesNotExist:
            pass

    def create(self, validated_data):
        role = validated_data.pop("role", "")
        password = validated_data.pop("password", "")
        if not validated_data.get("username"):
            validated_data["username"] = validated_data.get("email") or ""
        validated_data.setdefault("is_staff", True)
        user = get_user_model().objects.create_user(password=password or None, **validated_data)
        self._assign_role(user, role)
        return user

    def update(self, instance, validated_data):
        role = validated_data.pop("role", None)
        password = validated_data.pop("password", "")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        if role is not None:
            self._assign_role(instance, role)
        return instance


class AdminAuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField(read_only=True)
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = AdminAuditLog
        fields = (
            "id",
            "actor",
            "actor_name",
            "actor_email",
            "action",
            "resource_type",
            "resource_id",
            "before_snapshot",
            "after_snapshot",
            "ip_address",
            "user_agent",
            "timestamp",
        )
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor_id:
            return "System"
        return obj.actor.get_full_name() or obj.actor.username or obj.actor.email or "Staff"


class AdminGiftCardSerializer(serializers.ModelSerializer):
    remaining_balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    initial_balance = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = GiftCard
        fields = (
            "id",
            "code",
            "initial_balance",
            "remaining_balance",
            "currency_code",
            "region",
            "recipient_name",
            "recipient_email",
            "recipient_phone",
            "sender_name",
            "message",
            "status",
            "expiry_date",
            "redeemed_at",
            "redeemed_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "code", "redeemed_at", "redeemed_by", "created_at", "updated_at")


class AdminBackInStockRequestSerializer(serializers.ModelSerializer):
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    product_name = serializers.CharField(source="product.name_en", read_only=True)
    region_code = serializers.CharField(source="region.code", read_only=True, default="")
    region_name = serializers.CharField(source="region.name_en", read_only=True, default="")
    user_email = serializers.CharField(source="user.email", read_only=True, default="")

    class Meta:
        model = BackInStockRequest
        fields = "__all__"


class AdminAbandonedCartSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True, default="")
    region_name = serializers.CharField(source="region.name_en", read_only=True, default="")

    class Meta:
        model = AbandonedCart
        fields = "__all__"
