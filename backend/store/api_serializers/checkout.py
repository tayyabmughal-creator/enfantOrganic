import logging
import re
from decimal import Decimal, ROUND_HALF_UP

from django.core.validators import RegexValidator
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import serializers

# E.164-ish phone validator: optional leading +, 8–15 digits, allows separators
# common in GCC numbers. Storage normalizes to a single sanitized string.
PHONE_PATTERN = re.compile(r"^\+?[0-9 ()\-]{8,32}$")
NAME_PATTERN = re.compile(r"^[\w\s'\.\-؀-ۿ]{2,160}$", re.UNICODE)

from ..models import (
    CartMilestone,
    Coupon,
    GiftCard,
    GiftCardRedemption,
    Order,
    OrderItem,
    PaymentTransaction,
    Product,
    ProductPrice,
    Region,
    ShippingRule,
    TaxRate,
)
from ..services import carrier_router
from ..services.stock import StockError, ensure_region_stock_available, reserve_and_deduct_stock_for_item

logger = logging.getLogger(__name__)

MONEY_QUANTIZER = Decimal("0.01")
RATE_QUANTIZER = Decimal("0.0001")


def quantize_money(value):
    return Decimal(value).quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)


def quantize_rate(value):
    return Decimal(value).quantize(RATE_QUANTIZER, rounding=ROUND_HALF_UP)


class CheckoutItemInputSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    quantity = serializers.IntegerField(min_value=1)
    selected_options_text = serializers.CharField(required=False, allow_blank=True)


class CheckoutCustomerSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=2, max_length=160)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(min_length=8, max_length=32)

    def validate_name(self, value):
        cleaned = (value or "").strip()
        if not cleaned or len(cleaned) < 2:
            raise serializers.ValidationError("Name is required (min 2 characters).")
        if not NAME_PATTERN.match(cleaned):
            raise serializers.ValidationError("Name contains unsupported characters.")
        return cleaned

    def validate_phone(self, value):
        cleaned = (value or "").strip()
        if not PHONE_PATTERN.match(cleaned):
            raise serializers.ValidationError("Enter a valid phone number (digits, optional +, 8–15 digits).")
        return cleaned
    sms_opt_in = serializers.BooleanField(required=False, default=False)
    whatsapp_opt_in = serializers.BooleanField(required=False, default=False)
    address_line_1 = serializers.CharField(max_length=255)
    address_line_2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    building = serializers.CharField(max_length=120, required=False, allow_blank=True)
    floor = serializers.CharField(max_length=60, required=False, allow_blank=True)
    apartment = serializers.CharField(max_length=120, required=False, allow_blank=True)
    landmark = serializers.CharField(max_length=255, required=False, allow_blank=True)
    area = serializers.CharField(max_length=120, required=False, allow_blank=True)
    city = serializers.CharField(max_length=120)
    postcode = serializers.CharField(max_length=40, required=False, allow_blank=True)
    country = serializers.CharField(max_length=120)
    formatted_address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    place_id = serializers.CharField(max_length=255, required=False, allow_blank=True)
    latitude = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        required=False,
        allow_null=True,
    )
    longitude = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        required=False,
        allow_null=True,
    )
    lat = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        required=False,
        allow_null=True,
        write_only=True,
    )
    lng = serializers.DecimalField(
        max_digits=9,
        decimal_places=6,
        required=False,
        allow_null=True,
        write_only=True,
    )
    location_notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        latitude = attrs.get("latitude")
        longitude = attrs.get("longitude")
        lat_alias = attrs.pop("lat", None)
        lng_alias = attrs.pop("lng", None)

        if latitude is None and lat_alias is not None:
            latitude = lat_alias
            attrs["latitude"] = latitude
        if longitude is None and lng_alias is not None:
            longitude = lng_alias
            attrs["longitude"] = longitude

        if latitude is not None and (latitude < -90 or latitude > 90):
            raise serializers.ValidationError({"latitude": "Latitude must be between -90 and 90."})
        if longitude is not None and (longitude < -180 or longitude > 180):
            raise serializers.ValidationError({"longitude": "Longitude must be between -180 and 180."})

        return attrs


