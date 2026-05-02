import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from ..emails import send_order_confirmation_email
from ..models import Coupon, Order, OrderItem, PaymentTransaction, Product, ProductPrice, Region
from ..notifications import notify_admins_new_order

logger = logging.getLogger(__name__)


class CheckoutItemInputSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    quantity = serializers.IntegerField(min_value=1)
    selected_options_text = serializers.CharField(required=False, allow_blank=True)


class CheckoutCustomerSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=60)
    address_line_1 = serializers.CharField(max_length=255)
    address_line_2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city = serializers.CharField(max_length=120)
    country = serializers.CharField(max_length=120)


def resolve_region(value):
    try:
        return Region.objects.get(code=value, is_active=True)
    except Region.DoesNotExist:
        raise serializers.ValidationError("Invalid region.")


def prepare_checkout_items(items_data, region, lock_products=False):
    subtotal = Decimal("0.00")
    prepared_items = []
    requested_quantities = {}

    for item_data in items_data:
        slug = item_data["slug"]
        requested_quantities[slug] = requested_quantities.get(slug, 0) + item_data["quantity"]

    for item_data in items_data:
        products = Product.objects
        if lock_products:
            products = products.select_for_update()

        product = products.filter(
            slug=item_data["slug"],
            is_published=True,
        ).first()

        if not product:
            raise serializers.ValidationError(
                {"items": f"Product not found: {item_data['slug']}"}
            )

        price_obj = ProductPrice.objects.filter(
            product=product,
            region=region,
        ).first()

        if not price_obj:
            raise serializers.ValidationError(
                {"items": f"Price not configured for product: {product.slug}"}
            )

        quantity = item_data["quantity"]

        if product.track_inventory and requested_quantities[product.slug] > product.stock_quantity:
            raise serializers.ValidationError(
                {
                    "items": f"Only {product.stock_quantity} item(s) available for {product.name_en}."
                }
            )

        unit_price = price_obj.price
        line_total = unit_price * quantity
        subtotal += line_total

        prepared_items.append(
            {
                "product": product,
                "product_slug": product.slug,
                "product_name": product.name_en,
                "selected_options_text": item_data.get("selected_options_text", ""),
                "quantity": quantity,
                "unit_price": unit_price,
                "line_total": line_total,
            }
        )

    return subtotal, prepared_items


def validate_coupon_for_checkout(coupon_code, region, subtotal, prepared_items, lock_coupon=False):
    clean_code = coupon_code.strip().upper()

    if not clean_code:
        return None, Decimal("0.00")

    now = timezone.now()
    coupons = Coupon.objects
    if lock_coupon:
        coupons = coupons.select_for_update()

    coupon = coupons.filter(
        code=clean_code,
        is_active=True,
    ).first()

    if not coupon:
        raise serializers.ValidationError({"coupon_code": "Invalid coupon code."})

    if coupon.starts_at and coupon.starts_at > now:
        raise serializers.ValidationError({"coupon_code": "Coupon is not active yet."})

    if coupon.ends_at and coupon.ends_at < now:
        raise serializers.ValidationError({"coupon_code": "Coupon has expired."})

    if subtotal < coupon.minimum_subtotal:
        raise serializers.ValidationError(
            {"coupon_code": f"Minimum subtotal required is {coupon.minimum_subtotal}."}
        )

    if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
        raise serializers.ValidationError({"coupon_code": "Coupon usage limit reached."})

    allowed_region_ids = list(coupon.regions.values_list("id", flat=True))
    if allowed_region_ids and region.id not in allowed_region_ids:
        raise serializers.ValidationError({"coupon_code": "Coupon is not valid for this region."})

    allowed_product_ids = set(coupon.products.values_list("id", flat=True))
    allowed_category_ids = set(coupon.categories.values_list("id", flat=True))
    if allowed_product_ids or allowed_category_ids:
        has_allowed_item = any(
            prepared_item["product"].id in allowed_product_ids
            or prepared_item["product"].category_id in allowed_category_ids
            for prepared_item in prepared_items
        )
        if not has_allowed_item:
            raise serializers.ValidationError({"coupon_code": "Coupon is not valid for these products."})

    discount_total = Decimal("0.00")
    if coupon.discount_type == Coupon.DISCOUNT_PERCENTAGE:
        discount_total = subtotal * coupon.value / Decimal("100")
    elif coupon.discount_type == Coupon.DISCOUNT_FIXED:
        discount_total = coupon.value

    if discount_total > subtotal:
        discount_total = subtotal

    return coupon, discount_total


