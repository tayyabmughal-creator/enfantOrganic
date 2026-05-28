from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import serializers

from ..models import (
    AbandonedCart,
    AdminAuditLog,
    BlogPost,
    Category,
    Coupon,
    GiftCard,
    HeroPromoCard,
    InstagramPost,
    Order,
    PaymentTransaction,
    PaymobRegionConfig,
    Product,
    ProductPrice,
    ProductStock,
    Region,
    ReturnRequest,
    Review,
    ShippingRule,
    SiteSettings,
    TaxRule,
    Warehouse,
)
from ..services.payment_router import get_region_provider_options, get_region_provider_warnings
from ..services.carrier_router import get_region_carrier_options, get_region_carrier_warnings
from .orders import OrderStatusHistorySerializer
from .localization import get_image_url


class AdminProductPriceSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True)

    class Meta:
        model = ProductPrice
        fields = ("id", "region", "region_code", "price", "compare_at_price", "unit_price_text_en", "unit_price_text_ar")


class AdminProductSerializer(serializers.ModelSerializer):
    prices = AdminProductPriceSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = "__all__"
        extra_kwargs = {
            "image_file": {"required": False},
            "hover_image_file": {"required": False},
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        data["image"] = get_image_url(instance, request, "image_file", "image")
        data["hover_image"] = get_image_url(instance, request, "hover_image_file", "hover_image")
        return data


class AdminCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"
        extra_kwargs = {
            "image_file": {"required": False},
        }


class AdminInstagramPostSerializer(serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = InstagramPost
        fields = ("id", "image", "image_file", "href", "sort_order")
        read_only_fields = ("id",)


class AdminHeroPromoCardSerializer(serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = HeroPromoCard
        fields = (
            "id",
            "title_en",
            "title_ar",
            "subtitle_en",
            "subtitle_ar",
            "cta_en",
            "cta_ar",
            "href",
            "image",
            "image_file",
            "size",
            "accent",
            "sort_order",
            "is_visible",
        )
        extra_kwargs = {
            "image_file": {"required": False},
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


class AdminOrderSerializer(serializers.ModelSerializer):
    admin_invoice_download_url = serializers.SerializerMethodField()
    map_link = serializers.SerializerMethodField()
    status_timeline = serializers.SerializerMethodField(read_only=True)
    status_note = serializers.CharField(write_only=True, required=False, allow_blank=True)

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

    clear_paymob_api_key = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_hmac_secret = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_integration_id = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_iframe_id = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_apple_pay_integration_id = serializers.BooleanField(write_only=True, required=False, default=False)
    clear_paymob_apple_pay_iframe_id = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = SiteSettings
        fields = "__all__"

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

    def _apply_secret_directives(self, validated_data, *, creating):
        """Honor clear_* flags and never overwrite a stored secret with a blank."""
        for field in self.PAYMOB_SECRET_FIELDS:
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


class AdminTaxRuleSerializer(serializers.ModelSerializer):
    region_code = serializers.CharField(source="region.code", read_only=True, default="")
    rate_pct = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TaxRule
        fields = (
            "id",
            "region",
            "region_code",
            "name_en",
            "name_ar",
            "rate",
            "rate_pct",
            "is_inclusive",
            "is_active",
            "description",
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
    class Meta:
        model = GiftCard
        fields = "__all__"


class AdminAbandonedCartSerializer(serializers.ModelSerializer):
    class Meta:
        model = AbandonedCart
        fields = "__all__"