def resolve_region(value):
    try:
        return Region.objects.get(code=value, is_active=True)
    except Region.DoesNotExist:
        raise serializers.ValidationError("Invalid region.")


def get_tax_rate_for_region(region, at_date=None):
    return TaxRate.get_effective_rate(region=region, at_date=at_date)


def prepare_checkout_items(items_data, region, lock_products=False):
    subtotal = Decimal("0.00")
    prepared_items = []
    requested_quantities = {}
    validated_inventory_slugs = set()

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

        if product.track_inventory and product.slug not in validated_inventory_slugs:
            try:
                ensure_region_stock_available(
                    product,
                    region,
                    requested_quantities[product.slug],
                )
            except StockError as exc:
                raise serializers.ValidationError({"items": str(exc)})
            validated_inventory_slugs.add(product.slug)

        unit_price = price_obj.price
        line_total = quantize_money(unit_price * quantity)
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

    return quantize_money(subtotal), prepared_items


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

    return coupon, quantize_money(discount_total)


def _get_effective_milestones(region):
    """
    Return active milestones for this region.
    If the region has none, auto-convert from the default (base) region via fx_rate.
    """
    own = list(CartMilestone.objects.filter(region=region, is_active=True))
    if own:
        return [(Decimal(str(m.threshold)), m.reward_type, Decimal(str(m.discount_value or 0))) for m in own]

    base_region = Region.objects.filter(is_default=True).exclude(id=region.id).first()
    if not base_region:
        return []

    base_milestones = list(CartMilestone.objects.filter(region=base_region, is_active=True))
    if not base_milestones:
        return []

    base_fx = Decimal(str(base_region.fx_rate or 1))
    this_fx = Decimal(str(region.fx_rate or 1))

    return [
        (
            (Decimal(str(m.threshold)) / base_fx * this_fx).quantize(Decimal("0.001")),
            m.reward_type,
            Decimal(str(m.discount_value or 0)),
        )
        for m in base_milestones
    ]


def apply_milestone_rewards(region, subtotal):
    """Return (discount_amount, free_shipping_override, discount_pct) based on active milestones hit."""
    sub = quantize_money(subtotal)
    best_discount_pct = Decimal("0")
    free_shipping = False

    for threshold, reward_type, discount_value in _get_effective_milestones(region):
        if sub < threshold:
            continue
        if reward_type == CartMilestone.REWARD_FREE_SHIPPING:
            free_shipping = True
        elif reward_type == CartMilestone.REWARD_DISCOUNT_PERCENT and discount_value > best_discount_pct:
            best_discount_pct = discount_value

    discount_amount = Decimal("0.00")
    if best_discount_pct > 0:
        discount_amount = quantize_money(sub * best_discount_pct / Decimal("100"))

    return discount_amount, free_shipping, best_discount_pct


def resolve_milestone_rewards(region, subtotal, *, coupon, gift_card_code):
    """Cart milestone rewards do NOT stack with a coupon or gift card.

    Agar koi redemption (valid coupon ya non-empty gift card code) apply ho to us
    order ke liye milestone discount + free-shipping dono suppress ho jate hain.
    Returns (discount_amount, free_shipping, discount_pct, suppressed).

    ``coupon`` sirf tab truthy hota hai jab woh valid ho (validate_coupon_for_checkout
    invalid pe raise karta hai). Gift card ki validity baad mein check hoti hai (grand
    total chahiye), is liye yahan raw non-empty code se gate karte hain — invalid card
    waise bhi validate_gift_card_for_checkout mein raise ho jayega.
    """
    discount, free_shipping, pct = apply_milestone_rewards(region, subtotal)
    redemption_applied = bool(coupon) or bool(str(gift_card_code or "").strip())
    suppressed = redemption_applied and (pct > 0 or free_shipping)
    if redemption_applied:
        return Decimal("0.00"), False, Decimal("0"), suppressed
    return discount, free_shipping, pct, suppressed