def calculate_shipping_total(region, subtotal, coupon=None):
    free_threshold = getattr(region, "free_shipping_threshold", Decimal("0.00")) or Decimal("0.00")

    if free_threshold <= 0:
        free_threshold = getattr(region, "shipping_threshold", Decimal("0.00")) or Decimal("0.00")

    shipping_fee = getattr(region, "shipping_fee", Decimal("0.00")) or Decimal("0.00")
    shipping_total = Decimal("0.00")

    if free_threshold <= 0:
        shipping_total = shipping_fee
    elif subtotal < free_threshold:
        shipping_total = shipping_fee

    if coupon and coupon.discount_type == Coupon.DISCOUNT_FREE_SHIPPING:
        shipping_total = Decimal("0.00")

    return shipping_total


def serialize_money(value):
    return str(Decimal(value).quantize(Decimal("0.01")))


class CouponValidationSerializer(serializers.Serializer):
    region = serializers.SlugField()
    coupon_code = serializers.CharField()
    items = CheckoutItemInputSerializer(many=True)

    def validate_region(self, value):
        return resolve_region(value)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Cart is empty.")
        return value

    def evaluate(self):
        region = self.validated_data["region"]
        subtotal, prepared_items = prepare_checkout_items(
            self.validated_data["items"],
            region,
            lock_products=False,
        )
        coupon, discount_total = validate_coupon_for_checkout(
            self.validated_data["coupon_code"],
            region,
            subtotal,
            prepared_items,
            lock_coupon=False,
        )
        shipping_total = calculate_shipping_total(region, subtotal, coupon)
        final_total = subtotal - discount_total + shipping_total

        return {
            "valid": True,
            "coupon_code": coupon.code,
            "discount_amount": serialize_money(discount_total),
            "shipping_amount": serialize_money(shipping_total),
            "subtotal": serialize_money(subtotal),
            "final_total": serialize_money(final_total),
            "currency_code": region.currency_code,
            "message": "Coupon applied.",
        }


class CheckoutCreateSerializer(serializers.Serializer):
    region = serializers.SlugField()
    locale = serializers.CharField(max_length=8, default="en")
    customer = CheckoutCustomerSerializer()
    payment_method = serializers.ChoiceField(
        choices=[choice[0] for choice in Order.PAYMENT_METHOD_CHOICES],
        default=Order.PAYMENT_COD,
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    coupon_code = serializers.CharField(required=False, allow_blank=True)
    items = CheckoutItemInputSerializer(many=True)

    def validate_region(self, value):
        return resolve_region(value)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Cart is empty.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        region = validated_data["region"]
        customer = validated_data["customer"]
        subtotal, prepared_items = prepare_checkout_items(
            validated_data["items"],
            region,
            lock_products=True,
        )

        coupon_code = validated_data.get("coupon_code", "").strip().upper()
        coupon, discount_total = validate_coupon_for_checkout(
            coupon_code,
            region,
            subtotal,
            prepared_items,
            lock_coupon=True,
        )

        shipping_total = calculate_shipping_total(region, subtotal, coupon)
        grand_total = subtotal - discount_total + shipping_total

        order = Order.objects.create(
            user=self.context.get("request").user
            if self.context.get("request") and self.context["request"].user.is_authenticated
            else None,
            region=region,
            locale=validated_data.get("locale", "en"),
            customer_name=customer["name"],
            customer_email=customer.get("email", ""),
            customer_phone=customer["phone"],
            address_line_1=customer["address_line_1"],
            address_line_2=customer.get("address_line_2", ""),
            city=customer["city"],
            country=customer["country"],
            notes=validated_data.get("notes", ""),
            coupon_code=coupon_code,
            discount_total=discount_total,
            subtotal=subtotal,
            shipping_total=shipping_total,
            grand_total=grand_total,
            currency_code=region.currency_code,
            payment_method=validated_data.get("payment_method", Order.PAYMENT_COD),
        )

        for prepared_item in prepared_items:
            product = prepared_item["product"]
            OrderItem.objects.create(
                order=order,
                price_snapshot={
                    "unit_price": str(prepared_item["unit_price"]),
                    "line_total": str(prepared_item["line_total"]),
                    "currency_code": region.currency_code,
                },
                **prepared_item,
            )
            if product and product.track_inventory:
                product.stock_quantity = max(product.stock_quantity - prepared_item["quantity"], 0)
                product.save(update_fields=["stock_quantity"])

        if coupon:
            coupon.used_count += 1
            coupon.save(update_fields=["used_count"])

        PaymentTransaction.objects.create(
            order=order,
            provider=order.payment_method,
            amount=order.grand_total,
            currency_code=order.currency_code,
            status=PaymentTransaction.STATUS_PENDING,
        )

        try:
            send_order_confirmation_email(order)
        except Exception:
            logger.exception("Order confirmation email failed for order %s", order.order_number)

        transaction.on_commit(lambda: notify_admins_new_order(order))

        return order
