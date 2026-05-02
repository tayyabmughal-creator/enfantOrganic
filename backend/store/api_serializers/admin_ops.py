from django.contrib.auth import get_user_model
from rest_framework import serializers

from ..models import Category, Coupon, Order, PaymentTransaction, Product, ProductPrice, Region, Review, SiteSettings


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
            "shipping_total",
            "grand_total",
            "currency_code",
            "created_at",
            "updated_at",
        )


class AdminPaymentTransactionSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    customer_name = serializers.CharField(source="order.customer_name", read_only=True)

    class Meta:
        model = PaymentTransaction
        fields = "__all__"


class AdminReviewSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name_en", read_only=True)

    class Meta:
        model = Review
        fields = "__all__"


class AdminCustomerSerializer(serializers.ModelSerializer):
    orders_count = serializers.IntegerField(source="orders.count", read_only=True)
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
        )
        read_only_fields = ("id", "date_joined", "orders_count")

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
    class Meta:
        model = Region
        fields = "__all__"


class AdminSiteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = "__all__"
