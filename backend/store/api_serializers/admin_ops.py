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
    Order,
    PaymentTransaction,
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


class AdminCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"
        extra_kwargs = {
            "image_file": {"required": False},
        }


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
    class Meta:
        model = SiteSettings
        fields = "__all__"


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