def validate_gift_card_for_checkout(
    gift_card_code,
    region,
    payable_total,
    *,
    lock_gift_card=False,
):
    clean_code = gift_card_code.strip().upper()
    if not clean_code:
        return None, Decimal("0.00"), Decimal("0.00")

    cards = GiftCard.objects
    if lock_gift_card:
        cards = cards.select_for_update()

    gift_card = cards.filter(code=clean_code).first()
    if not gift_card:
        raise serializers.ValidationError({"gift_card_code": "Gift card code is invalid."})

    now = timezone.now()
    if gift_card.status != GiftCard.STATUS_ACTIVE:
        raise serializers.ValidationError({"gift_card_code": "This gift card is not active."})
    if gift_card.expiry_date and gift_card.expiry_date < now:
        raise serializers.ValidationError({"gift_card_code": "This gift card has expired."})
    if gift_card.region_id and gift_card.region_id != region.id:
        raise serializers.ValidationError({"gift_card_code": "This gift card is not valid for this region."})
    if str(gift_card.currency_code or "").strip().upper() != str(region.currency_code or "").strip().upper():
        raise serializers.ValidationError({"gift_card_code": "This gift card currency does not match your region."})

    pending_redemptions = GiftCardRedemption.objects.filter(
        gift_card=gift_card,
        status=GiftCardRedemption.STATUS_PENDING,
    )
    if lock_gift_card:
        pending_redemptions = pending_redemptions.select_for_update()
    pending_total = pending_redemptions.aggregate(total=Sum("requested_amount")).get("total") or Decimal("0.00")
    available_balance = quantize_money(max(Decimal(gift_card.remaining_balance or 0) - Decimal(pending_total), Decimal("0.00")))
    if available_balance <= 0:
        raise serializers.ValidationError({"gift_card_code": "This gift card has no remaining balance."})

    payable = quantize_money(max(Decimal(payable_total or 0), Decimal("0.00")))
    if payable <= 0:
        raise serializers.ValidationError({"gift_card_code": "This order has no payable amount for gift card redemption."})

    redeem_amount = quantize_money(min(available_balance, payable))
    if redeem_amount <= 0:
        raise serializers.ValidationError({"gift_card_code": "This gift card cannot be applied to this order."})

    return gift_card, redeem_amount, available_balance


def _normalized_location(value):
    return str(value or "").strip().casefold()


def resolve_shipping_rule(region, subtotal, *, city="", area=""):
    city_key = _normalized_location(city)
    area_key = _normalized_location(area)

    rules = (
        ShippingRule.objects.filter(
            region=region,
            active=True,
            min_order_value__lte=quantize_money(subtotal),
        )
        .filter(Q(max_order_value__isnull=True) | Q(max_order_value__gte=quantize_money(subtotal)))
        .order_by("-min_order_value", "id")
    )

    best_match = None
    best_rank = None
    for rule in rules:
        rule_city = _normalized_location(rule.city)
        rule_area = _normalized_location(rule.area)

        if rule_city and rule_city != city_key:
            continue
        if rule_area and rule_area != area_key:
            continue

        specificity = 0
        if rule_city:
            specificity += 1
        if rule_area:
            specificity += 2

        max_value_rank = rule.max_order_value if rule.max_order_value is not None else Decimal("999999999.99")
        rank = (specificity, rule.min_order_value, -max_value_rank, -rule.id)
        if best_rank is None or rank > best_rank:
            best_rank = rank
            best_match = rule

    return best_match


