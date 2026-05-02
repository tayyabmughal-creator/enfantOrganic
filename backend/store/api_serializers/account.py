from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.conf import settings
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.encoding import force_bytes
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import CustomerAddress, NewsletterSubscription, Product, PushDevice, Region, Review, WishlistItem
from .catalog import ProductCardSerializer


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    tokens = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = get_user_model()
        fields = ("id", "username", "email", "first_name", "last_name", "password", "tokens")

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = get_user_model().objects.create_user(password=password, **validated_data)
        return user

    def get_tokens(self, obj):
        refresh = RefreshToken.for_user(obj)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ("id", "username", "email", "first_name", "last_name")
        read_only_fields = ("id", "username")


class CustomerAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAddress
        fields = (
            "id",
            "full_name",
            "phone",
            "address_line_1",
            "address_line_2",
            "city",
            "country",
            "is_default",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class ReviewCreateSerializer(serializers.ModelSerializer):
    product_slug = serializers.SlugField(write_only=True)
    order_number = serializers.CharField(write_only=True)

    class Meta:
        model = Review
        fields = (
            "id",
            "product_slug",
            "order_number",
            "customer_name",
            "rating",
            "title",
            "comment",
            "is_verified_purchase",
            "is_approved",
            "created_at",
        )
        read_only_fields = ("id", "is_verified_purchase", "is_approved", "created_at")


class PushDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushDevice
        fields = ("id", "token", "platform", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "is_active", "created_at", "updated_at")


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def save(self):
        user = get_user_model().objects.filter(email__iexact=self.validated_data["email"], is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            send_mail(
                "Reset your EnfhantOrganic password",
                f"Use this uid and token to reset your password.\nuid: {uid}\ntoken: {token}",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=True,
            )


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)

    def validate(self, attrs):
        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = get_user_model().objects.get(pk=user_id)
        except Exception:
            raise serializers.ValidationError("Invalid reset link.")

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError("Invalid reset link.")

        attrs["user"] = user
        return attrs

    def save(self):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class WishlistItemSerializer(serializers.ModelSerializer):
    product = ProductCardSerializer(read_only=True)
    product_slug = serializers.SlugField(write_only=True)

    class Meta:
        model = WishlistItem
        fields = ("id", "product", "product_slug", "created_at")
        read_only_fields = ("id", "product", "created_at")

    def validate_product_slug(self, value):
        if not Product.objects.filter(slug=value, is_published=True).exists():
            raise serializers.ValidationError("Product not found.")
        return value

    def create(self, validated_data):
        product = Product.objects.get(slug=validated_data.pop("product_slug"), is_published=True)
        item, _ = WishlistItem.objects.get_or_create(
            user=self.context["request"].user,
            product=product,
        )
        return item


class NewsletterSubscriptionSerializer(serializers.ModelSerializer):
    region_code = serializers.SlugField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = NewsletterSubscription
        fields = ("email", "locale", "region_code", "is_active", "created_at")
        read_only_fields = ("is_active", "created_at")

    def create(self, validated_data):
        region_code = validated_data.pop("region_code", "")
        region = Region.objects.filter(code=region_code, is_active=True).first() if region_code else None
        subscription, _ = NewsletterSubscription.objects.update_or_create(
            email=validated_data["email"],
            defaults={**validated_data, "region": region, "is_active": True},
        )
        return subscription