def calculate_shipping_quote(region, subtotal, coupon=None, *, city="", area=""):
    subtotal = quantize_money(subtotal)
    carrier_quote = None
    if getattr(region, "carrier_enabled", False):
        try:
            carrier_quote = carrier_router.get_rate(
                region=region,
                subtotal=subtotal,
                city=city,
                area=area,
            )
        except carrier_router.CarrierRouterError as exc:
            logger.warning(
                "Carrier quote unavailable for region=%s city=%s area=%s: %s",
                getattr(region, "code", "unknown"),
                city,
                area,
                exc,
            )
        except Exception:
            logger.exception(
                "Unexpected carrier quote failure for region=%s city=%s area=%s",
                getattr(region, "code", "unknown"),
                city,
                area,
            )

    if carrier_quote:
        free_threshold = quantize_money(carrier_quote.get("free_shipping_threshold") or Decimal("0.00"))
        base_shipping_fee = quantize_money(carrier_quote.get("shipping_fee") or Decimal("0.00"))
        shipping_method = Order.SHIPPING_METHOD_CARRIER
        carrier_name = str(
            carrier_quote.get("carrier_name")
            or carrier_quote.get("carrier_key")
            or ""
        ).strip()
        eta_min_days = carrier_quote.get("eta_min_days")
        eta_max_days = carrier_quote.get("eta_max_days")
        rule = None
    else:
        rule = resolve_shipping_rule(region, subtotal, city=city, area=area)

        if rule:
            free_threshold = quantize_money(rule.free_shipping_threshold or Decimal("0.00"))
            base_shipping_fee = quantize_money(rule.shipping_fee or Decimal("0.00"))
            shipping_method = Order.SHIPPING_METHOD_RULE
            carrier_name = rule.carrier_name or ""
            eta_min_days = rule.eta_min_days
            eta_max_days = rule.eta_max_days
        else:
            free_threshold = quantize_money(
                getattr(region, "free_shipping_threshold", Decimal("0.00")) or Decimal("0.00")
            )
            if free_threshold <= 0:
                free_threshold = quantize_money(
                    getattr(region, "shipping_threshold", Decimal("0.00")) or Decimal("0.00")
                )
            base_shipping_fee = quantize_money(getattr(region, "shipping_fee", Decimal("0.00")) or Decimal("0.00"))
            shipping_method = Order.SHIPPING_METHOD_FLAT
            carrier_name = ""
            eta_min_days = None
            eta_max_days = None

    shipping_total = Decimal("0.00")
    if free_threshold <= 0 or subtotal < free_threshold:
        shipping_total = base_shipping_fee

    if coupon and coupon.discount_type == Coupon.DISCOUNT_FREE_SHIPPING:
        shipping_total = Decimal("0.00")

    return {
        "shipping_rule": rule,
        "shipping_fee": quantize_money(base_shipping_fee),
        "shipping_total": quantize_money(shipping_total),
        "free_shipping_threshold": free_threshold,
        "shipping_method": shipping_method,
        "carrier_name": carrier_name,
        "eta_min_days": eta_min_days,
        "eta_max_days": eta_max_days,
    }


def calculate_tax_totals(region, subtotal, discount_total, shipping_total):
    subtotal_after_discount = quantize_money(max(subtotal - discount_total, Decimal("0.00")))
    tax_rate_obj = get_tax_rate_for_region(region)

    if not tax_rate_obj:
        return {
            "tax_rate_obj": None,
            "tax_label": "",
            "tax_rate": Decimal("0.0000"),
            "tax_inclusive": False,
            "tax_applies_to_shipping": False,
            "subtotal_after_discount": subtotal_after_discount,
            "taxable_amount": subtotal_after_discount,
            "tax_total": Decimal("0.00"),
            "taxable_shipping_amount": Decimal("0.00"),
        }

    rate = quantize_rate(tax_rate_obj.rate or Decimal("0.00"))
    tax_inclusive = bool(tax_rate_obj.is_inclusive)
    applies_to_shipping = bool(tax_rate_obj.applies_to_shipping)
    taxable_shipping_amount = quantize_money(shipping_total) if applies_to_shipping else Decimal("0.00")
    taxable_base = quantize_money(subtotal_after_discount + taxable_shipping_amount)

    if taxable_base <= 0 or rate <= 0:
        taxable_amount = Decimal("0.00")
        tax_total = Decimal("0.00")
    elif tax_inclusive:
        divisor = Decimal("1.00") + rate
        taxable_amount = quantize_money(taxable_base / divisor)
        tax_total = quantize_money(taxable_base - taxable_amount)
    else:
        taxable_amount = taxable_base
        tax_total = quantize_money(taxable_amount * rate)

    return {
        "tax_rate_obj": tax_rate_obj,
        "tax_label": tax_rate_obj.label,
        "tax_rate": rate,
        "tax_inclusive": tax_inclusive,
        "tax_applies_to_shipping": applies_to_shipping,
        "subtotal_after_discount": subtotal_after_discount,
        "taxable_amount": taxable_amount,
        "tax_total": tax_total,
        "taxable_shipping_amount": taxable_shipping_amount,
    }


def calculate_checkout_totals(region, subtotal, discount_total, shipping_total):
    summary = calculate_tax_totals(region, subtotal, discount_total, shipping_total)
    base_total = quantize_money(subtotal - discount_total + shipping_total)
    if summary["tax_inclusive"]:
        grand_total = base_total
    else:
        grand_total = quantize_money(base_total + summary["tax_total"])

    summary.update(
        {
            "subtotal": quantize_money(subtotal),
            "discount_total": quantize_money(discount_total),
            "shipping_total": quantize_money(shipping_total),
            "grand_total": grand_total,
        }
    )
    return summary


def build_tax_breakdown(summary):
    rate_percent = quantize_money(summary["tax_rate"] * Decimal("100"))
    return {
        "label": summary["tax_label"],
        "rate": str(summary["tax_rate"]),
        "rate_percent": str(rate_percent),
        "is_inclusive": summary["tax_inclusive"],
        "applies_to_shipping": summary["tax_applies_to_shipping"],
        "subtotal_after_discount": str(summary["subtotal_after_discount"]),
        "shipping_total": str(summary["shipping_total"]),
        "taxable_shipping_amount": str(summary["taxable_shipping_amount"]),
        "taxable_amount": str(summary["taxable_amount"]),
        "tax_total": str(summary["tax_total"]),
        "grand_total": str(summary["grand_total"]),
    }


def serialize_money(value):
    return str(quantize_money(value))


class CouponValidationSerializer(serializers.Serializer):
    region = serializers.SlugField()
    coupon_code = serializers.CharField(required=False, allow_blank=True, default="")
    gift_card_code = serializers.CharField(required=False, allow_blank=True, default="")
    city = serializers.CharField(required=False, allow_blank=True, default="")
    area = serializers.CharField(required=False, allow_blank=True, default="")
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
        coupon, coupon_discount = validate_coupon_for_checkout(
            self.validated_data.get("coupon_code", ""),
            region,
            subtotal,
            prepared_items,
            lock_coupon=False,
        )
        milestone_discount, milestone_free_shipping, milestone_pct, milestone_suppressed = resolve_milestone_rewards(
            region,
            subtotal,
            coupon=coupon,
            gift_card_code=self.validated_data.get("gift_card_code", ""),
        )
        discount_total = quantize_money(min(coupon_discount + milestone_discount, subtotal))
        shipping_quote = calculate_shipping_quote(
            region,
            subtotal,
            coupon,
            city=self.validated_data.get("city", ""),
            area=self.validated_data.get("area", ""),
        )
        if milestone_free_shipping:
            shipping_quote["shipping_total"] = Decimal("0.00")
        totals = calculate_checkout_totals(
            region=region,
            subtotal=subtotal,
            discount_total=discount_total,
            shipping_total=shipping_quote["shipping_total"],
        )
        gift_card, gift_card_amount, gift_card_balance = validate_gift_card_for_checkout(
            self.validated_data.get("gift_card_code", ""),
            region,
            totals["grand_total"],
            lock_gift_card=False,
        )
        payable_total = quantize_money(max(totals["grand_total"] - gift_card_amount, Decimal("0.00")))

        message = "Totals updated."
        if coupon and gift_card:
            message = "Coupon and gift card applied."
        elif coupon:
            message = "Coupon applied."
        elif gift_card:
            message = "Gift card applied."
        if milestone_suppressed:
            message += " Cart reward removed — can't combine with a coupon or gift card."

        return {
            "valid": True,
            "coupon_code": coupon.code if coupon else "",
            "gift_card_code": gift_card.code if gift_card else "",
            "gift_card_amount": serialize_money(gift_card_amount),
            "gift_card_balance": serialize_money(gift_card_balance),
            "milestone_discount_pct": float(milestone_pct),
            "milestone_free_shipping": milestone_free_shipping,
            "milestone_suppressed": milestone_suppressed,
            "discount_amount": serialize_money(totals["discount_total"]),
            "shipping_amount": serialize_money(totals["shipping_total"]),
            "shipping_fee": serialize_money(shipping_quote["shipping_total"]),
            "shipping_method": shipping_quote["shipping_method"],
            "carrier_name": shipping_quote["carrier_name"],
            "eta_min_days": shipping_quote["eta_min_days"],
            "eta_max_days": shipping_quote["eta_max_days"],
            "free_shipping_threshold": serialize_money(shipping_quote["free_shipping_threshold"]),
            "subtotal": serialize_money(totals["subtotal"]),
            "taxable_amount": serialize_money(totals["taxable_amount"]),
            "tax_amount": serialize_money(totals["tax_total"]),
            "tax_rate": str(totals["tax_rate"]),
            "tax_label": totals["tax_label"],
            "tax_inclusive": totals["tax_inclusive"],
            "tax_applies_to_shipping": totals["tax_applies_to_shipping"],
            "final_total": serialize_money(payable_total),
            "currency_code": region.currency_code,
            "tax_breakdown": build_tax_breakdown(totals),
            "message": message,
        }


class GiftCardValidationSerializer(CouponValidationSerializer):
    gift_card_code = serializers.CharField(required=True, allow_blank=False)


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
    gift_card_code = serializers.CharField(required=False, allow_blank=True)
    items = CheckoutItemInputSerializer(many=True)
    analytics = serializers.JSONField(required=False)

    ATTRIBUTION_KEYS = {
        "session_key": 64,
        "source": 80,
        "medium": 80,
        "campaign": 160,
        "utm_source": 80,
        "utm_medium": 80,
        "utm_campaign": 160,
        "utm_content": 160,
        "utm_term": 160,
        "referrer": 500,
        "landing_page": 500,
        "current_page": 500,
        "region_code": 16,
    }

    def _clean_analytics(self, value):
        if not isinstance(value, dict):
            return {}
        cleaned = {}
        for key, max_length in self.ATTRIBUTION_KEYS.items():
            raw = value.get(key)
            if raw is None:
                continue
            text = str(raw).strip()
            if text:
                cleaned[key] = text[:max_length]
        return cleaned

    def validate_region(self, value):
        return resolve_region(value)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Cart is empty.")
        return value

    def validate(self, attrs):
        region = attrs.get("region")
        customer = attrs.get("customer", {})
        latitude = customer.get("latitude")
        longitude = customer.get("longitude")

        if region and region.require_map_pin and (latitude is None or longitude is None):
            raise serializers.ValidationError(
                {
                    "customer": (
                        "Map pin is required for this region. "
                        "Please provide latitude and longitude from map selection."
                    )
                }
            )

        return attrs

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
        coupon, coupon_discount = validate_coupon_for_checkout(
            coupon_code,
            region,
            subtotal,
            prepared_items,
            lock_coupon=True,
        )

        milestone_discount, milestone_free_shipping, _milestone_pct, _milestone_suppressed = resolve_milestone_rewards(
            region,
            subtotal,
            coupon=coupon,
            gift_card_code=validated_data.get("gift_card_code", ""),
        )
        discount_total = quantize_money(min(coupon_discount + milestone_discount, subtotal))

        shipping_quote = calculate_shipping_quote(
            region,
            subtotal,
            coupon,
            city=customer.get("city", ""),
            area=customer.get("area", ""),
        )
        if milestone_free_shipping:
            shipping_quote["shipping_total"] = Decimal("0.00")

        totals = calculate_checkout_totals(
            region=region,
            subtotal=subtotal,
            discount_total=discount_total,
            shipping_total=shipping_quote["shipping_total"],
        )
        gift_card_code = validated_data.get("gift_card_code", "").strip().upper()
        gift_card, gift_card_amount, _gift_card_balance = validate_gift_card_for_checkout(
            gift_card_code,
            region,
            totals["grand_total"],
            lock_gift_card=True,
        )
        payable_total = quantize_money(max(totals["grand_total"] - gift_card_amount, Decimal("0.00")))
        conversion_attribution = self._clean_analytics(validated_data.get("analytics"))
        conversion_session_key = conversion_attribution.get("session_key", "")

        order = Order.objects.create(
            user=self.context.get("request").user
            if self.context.get("request") and self.context["request"].user.is_authenticated
            else None,
            region=region,
            locale=validated_data.get("locale", "en"),
            customer_name=customer["name"],
            customer_email=customer.get("email", ""),
            customer_phone=customer["phone"],
            sms_opt_in=bool(customer.get("sms_opt_in", False)),
            whatsapp_opt_in=bool(customer.get("whatsapp_opt_in", False)),
            address_line_1=customer["address_line_1"],
            address_line_2=customer.get("address_line_2", ""),
            building=customer.get("building", ""),
            floor=customer.get("floor", ""),
            apartment=customer.get("apartment", ""),
            landmark=customer.get("landmark", ""),
            area=customer.get("area", ""),
            city=customer["city"],
            postcode=customer.get("postcode", ""),
            country=customer["country"],
            formatted_address=customer.get("formatted_address", ""),
            place_id=customer.get("place_id", ""),
            latitude=customer.get("latitude"),
            longitude=customer.get("longitude"),
            location_notes=customer.get("location_notes", ""),
            notes=validated_data.get("notes", ""),
            conversion_session_key=conversion_session_key,
            conversion_attribution=conversion_attribution,
            address_snapshot={
                "address_line_1": customer["address_line_1"],
                "address_line_2": customer.get("address_line_2", ""),
                "building": customer.get("building", ""),
                "floor": customer.get("floor", ""),
                "apartment": customer.get("apartment", ""),
                "landmark": customer.get("landmark", ""),
                "area": customer.get("area", ""),
                "city": customer["city"],
                "postcode": customer.get("postcode", ""),
                "country": customer["country"],
                "formatted_address": customer.get("formatted_address", ""),
                "place_id": customer.get("place_id", ""),
                "latitude": str(customer.get("latitude")) if customer.get("latitude") is not None else None,
                "longitude": str(customer.get("longitude")) if customer.get("longitude") is not None else None,
                "location_notes": customer.get("location_notes", ""),
            },
            coupon_code=coupon_code,
            discount_total=totals["discount_total"],
            gift_card_code=gift_card.code if gift_card else "",
            gift_card_amount=gift_card_amount,
            subtotal=totals["subtotal"],
            shipping_fee=shipping_quote["shipping_total"],
            shipping_method=shipping_quote["shipping_method"],
            shipping_carrier_name=shipping_quote["carrier_name"],
            shipping_eta_min_days=shipping_quote["eta_min_days"],
            shipping_eta_max_days=shipping_quote["eta_max_days"],
            shipping_total=totals["shipping_total"],
            taxable_amount=totals["taxable_amount"],
            tax_rate=totals["tax_rate"],
            tax_total=totals["tax_total"],
            tax_inclusive=totals["tax_inclusive"],
            tax_applies_to_shipping=totals["tax_applies_to_shipping"],
            tax_label=totals["tax_label"],
            tax_breakdown=build_tax_breakdown(totals),
            grand_total=payable_total,
            currency_code=region.currency_code,
            sales_channel=Order.SALES_CHANNEL_ONLINE_STORE,
            payment_method=validated_data.get("payment_method", Order.PAYMENT_COD),
        )

        subtotal_after_discount = totals["subtotal_after_discount"]
        item_entries = []

        for prepared_item in prepared_items:
            line_total = quantize_money(prepared_item["line_total"])
            if subtotal > 0:
                discount_share = quantize_money(
                    totals["discount_total"] * line_total / subtotal
                )
            else:
                discount_share = Decimal("0.00")
            line_after_discount = quantize_money(max(line_total - discount_share, Decimal("0.00")))

            if totals["tax_applies_to_shipping"] and subtotal_after_discount > 0:
                shipping_share = quantize_money(
                    totals["shipping_total"] * line_after_discount / subtotal_after_discount
                )
            else:
                shipping_share = Decimal("0.00")

            item_entries.append(
                {
                    "prepared_item": prepared_item,
                    "line_total": line_total,
                    "discount_share": discount_share,
                    "shipping_share": shipping_share,
                }
            )

        allocated_taxable = Decimal("0.00")
        allocated_tax = Decimal("0.00")
        for index, entry in enumerate(item_entries):
            taxable_base = quantize_money(
                max(entry["line_total"] - entry["discount_share"], Decimal("0.00")) + entry["shipping_share"]
            )
            is_last = index == len(item_entries) - 1

            if totals["tax_rate"] > 0 and taxable_base > 0:
                if is_last:
                    item_taxable = quantize_money(totals["taxable_amount"] - allocated_taxable)
                    item_tax = quantize_money(totals["tax_total"] - allocated_tax)
                elif totals["tax_inclusive"]:
                    divisor = Decimal("1.00") + totals["tax_rate"]
                    item_taxable = quantize_money(taxable_base / divisor)
                    item_tax = quantize_money(taxable_base - item_taxable)
                else:
                    item_taxable = taxable_base
                    item_tax = quantize_money(item_taxable * totals["tax_rate"])
            else:
                item_taxable = taxable_base
                item_tax = Decimal("0.00")

            entry["item_taxable"] = item_taxable
            entry["item_tax"] = item_tax
            allocated_taxable += item_taxable
            allocated_tax += item_tax

        for entry in item_entries:
            prepared_item = entry["prepared_item"]
            product = prepared_item["product"]
            allocations = []
            if product and product.track_inventory:
                try:
                    allocations = reserve_and_deduct_stock_for_item(
                        product,
                        region,
                        prepared_item["quantity"],
                        commit_immediately=order.payment_method != Order.PAYMENT_ONLINE,
                    )
                except StockError as exc:
                    raise serializers.ValidationError({"items": str(exc)})

            OrderItem.objects.create(
                order=order,
                taxable_amount=entry["item_taxable"],
                tax_rate=totals["tax_rate"],
                tax_total=entry["item_tax"],
                tax_inclusive=totals["tax_inclusive"],
                tax_breakdown={
                    "taxable_amount": str(entry["item_taxable"]),
                    "tax_total": str(entry["item_tax"]),
                    "discount_share": str(entry["discount_share"]),
                    "shipping_share": str(entry["shipping_share"]),
                    "tax_rate": str(totals["tax_rate"]),
                    "tax_label": totals["tax_label"],
                    "tax_inclusive": totals["tax_inclusive"],
                },
                price_snapshot={
                    "unit_price": str(prepared_item["unit_price"]),
                    "line_total": str(prepared_item["line_total"]),
                    "currency_code": region.currency_code,
                    "warehouse_allocations": allocations,
                },
                **prepared_item,
            )

        if coupon:
            coupon.used_count += 1
            coupon.save(update_fields=["used_count"])

        if gift_card:
            if order.payment_method == Order.PAYMENT_ONLINE:
                GiftCardRedemption.objects.create(
                    order=order,
                    gift_card=gift_card,
                    code_snapshot=gift_card.code,
                    requested_amount=gift_card_amount,
                    applied_amount=Decimal("0.00"),
                    status=GiftCardRedemption.STATUS_PENDING,
                )
            else:
                gift_card.remaining_balance = quantize_money(
                    max(Decimal(gift_card.remaining_balance or 0) - gift_card_amount, Decimal("0.00"))
                )
                now = timezone.now()
                update_fields = ["remaining_balance", "updated_at"]
                if gift_card.remaining_balance <= 0:
                    gift_card.status = GiftCard.STATUS_REDEEMED
                    gift_card.redeemed_at = now
                    request_user = self.context.get("request").user if self.context.get("request") else None
                    gift_card.redeemed_by = request_user if request_user and request_user.is_authenticated else None
                    update_fields.extend(["status", "redeemed_at", "redeemed_by"])
                gift_card.save(update_fields=update_fields)
                GiftCardRedemption.objects.create(
                    order=order,
                    gift_card=gift_card,
                    code_snapshot=gift_card.code,
                    requested_amount=gift_card_amount,
                    applied_amount=gift_card_amount,
                    status=GiftCardRedemption.STATUS_APPLIED,
                    applied_at=now,
                )

        PaymentTransaction.objects.create(
            order=order,
            provider=(
                region.default_payment_provider
                if order.payment_method == Order.PAYMENT_ONLINE and getattr(region, "default_payment_provider", "")
                else order.payment_method
            ),
            amount=order.grand_total,
            currency_code=order.currency_code,
            status=PaymentTransaction.STATUS_PENDING,
        )

        return order
