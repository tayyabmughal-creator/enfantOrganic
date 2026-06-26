import csv
import logging
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.http import FileResponse, HttpResponse
from django.utils.dateparse import parse_date
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from django.db import transaction
from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncMonth
from django.db.utils import OperationalError, ProgrammingError

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
    NewsletterSubscription,
    NotificationLog,
    Order,
    OrderItem,
    PaymentTransaction,
    PaymobRegionConfig,
    Product,
    ProductStock,
    PushDevice,
    Region,
    ReturnRequest,
    Review,
    ShippingRule,
    SiteSettings,
    TaxRate,
    Warehouse,
    CustomerAddress,
)
from ..api_serializers.admin_ops import (
    AdminAbandonedCartSerializer,
    AdminAuditLogSerializer,
    AdminBackInStockRequestSerializer,
    AdminBlogPostSerializer,
    AdminCartMilestoneSerializer,
    AdminCmsPageSerializer,
    AdminCategorySerializer,
    AdminCouponSerializer,
    AdminCustomerSerializer,
    AdminGiftCardSerializer,
    AdminHeroPromoCardSerializer,
    AdminInstagramPostSerializer,
    AdminOrderSerializer,
    AdminPaymentTransactionSerializer,
    AdminPaymobRegionConfigSerializer,
    AdminProductSerializer,
    AdminRegionSerializer,
    AdminReturnRequestSerializer,
    AdminReviewSerializer,
    AdminShippingRuleSerializer,
    AdminSiteSettingsSerializer,
    AdminProductStockSerializer,
    AdminStaffSerializer,
    AdminTaxRateSerializer,
    AdminWarehouseSerializer,
)
from ..notifications import notify_admins_low_stock, notify_admins_paid_order, notify_admins_payment_review
from ..api_serializers.checkout import (
    build_tax_breakdown,
    calculate_checkout_totals,
    calculate_shipping_quote,
    prepare_checkout_items,
    quantize_money,
)
from ..services.gift_cards import (
    GiftCardRedemptionError,
    finalize_online_gift_card_redemption,
    reopen_released_gift_card_redemption,
    release_pending_gift_card_redemption,
)
from ..services.admin_roles import (
    CAP_ABANDONED_EDIT,
    CAP_ABANDONED_VIEW,
    CAP_AUDIT_VIEW,
    CAP_CATEGORIES_EDIT,
    CAP_CATEGORIES_VIEW,
    CAP_CONTENT_EDIT,
    CAP_CONTENT_VIEW,
    CAP_COUPONS_EDIT,
    CAP_COUPONS_VIEW,
    CAP_CUSTOMERS_EDIT,
    CAP_CUSTOMERS_VIEW,
    CAP_DASHBOARD_VIEW,
    CAP_GIFTCARDS_EDIT,
    CAP_GIFTCARDS_VIEW,
    CAP_INVENTORY_EDIT,
    CAP_INVENTORY_VIEW,
    CAP_MODERATION_VIEW,
    CAP_ORDERS_EDIT,
    CAP_ORDERS_VIEW,
    CAP_PAYMENTS_EDIT,
    CAP_PAYMENTS_VIEW,
    CAP_PRODUCTS_EDIT,
    CAP_PRODUCTS_VIEW,
    CAP_REFUNDS_EDIT,
    CAP_REFUNDS_VIEW,
    CAP_REGIONS_EDIT,
    CAP_REGIONS_VIEW,
    CAP_REPORTS_VIEW,
    CAP_RETURNS_EDIT,
    CAP_RETURNS_VIEW,
    CAP_REVIEWS_EDIT,
    CAP_REVIEWS_VIEW,
    CAP_SHIPPING_EDIT,
    CAP_SHIPPING_VIEW,
    CAP_STAFF_MANAGE,
    build_admin_me_payload,
    ensure_default_admin_roles,
    has_admin_capability,
)
from ..services.admin_audit import log_admin_action, snapshot_instance
from ..services.invoice import generate_order_invoice
from ..services.pricing import apply_fx_conversion
from ..services.inventory_health import (
    get_inventory_health_threshold,
    inventory_health_queryset,
    serialize_inventory_health_products,
)
from ..services.payment_router import PaymentProviderError, refund as process_gateway_refund
from ..services.shipment import (
    ShipmentServiceError,
    create_order_shipment,
    refresh_order_tracking,
    should_auto_create_shipment,
    update_manual_tracking,
)
from ..services.stock import commit_reserved_inventory_for_order, reapply_order_inventory


logger = logging.getLogger(__name__)


# Cross-market analytics normalizes every storefront currency back to OMR.
# Single source of truth = Region.fx_rate (OMR -> region rate), so analytics can
# never drift from the rates used for product pricing / Paymob charging.
def analytics_to_omr_rates():
    """Map of {CURRENCY_CODE: rate-to-OMR} derived from each Region.fx_rate.

    Region.fx_rate is the rate FROM the base/OMR currency TO the region, so the
    rate back to OMR is its inverse. The base region (fx_rate == 1) maps to 1.
    """
    rates = {"OMR": Decimal("1.0")}
    for code, fx_rate in Region.objects.values_list("currency_code", "fx_rate"):
        currency = str(code or "").upper()
        fx = Decimal(fx_rate or 0)
        if not currency or fx <= 0:
            continue
        rates[currency] = (Decimal("1") / fx)
    return rates


def _sum_money_in_omr(queryset, amount_field):
    rows = queryset.values("currency_code").annotate(total=Sum(amount_field))
    rates = analytics_to_omr_rates()
    total = Decimal("0.0")
    for row in rows:
        currency = str(row.get("currency_code") or "OMR").upper()
        rate = rates.get(currency, Decimal("1.0"))
        total += Decimal(row.get("total") or 0) * rate
    return float(total)


def _analytics_money_total(rows):
    """Convert multi-currency order totals to OMR.

    Uses fx_rate_snapshot (captured at order creation) when available so that
    historic revenue figures don't shift when Region.fx_rate is updated later.
    Falls back to the current live rate for orders that pre-date the snapshot field.
    """
    live_rates = analytics_to_omr_rates()
    total = Decimal("0.0")
    for row in rows:
        currency = str(row.get("currency_code") or "OMR").upper()
        snapshot = row.get("fx_rate_snapshot")
        if snapshot is not None:
            fx = Decimal(snapshot)
            rate = (Decimal("1.0") / fx) if fx else live_rates.get(currency, Decimal("1.0"))
        else:
            rate = live_rates.get(currency, Decimal("1.0"))
        total += Decimal(row.get("total") or 0) * rate
    return float(total)


def _analytics_currency_normalization_metadata(*, applied):
    return {
        "applied": bool(applied),
        "base_currency": "OMR",
        "rates_to_omr": {code: float(rate) for code, rate in analytics_to_omr_rates().items()},
        "source": "region_fx_rate",
        "configurable": True,
    }


def _customer_identity(user_id=None, customer_email=""):
    if user_id is not None:
        return f"user:{user_id}"
    email = str(customer_email or "").strip().lower()
    if email:
        return f"email:{email}"
    return ""


def _distinct_customer_count(queryset):
    identities = set()
    for row in queryset.values("user_id", "customer_email").iterator():
        identity = _customer_identity(row.get("user_id"), row.get("customer_email"))
        if identity:
            identities.add(identity)
    return len(identities)


def _repeat_customer_stats(queryset):
    customer_order_counts = Counter()
    for row in queryset.values("user_id", "customer_email").iterator():
        identity = _customer_identity(row.get("user_id"), row.get("customer_email"))
        if identity:
            customer_order_counts[identity] += 1
    repeat_customers = sum(1 for count in customer_order_counts.values() if count > 1)
    return repeat_customers, len(customer_order_counts)


def _monthly_distinct_customer_rows(queryset, limit=12):
    monthly = defaultdict(set)
    for row in (
        queryset.annotate(month=TruncMonth("created_at"))
        .values("month", "user_id", "customer_email")
        .order_by("month")
        .iterator()
    ):
        month = row.get("month")
        if not month:
            continue
        identity = _customer_identity(row.get("user_id"), row.get("customer_email"))
        if identity:
            monthly[month].add(identity)

    return [
        {
            "label": month.strftime("%b %Y"),
            "value": len(monthly[month]),
        }
        for month in sorted(monthly.keys())[:limit]
    ]


def _repeat_purchase_counts_by_product(queryset):
    # Repeat customer count per product using stable customer identity:
    # user_id first, then customer_email fallback.
    product_customer_orders = defaultdict(set)
    for row in (
        queryset.filter(items__product_id__isnull=False)
        .values("id", "items__product_id", "user_id", "customer_email")
        .iterator()
    ):
        product_id = row.get("items__product_id")
        if not product_id:
            continue
        identity = _customer_identity(row.get("user_id"), row.get("customer_email"))
        if not identity:
            continue
        product_customer_orders[(product_id, identity)].add(row.get("id"))

    repeat_purchase_counts = Counter()
    for (product_id, _identity), order_ids in product_customer_orders.items():
        if len(order_ids) > 1:
            repeat_purchase_counts[product_id] += 1

    return {product_id: int(count) for product_id, count in repeat_purchase_counts.items()}


def _build_sales_channel_summary(current_orders, previous_orders, *, currency_code="OMR", convert_to_omr=False):
    labels = {
        Order.SALES_CHANNEL_ONLINE_STORE: "Online Store",
        Order.SALES_CHANNEL_DRAFT_ORDER: "Draft Orders",
    }
    colors = {
        Order.SALES_CHANNEL_ONLINE_STORE: "#20aeea",
        Order.SALES_CHANNEL_DRAFT_ORDER: "#7652e9",
    }
    channels = [Order.SALES_CHANNEL_ONLINE_STORE, Order.SALES_CHANNEL_DRAFT_ORDER]

    def totals_for(queryset, channel):
        channel_qs = queryset.filter(sales_channel=channel)
        if convert_to_omr:
            rows = channel_qs.values("currency_code", "fx_rate_snapshot").annotate(total=Sum("grand_total"))
            total = _analytics_money_total(rows)
        else:
            total = float(channel_qs.aggregate(total=Sum("grand_total"))["total"] or 0)
        return {
            "total": total,
            "orders": channel_qs.count(),
        }

    current = {channel: totals_for(current_orders, channel) for channel in channels}
    previous = {channel: totals_for(previous_orders, channel) for channel in channels}
    total_sales = sum(item["total"] for item in current.values())
    total_orders = sum(item["orders"] for item in current.values())

    def pct_change(current_value, previous_value):
        if not previous_value:
            return None
        return round(((current_value - previous_value) / previous_value) * 100, 1)

    return {
        "total_sales": total_sales,
        "total_orders": total_orders,
        "currency_code": "OMR" if convert_to_omr else currency_code,
        "channels": [
            {
                "key": channel,
                "label": labels[channel],
                "color": colors[channel],
                "sales": current[channel]["total"],
                "orders": current[channel]["orders"],
                "share": round((current[channel]["total"] / total_sales) * 100, 1) if total_sales else 0,
                "delta": pct_change(current[channel]["total"], previous[channel]["total"]),
            }
            for channel in channels
        ],
    }


DRAFT_CUSTOMER_SEARCH_LIMIT = 20


class DraftOrderItemInputSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    quantity = serializers.IntegerField(min_value=1)
    selected_options_text = serializers.CharField(required=False, allow_blank=True)


class DraftOrderCustomerInputSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, allow_null=True)
    create_account = serializers.BooleanField(required=False, default=False)
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=60)
    address_line_1 = serializers.CharField(required=False, allow_blank=True, max_length=255)
    address_line_2 = serializers.CharField(required=False, allow_blank=True, max_length=255)
    building = serializers.CharField(required=False, allow_blank=True, max_length=120)
    floor = serializers.CharField(required=False, allow_blank=True, max_length=60)
    apartment = serializers.CharField(required=False, allow_blank=True, max_length=120)
    landmark = serializers.CharField(required=False, allow_blank=True, max_length=255)
    area = serializers.CharField(required=False, allow_blank=True, max_length=120)
    city = serializers.CharField(required=False, allow_blank=True, max_length=120)
    postcode = serializers.CharField(required=False, allow_blank=True, max_length=40)
    country = serializers.CharField(required=False, allow_blank=True, max_length=120)
    formatted_address = serializers.CharField(required=False, allow_blank=True, max_length=500)
    place_id = serializers.CharField(required=False, allow_blank=True, max_length=255)
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
    location_notes = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.CharField(required=False, allow_blank=True)


class DraftOrderUpsertSerializer(serializers.Serializer):
    region = serializers.SlugField()
    locale = serializers.CharField(required=False, allow_blank=True, default="en", max_length=8)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    payment_method = serializers.ChoiceField(
        required=False,
        choices=[choice[0] for choice in Order.PAYMENT_METHOD_CHOICES],
        default=Order.PAYMENT_COD,
    )
    customer = DraftOrderCustomerInputSerializer()
    items = DraftOrderItemInputSerializer(many=True)

    def validate_region(self, value):
        region = Region.objects.filter(code=value, is_active=True).first()
        if not region:
            raise serializers.ValidationError("Invalid or inactive region.")
        return region

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one product is required.")
        return value


def _clean_text(value):
    return str(value or "").strip()


def _join_full_name(first_name, last_name):
    joined = " ".join(part for part in [_clean_text(first_name), _clean_text(last_name)] if part).strip()
    return joined


def _default_address_for_user(user):
    if not user:
        return None
    return user.addresses.order_by("-is_default", "-updated_at", "-id").first()


def _username_base_from_customer_data(*, first_name="", last_name="", email="", phone=""):
    if email:
        base = str(email).split("@", 1)[0]
    elif phone:
        base = "".join(ch for ch in str(phone) if ch.isalnum())
    else:
        base = _join_full_name(first_name, last_name).replace(" ", ".")
    cleaned = "".join(ch for ch in str(base).lower() if ch.isalnum() or ch in "._-")
    return cleaned[:120] or "customer"


def _unique_username(*, first_name="", last_name="", email="", phone=""):
    UserModel = get_user_model()
    base = _username_base_from_customer_data(
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
    )
    username = base
    suffix = 1
    while UserModel.objects.filter(username=username).exists():
        suffix += 1
        username = f"{base[:100]}-{suffix}"
    return username


def _resolve_user_for_draft_customer(*, actor, customer_data):
    UserModel = get_user_model()
    user_id = customer_data.get("user_id")
    if user_id:
        user = UserModel.objects.filter(pk=user_id).first()
        if not user:
            raise serializers.ValidationError({"customer": {"user_id": "Selected customer does not exist."}})
        return user

    email = _clean_text(customer_data.get("email", "")).lower()
    if email:
        existing = UserModel.objects.filter(email__iexact=email).first()
        if existing:
            return existing

    if not bool(customer_data.get("create_account")):
        return None

    if not has_admin_capability(actor, CAP_CUSTOMERS_EDIT):
        return None

    user = UserModel(
        username=_unique_username(
            first_name=customer_data.get("first_name", ""),
            last_name=customer_data.get("last_name", ""),
            email=email,
            phone=customer_data.get("phone", ""),
        ),
        email=email,
        first_name=_clean_text(customer_data.get("first_name", "")),
        last_name=_clean_text(customer_data.get("last_name", "")),
        is_active=True,
        is_staff=False,
    )
    user.set_unusable_password()
    user.save()
    return user


def _normalized_draft_customer(*, user, customer_data, region):
    default_address = _default_address_for_user(user)
    first_name = _clean_text(customer_data.get("first_name")) or _clean_text(getattr(user, "first_name", ""))
    last_name = _clean_text(customer_data.get("last_name")) or _clean_text(getattr(user, "last_name", ""))
    email = _clean_text(customer_data.get("email")) or _clean_text(getattr(user, "email", ""))
    phone = (
        _clean_text(customer_data.get("phone"))
        or _clean_text(getattr(default_address, "phone", ""))
        or "N/A"
    )
    customer_name = (
        _join_full_name(first_name, last_name)
        or _clean_text(getattr(user, "get_full_name", lambda: "")())
        or email
        or phone
        or "Guest Customer"
    )

    resolved = {
        "name": customer_name,
        "email": email,
        "phone": phone,
        "first_name": first_name,
        "last_name": last_name,
        "address_line_1": _clean_text(customer_data.get("address_line_1")) or _clean_text(getattr(default_address, "address_line_1", "")) or "N/A",
        "address_line_2": _clean_text(customer_data.get("address_line_2")) or _clean_text(getattr(default_address, "address_line_2", "")),
        "building": _clean_text(customer_data.get("building")) or _clean_text(getattr(default_address, "building", "")),
        "floor": _clean_text(customer_data.get("floor")) or _clean_text(getattr(default_address, "floor", "")),
        "apartment": _clean_text(customer_data.get("apartment")) or _clean_text(getattr(default_address, "apartment", "")),
        "landmark": _clean_text(customer_data.get("landmark")) or _clean_text(getattr(default_address, "landmark", "")),
        "area": _clean_text(customer_data.get("area")) or _clean_text(getattr(default_address, "area", "")),
        "city": _clean_text(customer_data.get("city")) or _clean_text(getattr(default_address, "city", "")) or _clean_text(region.name_en),
        "postcode": _clean_text(customer_data.get("postcode")) or _clean_text(getattr(default_address, "postcode", "")),
        "country": _clean_text(customer_data.get("country")) or _clean_text(getattr(default_address, "country", "")) or _clean_text(region.name_en),
        "formatted_address": _clean_text(customer_data.get("formatted_address")) or _clean_text(getattr(default_address, "formatted_address", "")),
        "place_id": _clean_text(customer_data.get("place_id")) or _clean_text(getattr(default_address, "place_id", "")),
        "latitude": customer_data.get("latitude") if customer_data.get("latitude") is not None else getattr(default_address, "latitude", None),
        "longitude": customer_data.get("longitude") if customer_data.get("longitude") is not None else getattr(default_address, "longitude", None),
        "location_notes": _clean_text(customer_data.get("location_notes")) or _clean_text(getattr(default_address, "location_notes", "")),
        "notes": _clean_text(customer_data.get("notes")),
        "tags": _clean_text(customer_data.get("tags")),
    }
    return resolved


def _upsert_default_customer_address(*, user, customer, customer_data):
    if not user:
        return
    address_input_present = any(
        _clean_text(customer_data.get(key))
        for key in (
            "address_line_1",
            "address_line_2",
            "city",
            "country",
            "phone",
            "postcode",
            "area",
        )
    )
    if not address_input_present:
        return

    address = user.addresses.order_by("-is_default", "-updated_at", "-id").first()
    if address is None:
        address = CustomerAddress(user=user)

    address.full_name = customer["name"]
    address.phone = customer["phone"]
    address.address_line_1 = customer["address_line_1"]
    address.address_line_2 = customer["address_line_2"]
    address.building = customer["building"]
    address.floor = customer["floor"]
    address.apartment = customer["apartment"]
    address.landmark = customer["landmark"]
    address.area = customer["area"]
    address.city = customer["city"]
    address.postcode = customer["postcode"]
    address.country = customer["country"]
    address.formatted_address = customer["formatted_address"]
    address.place_id = customer["place_id"]
    address.latitude = customer["latitude"]
    address.longitude = customer["longitude"]
    address.location_notes = customer["location_notes"]
    if address.pk is None and not user.addresses.filter(is_default=True).exists():
        address.is_default = True
    address.save()


def _replace_draft_order_items(*, order, region, prepared_items, totals):
    order.items.all().delete()

    subtotal = quantize_money(totals["subtotal"])
    subtotal_after_discount = quantize_money(totals["subtotal_after_discount"])
    item_entries = []

    for prepared_item in prepared_items:
        line_total = quantize_money(prepared_item["line_total"])
        if subtotal > 0:
            discount_share = quantize_money(totals["discount_total"] * line_total / subtotal)
        else:
            discount_share = Decimal("0.00")
        line_after_discount = quantize_money(max(line_total - discount_share, Decimal("0.00")))

        if totals["tax_applies_to_shipping"] and subtotal_after_discount > 0:
            shipping_share = quantize_money(totals["shipping_total"] * line_after_discount / subtotal_after_discount)
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
        variant_snapshot = prepared_item.get("variant") or None
        order_item_payload = {
            key: value
            for key, value in prepared_item.items()
            if key not in {"variant", "variant_id"}
        }
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
                "variant_id": prepared_item.get("variant_id", ""),
                "variant": variant_snapshot,
                "warehouse_allocations": [],
                "inventory_committed": False,
                "inventory_mode": "draft_unreserved",
            },
            **order_item_payload,
        )


@transaction.atomic
def _upsert_draft_order(*, request, payload, order=None):
    region = payload["region"]
    customer_data = payload["customer"]
    actor = request.user if request else None
    user = _resolve_user_for_draft_customer(actor=actor, customer_data=customer_data)
    customer = _normalized_draft_customer(user=user, customer_data=customer_data, region=region)
    _upsert_default_customer_address(user=user, customer=customer, customer_data=customer_data)
    items_data = payload["items"]
    subtotal, prepared_items = prepare_checkout_items(items_data, region, lock_products=True)

    shipping_quote = calculate_shipping_quote(
        region,
        subtotal,
        coupon=None,
        city=customer.get("city", ""),
        area=customer.get("area", ""),
    )
    totals = calculate_checkout_totals(
        region=region,
        subtotal=subtotal,
        discount_total=Decimal("0.00"),
        shipping_total=shipping_quote["shipping_total"],
    )

    if order is None:
        order = Order(
            sales_channel=Order.SALES_CHANNEL_DRAFT_ORDER,
            status=Order.STATUS_PENDING,
            payment_status=Order.PAYMENT_UNPAID,
        )

    order.user = user
    order.region = region
    order.locale = _clean_text(payload.get("locale", "")) or "en"
    order.customer_name = customer["name"]
    order.customer_email = customer["email"]
    order.customer_phone = customer["phone"]
    order.address_line_1 = customer["address_line_1"]
    order.address_line_2 = customer["address_line_2"]
    order.building = customer["building"]
    order.floor = customer["floor"]
    order.apartment = customer["apartment"]
    order.landmark = customer["landmark"]
    order.area = customer["area"]
    order.city = customer["city"]
    order.postcode = customer["postcode"]
    order.country = customer["country"]
    order.formatted_address = customer["formatted_address"]
    order.place_id = customer["place_id"]
    order.latitude = customer["latitude"]
    order.longitude = customer["longitude"]
    order.location_notes = customer["location_notes"]
    order.notes = _clean_text(payload.get("notes", ""))
    order.customer_snapshot = {
        "name": customer["name"],
        "first_name": customer.get("first_name", ""),
        "last_name": customer.get("last_name", ""),
        "email": customer["email"],
        "phone": customer["phone"],
        "notes": customer.get("notes", ""),
        "tags": customer.get("tags", ""),
        "source": "draft_order_admin",
        "user_id": user.id if user else None,
    }
    order.address_snapshot = {
        "address_line_1": customer["address_line_1"],
        "address_line_2": customer["address_line_2"],
        "building": customer["building"],
        "floor": customer["floor"],
        "apartment": customer["apartment"],
        "landmark": customer["landmark"],
        "area": customer["area"],
        "city": customer["city"],
        "postcode": customer["postcode"],
        "country": customer["country"],
        "formatted_address": customer["formatted_address"],
        "place_id": customer["place_id"],
        "latitude": str(customer["latitude"]) if customer["latitude"] is not None else None,
        "longitude": str(customer["longitude"]) if customer["longitude"] is not None else None,
        "location_notes": customer["location_notes"],
    }
    order.coupon_code = ""
    order.discount_total = totals["discount_total"]
    order.gift_card_code = ""
    order.gift_card_amount = Decimal("0.00")
    order.subtotal = totals["subtotal"]
    order.shipping_fee = shipping_quote["shipping_total"]
    order.shipping_method = shipping_quote["shipping_method"]
    order.shipping_carrier_name = shipping_quote["carrier_name"]
    order.shipping_eta_min_days = shipping_quote["eta_min_days"]
    order.shipping_eta_max_days = shipping_quote["eta_max_days"]
    order.shipping_total = totals["shipping_total"]
    order.taxable_amount = totals["taxable_amount"]
    order.tax_rate = totals["tax_rate"]
    order.tax_total = totals["tax_total"]
    order.tax_inclusive = totals["tax_inclusive"]
    order.tax_applies_to_shipping = totals["tax_applies_to_shipping"]
    order.tax_label = totals["tax_label"]
    order.tax_breakdown = build_tax_breakdown(totals)
    order.grand_total = totals["grand_total"]
    order.currency_code = region.currency_code
    if order.fx_rate_snapshot is None:
        order.fx_rate_snapshot = region.fx_rate
    order.sales_channel = Order.SALES_CHANNEL_DRAFT_ORDER
    order.payment_method = payload.get("payment_method") or order.payment_method or Order.PAYMENT_COD
    order.save()

    _replace_draft_order_items(
        order=order,
        region=region,
        prepared_items=prepared_items,
        totals=totals,
    )

    return order


def _resolve_market_code(value):
    market_filter = _clean_text(value).lower()
    aliases = {
        "om": "om",
        "oman": "om",
        "ae": "ae",
        "uae": "ae",
        "sa": "sa",
        "ksa": "sa",
        "saudi": "sa",
        "saudi-arabia": "sa",
        "saudi_arabia": "sa",
    }
    return aliases.get(market_filter, "")


class IsStaffUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_staff)


class HasAdminCapability(permissions.BasePermission):
    message = "You do not have permission to access this admin resource."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or not user.is_staff:
            return False

        if user.is_superuser:
            return True

        if hasattr(view, "get_required_admin_capabilities"):
            required_capabilities = view.get_required_admin_capabilities(request)
        else:
            if request.method in permissions.SAFE_METHODS:
                required_capabilities = getattr(view, "admin_read_capabilities", ())
            else:
                required_capabilities = getattr(view, "admin_write_capabilities", ()) or getattr(
                    view,
                    "admin_read_capabilities",
                    (),
                )

        if not required_capabilities:
            # Safe-by-default: require explicit opt-in for staff-only access
            # when a view does not declare capability requirements.
            return bool(getattr(view, "allow_staff_without_capability", False))

        return all(has_admin_capability(user, capability) for capability in required_capabilities)


class AdminCapabilityMixin:
    admin_read_capabilities = ()
    admin_write_capabilities = ()
    allow_staff_without_capability = False
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]

    def get_required_admin_capabilities(self, request):
        if request.method in permissions.SAFE_METHODS:
            return tuple(self.admin_read_capabilities or self.admin_write_capabilities or ())
        return tuple(self.admin_write_capabilities or self.admin_read_capabilities or ())


class AdminMeView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    @extend_schema(responses=dict)
    def get(self, request):
        ensure_default_admin_roles()
        return Response(build_admin_me_payload(request.user))


class AdminDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_DASHBOARD_VIEW,)

    @extend_schema(responses=dict)
    def get(self, request):
        top_metric = str(request.query_params.get("top_metric", "rating") or "rating").strip().lower()
        if top_metric not in {"rating", "revenue", "units_sold", "orders", "repeat_purchase"}:
            top_metric = "rating"

        top_date_range = str(request.query_params.get("top_date_range", "all_time") or "all_time").strip().lower()
        if top_date_range not in {"all_time", "last_7_days", "last_30_days", "last_60_days", "last_90_days", "custom_date"}:
            top_date_range = "all_time"

        top_market = str(request.query_params.get("top_market", "all") or "all").strip().lower()
        if top_market not in {"all", "om", "ae", "sa"}:
            top_market = "all"
        top_market_region = Region.objects.filter(code=top_market, is_active=True).only("currency_code").first() if top_market != "all" else None
        top_products_currency_code = top_market_region.currency_code if top_market_region else "OMR"
        dashboard_currency_code = top_market_region.currency_code if top_market_region else "OMR"

        now = timezone.now()
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)

        User = get_user_model()
        base_orders = Order.objects.exclude(status=Order.STATUS_FAILED)
        if top_market != "all":
            base_orders = base_orders.filter(region__code=top_market)

        start_raw = str(request.query_params.get("top_start_date", "") or "").strip()
        end_raw = str(request.query_params.get("top_end_date", "") or "").strip()
        start_date = parse_date(start_raw)
        end_date = parse_date(end_raw)
        custom_range_valid = bool(start_date and end_date)
        if custom_range_valid and start_date > end_date:
            start_date, end_date = end_date, start_date

        def _as_day_start(target_date):
            return timezone.make_aware(datetime.combine(target_date, datetime.min.time()))

        def _as_day_end(target_date):
            return timezone.make_aware(datetime.combine(target_date, datetime.max.time()))

        scoped_orders = base_orders
        if top_date_range == "custom_date":
            if custom_range_valid:
                scoped_orders = scoped_orders.filter(
                    created_at__gte=_as_day_start(start_date),
                    created_at__lte=_as_day_end(end_date),
                )
        elif top_date_range != "all_time":
            day_window = {
                "last_7_days": 7,
                "last_30_days": 30,
                "last_60_days": 60,
                "last_90_days": 90,
            }[top_date_range]
            scoped_orders = scoped_orders.filter(created_at__gte=now - timedelta(days=day_window))

        # Include ALL placed orders (paid, COD, unpaid) — exclude only cancelled/failed/refunded
        _excluded_statuses = [Order.STATUS_CANCELLED, Order.STATUS_FAILED, Order.STATUS_REFUNDED]
        scoped_active_orders = scoped_orders.exclude(status__in=_excluded_statuses)
        scoped_paid_orders = scoped_active_orders  # keep alias for downstream compat
        scoped_paid_orders_count = scoped_active_orders.count()

        if top_date_range == "all_time":
            current_period_orders = base_orders
            previous_period_orders = base_orders.none()
        elif top_date_range in {"last_7_days", "last_30_days", "last_60_days", "last_90_days"}:
            day_window = {
                "last_7_days": 7,
                "last_30_days": 30,
                "last_60_days": 60,
                "last_90_days": 90,
            }[top_date_range]
            current_period_start = now - timedelta(days=day_window)
            previous_period_start = current_period_start - timedelta(days=day_window)
            current_period_orders = base_orders.filter(created_at__gte=current_period_start, created_at__lte=now)
            previous_period_orders = base_orders.filter(created_at__gte=previous_period_start, created_at__lt=current_period_start)
        elif top_date_range == "custom_date" and custom_range_valid:
            current_period_start = _as_day_start(start_date)
            current_period_end = _as_day_end(end_date)
            range_days = max(1, (end_date - start_date).days + 1)
            previous_period_start = current_period_start - timedelta(days=range_days)
            current_period_orders = base_orders.filter(created_at__gte=current_period_start, created_at__lte=current_period_end)
            previous_period_orders = base_orders.filter(created_at__gte=previous_period_start, created_at__lt=current_period_start)
        else:
            current_period_orders = base_orders.filter(created_at__gte=this_month_start)
            previous_period_orders = base_orders.filter(created_at__gte=last_month_start, created_at__lt=this_month_start)

        current_period_paid = current_period_orders.exclude(status__in=_excluded_statuses)
        previous_period_paid = previous_period_orders.exclude(status__in=_excluded_statuses)

        base_abandoned_carts = AbandonedCart.objects.all()
        if top_market != "all":
            base_abandoned_carts = base_abandoned_carts.filter(region__code=top_market)

        if top_date_range == "all_time":
            current_period_carts = base_abandoned_carts
            previous_period_carts = AbandonedCart.objects.none()
        elif top_date_range in {"last_7_days", "last_30_days", "last_60_days", "last_90_days"}:
            day_window = {
                "last_7_days": 7,
                "last_30_days": 30,
                "last_60_days": 60,
                "last_90_days": 90,
            }[top_date_range]
            current_period_start = now - timedelta(days=day_window)
            previous_period_start = current_period_start - timedelta(days=day_window)
            current_period_carts = base_abandoned_carts.filter(abandoned_at__gte=current_period_start, abandoned_at__lte=now)
            previous_period_carts = base_abandoned_carts.filter(abandoned_at__gte=previous_period_start, abandoned_at__lt=current_period_start)
        elif top_date_range == "custom_date" and custom_range_valid:
            current_period_start = _as_day_start(start_date)
            current_period_end = _as_day_end(end_date)
            range_days = max(1, (end_date - start_date).days + 1)
            previous_period_start = current_period_start - timedelta(days=range_days)
            current_period_carts = base_abandoned_carts.filter(abandoned_at__gte=current_period_start, abandoned_at__lte=current_period_end)
            previous_period_carts = base_abandoned_carts.filter(abandoned_at__gte=previous_period_start, abandoned_at__lt=current_period_start)
        else:
            current_period_carts = base_abandoned_carts.filter(abandoned_at__gte=this_month_start)
            previous_period_carts = base_abandoned_carts.filter(abandoned_at__gte=last_month_start, abandoned_at__lt=this_month_start)

        inventory_health_threshold = get_inventory_health_threshold()
        inventory_health = inventory_health_queryset(threshold=inventory_health_threshold)
        inventory_health_count = inventory_health.count()
        inventory_health_products = serialize_inventory_health_products(
            threshold=inventory_health_threshold,
            limit=5,
            request=request,
        )

        if top_market == "all":
            total_revenue = _sum_money_in_omr(scoped_paid_orders, "grand_total")
        else:
            total_revenue = float(scoped_paid_orders.aggregate(total=Sum("grand_total"))["total"] or 0)
        total_orders = scoped_orders.count()
        total_customers = _distinct_customer_count(scoped_orders)
        if top_market == "all":
            total_products = Product.objects.filter(is_published=True).count()
        else:
            total_products = (
                Product.objects.filter(is_published=True, prices__region__code=top_market)
                .distinct()
                .count()
            )
        pending_orders = scoped_orders.filter(status=Order.STATUS_PENDING).count()

        if top_market == "all":
            monthly_revenue = _sum_money_in_omr(current_period_paid, "grand_total")
        else:
            monthly_revenue = float(current_period_paid.aggregate(total=Sum("grand_total"))["total"] or 0)
        monthly_orders = current_period_orders.count()
        monthly_customers = _distinct_customer_count(current_period_orders)

        if top_market == "all":
            prev_revenue = _sum_money_in_omr(previous_period_paid, "grand_total")
        else:
            prev_revenue = float(previous_period_paid.aggregate(total=Sum("grand_total"))["total"] or 0)
        prev_orders = previous_period_orders.count()
        prev_customers = _distinct_customer_count(previous_period_orders)

        # Conversion breakdown using real AnalyticsEvent data.
        # Period window mirrors current_period_orders (this month / last N days / custom range).
        if top_date_range == "all_time":
            event_period_start = None
            event_prev_start = None
            event_prev_end = None
        elif top_date_range in {"last_7_days", "last_30_days", "last_60_days", "last_90_days"}:
            _dw = {"last_7_days": 7, "last_30_days": 30, "last_60_days": 60, "last_90_days": 90}[top_date_range]
            event_period_start = now - timedelta(days=_dw)
            event_prev_start = event_period_start - timedelta(days=_dw)
            event_prev_end = event_period_start
        elif top_date_range == "custom_date" and custom_range_valid:
            event_period_start = _as_day_start(start_date)
            _range_days = max(1, (end_date - start_date).days + 1)
            event_prev_start = event_period_start - timedelta(days=_range_days)
            event_prev_end = event_period_start
        else:
            event_period_start = this_month_start
            event_prev_start = last_month_start
            event_prev_end = this_month_start

        def _period_events(start=None, end=None):
            qs = AnalyticsEvent.objects.all()
            if start is not None:
                qs = qs.filter(created_at__gte=start)
            if end is not None:
                qs = qs.filter(created_at__lt=end)
            if top_market != "all":
                qs = qs.filter(region__code=top_market)
            return qs

        try:
            curr_events = _period_events(event_period_start)
            prev_events = _period_events(event_prev_start, event_prev_end) if event_prev_start is not None else AnalyticsEvent.objects.none()

            current_sessions = curr_events.filter(
                event_type=AnalyticsEvent.EVENT_PAGE_VIEW
            ).values("session_key").distinct().count()
            previous_sessions = prev_events.filter(
                event_type=AnalyticsEvent.EVENT_PAGE_VIEW
            ).values("session_key").distinct().count()

            current_added_to_cart = curr_events.filter(
                event_type=AnalyticsEvent.EVENT_ADD_TO_CART
            ).values("session_key").distinct().count()
            previous_added_to_cart = prev_events.filter(
                event_type=AnalyticsEvent.EVENT_ADD_TO_CART
            ).values("session_key").distinct().count()

            current_checkout = curr_events.filter(
                event_type=AnalyticsEvent.EVENT_CHECKOUT_INITIATED
            ).values("session_key").distinct().count()
            previous_checkout = prev_events.filter(
                event_type=AnalyticsEvent.EVENT_CHECKOUT_INITIATED
            ).values("session_key").distinct().count()
            current_event_total = curr_events.count()
            latest_event_at = curr_events.order_by("-created_at").values_list("created_at", flat=True).first()
        except (OperationalError, ProgrammingError):
            current_sessions = 0
            previous_sessions = 0
            current_added_to_cart = 0
            previous_added_to_cart = 0
            current_checkout = 0
            previous_checkout = 0
            current_event_total = 0
            latest_event_at = None

        current_completed = current_period_paid.count()
        previous_completed = previous_period_paid.count()

        def stage_rate(count, sessions):
            if not sessions:
                return 0.0
            return round(min(100.0, (count / sessions) * 100), 2)

        current_overall_conversion = stage_rate(current_completed, current_sessions)
        previous_overall_conversion = stage_rate(previous_completed, previous_sessions)

        def pct_change(current, previous):
            if not previous:
                return None
            return round(((current - previous) / previous) * 100, 1)

        avg_order_value = round(total_revenue / scoped_paid_orders_count, 2) if scoped_paid_orders_count else 0

        # Payment success rate: paid orders / all non-failed orders.
        # Keep the legacy conversion_rate key for compatibility.
        payment_success_rate = round((scoped_paid_orders_count / total_orders) * 100, 1) if total_orders else 0
        conversion_rate = payment_success_rate
        delta_label = "All-time snapshot" if top_date_range == "all_time" else "Selected period vs previous period"

        # Real repeat rate: customers with >1 order / customers with any order.
        # Customer identity uses user_id first with customer_email fallback.
        repeat_customers, total_customers_with_orders = _repeat_customer_stats(scoped_orders)
        repeat_rate = round((repeat_customers / total_customers_with_orders) * 100, 1) if total_customers_with_orders else 0

        # Checkout abandonment rate: sessions that reached checkout but didn't complete.
        # Uses AnalyticsEvent funnel data — more accurate than AbandonedCart model
        # which only has records when customers enter email on checkout page.
        abandonment_rate = (
            round((current_checkout - current_completed) / current_checkout * 100, 1)
            if current_checkout > 0
            else 0
        )

        # Delta calculations for KPI cards that previously always showed "—".
        prev_paid_count = previous_period_paid.count()
        prev_avg = (
            float(previous_period_paid.aggregate(total=Sum("grand_total"))["total"] or 0) / prev_paid_count
            if prev_paid_count else 0
        )
        avg_order_value_delta = pct_change(avg_order_value, prev_avg)

        prev_total_orders = previous_period_orders.count()
        prev_payment_rate = round((prev_paid_count / prev_total_orders) * 100, 1) if prev_total_orders else 0
        payment_success_delta = pct_change(payment_success_rate, prev_payment_rate)

        prev_repeat_customers, prev_total_with_orders = _repeat_customer_stats(previous_period_orders)
        prev_repeat_rate = round((prev_repeat_customers / prev_total_with_orders) * 100, 1) if prev_total_with_orders else 0
        repeat_delta = pct_change(repeat_rate, prev_repeat_rate)

        if top_market == "all":
            by_month_currency = (
                scoped_paid_orders.annotate(month=TruncMonth("created_at"))
                .values("month", "currency_code", "fx_rate_snapshot")
                .annotate(total=Sum("grand_total"))
                .order_by("month")
            )
            month_map = {}
            live_rates = analytics_to_omr_rates()
            for row in by_month_currency:
                month = row.get("month")
                if not month:
                    continue
                currency = str(row.get("currency_code") or "OMR").upper()
                snapshot = row.get("fx_rate_snapshot")
                if snapshot is not None:
                    fx = Decimal(snapshot)
                    rate = (Decimal("1.0") / fx) if fx else live_rates.get(currency, Decimal("1.0"))
                else:
                    rate = live_rates.get(currency, Decimal("1.0"))
                converted = Decimal(row.get("total") or 0) * rate
                month_map[month] = month_map.get(month, Decimal("0.0")) + converted
            revenue_trend = [
                {
                    "label": month.strftime("%b %Y"),
                    "value": float(total),
                }
                for month, total in sorted(month_map.items(), key=lambda item: item[0])[:12]
            ]
        else:
            revenue_trend = [
                {
                    "label": item["month"].strftime("%b %Y"),
                    "value": float(item["total"] or 0),
                }
                for item in scoped_paid_orders.annotate(month=TruncMonth("created_at"))
                .values("month")
                .annotate(total=Sum("grand_total"))
                .order_by("month")[:12]
            ]
        # Orders trend — monthly order count for sparkline
        orders_trend = [
            {
                "label": item["month"].strftime("%b %Y"),
                "value": item["total"],
            }
            for item in scoped_orders.annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(total=Count("id"))
            .order_by("month")[:12]
        ]

        # Customers trend — monthly distinct customers using user_id/email fallback.
        customers_trend = _monthly_distinct_customer_rows(scoped_orders, limit=12)

        # Status mix follows the active dashboard scope (date + market).
        status_mix = list(scoped_orders.values("status").annotate(count=Count("id")).order_by("status"))
        sales_channel_orders = scoped_orders.exclude(status__in=_excluded_statuses)
        previous_sales_channel_orders = previous_period_orders.exclude(status__in=_excluded_statuses)
        sales_by_channel = _build_sales_channel_summary(
            sales_channel_orders,
            previous_sales_channel_orders,
            currency_code=dashboard_currency_code,
            convert_to_omr=top_market == "all",
        )

        top_paid_orders = scoped_paid_orders

        top_products = []
        metric_label = {
            "rating": "By rating (sold products)",
            "revenue": "By revenue",
            "units_sold": "By units sold",
            "orders": "By orders",
            "repeat_purchase": "By repeat purchase",
        }[top_metric]

        if top_metric == "rating":
            sold_product_ids = (
                top_paid_orders
                .values_list("items__product_id", flat=True)
                .exclude(items__product_id__isnull=True)
                .distinct()
            )
            top_products = list(
                Product.objects.filter(is_published=True, id__in=sold_product_ids)
                .order_by("-rating", "-review_count")
                .values("slug", "name_en", "stock_quantity", "rating", "review_count")[:8]
            )
            for product in top_products:
                rating = float(product.get("rating") or 0)
                product["sales"] = 0
                product["orders_count"] = 0
                product["revenue"] = 0.0
                product["repeat_purchase_count"] = 0
                product["metric"] = top_metric
                product["metric_label"] = metric_label
                product["metric_value"] = rating
                product["metric_value_display"] = f"{rating:.1f}★"
                product["currency_code"] = top_products_currency_code
        else:
            if top_market == "all":
                raw_rows = list(
                    Product.objects.filter(
                        is_published=True,
                        orderitem__order__in=top_paid_orders,
                    )
                    .values("id", "slug", "name_en", "stock_quantity", "orderitem__order__currency_code")
                    .annotate(
                        revenue=Sum("orderitem__line_total"),
                        units_sold=Sum("orderitem__quantity"),
                        orders_count=Count("orderitem__order_id", distinct=True),
                    )
                )
                product_map = {}
                rates = analytics_to_omr_rates()
                for raw in raw_rows:
                    product_id = raw["id"]
                    currency = str(raw.get("orderitem__order__currency_code") or "OMR").upper()
                    rate = float(rates.get(currency, Decimal("1.0")))
                    bucket = product_map.setdefault(
                        product_id,
                        {
                            "id": product_id,
                            "slug": raw.get("slug"),
                            "name_en": raw.get("name_en"),
                            "stock_quantity": raw.get("stock_quantity"),
                            "revenue": 0.0,
                            "units_sold": 0,
                            "orders_count": 0,
                        },
                    )
                    bucket["revenue"] += float(raw.get("revenue") or 0) * rate
                    bucket["units_sold"] += int(raw.get("units_sold") or 0)
                    bucket["orders_count"] += int(raw.get("orders_count") or 0)
                top_product_rows = list(product_map.values())
            else:
                top_product_rows = list(
                    Product.objects.filter(
                        is_published=True,
                        orderitem__order__in=top_paid_orders,
                    )
                    .values("id", "slug", "name_en", "stock_quantity")
                    .annotate(
                        revenue=Sum("orderitem__line_total"),
                        units_sold=Sum("orderitem__quantity"),
                        orders_count=Count("orderitem__order_id", distinct=True),
                    )
                )

            repeat_purchase_counts = _repeat_purchase_counts_by_product(top_paid_orders)

            for row in top_product_rows:
                row["revenue"] = float(row.get("revenue") or 0)
                row["units_sold"] = int(row.get("units_sold") or 0)
                row["orders_count"] = int(row.get("orders_count") or 0)
                row["repeat_purchase_count"] = int(repeat_purchase_counts.get(row["id"], 0))

            if top_metric == "revenue":
                top_product_rows.sort(key=lambda row: (row["revenue"], row["orders_count"]), reverse=True)
            elif top_metric == "units_sold":
                top_product_rows.sort(key=lambda row: (row["units_sold"], row["orders_count"]), reverse=True)
            elif top_metric == "orders":
                top_product_rows.sort(key=lambda row: (row["orders_count"], row["units_sold"]), reverse=True)
            elif top_metric == "repeat_purchase":
                top_product_rows.sort(
                    key=lambda row: (row["repeat_purchase_count"], row["orders_count"], row["units_sold"]),
                    reverse=True,
                )

            top_products = []
            for row in top_product_rows[:8]:
                if top_metric == "revenue":
                    metric_value = row["revenue"]
                elif top_metric == "units_sold":
                    metric_value = row["units_sold"]
                elif top_metric == "orders":
                    metric_value = row["orders_count"]
                else:
                    metric_value = row["repeat_purchase_count"]

                top_products.append(
                    {
                        "slug": row.get("slug"),
                        "name_en": row.get("name_en"),
                        "stock_quantity": row.get("stock_quantity"),
                        "sales": row["units_sold"],
                        "orders_count": row["orders_count"],
                        "revenue": row["revenue"],
                        "repeat_purchase_count": row["repeat_purchase_count"],
                        "metric": top_metric,
                        "metric_label": metric_label,
                        "metric_value": metric_value,
                        "currency_code": top_products_currency_code,
                    }
                )

        conversion_note = (
            "All-time session-based funnel. Completed step uses all paid orders in the selected market scope."
            if top_date_range == "all_time"
            else "Session-based funnel. Completed step uses paid orders in the same period."
        )
        if current_event_total == 0:
            conversion_note = (
                "No storefront analytics events were captured for the selected scope yet. "
                "Page views, add-to-cart, and checkout starts must reach /api/analytics/event/ before this funnel can populate."
            )

        return Response(
            {
                "revenue": total_revenue,
                "currency_code": dashboard_currency_code,
                "analytics_currency_normalization": _analytics_currency_normalization_metadata(
                    applied=(top_market == "all")
                ),
                "revenue_delta": pct_change(monthly_revenue, prev_revenue),
                "monthly_revenue": monthly_revenue,
                "orders": scoped_paid_orders_count,
                "orders_delta": pct_change(monthly_orders, prev_orders),
                "pending_orders": pending_orders,
                "paid_orders": scoped_paid_orders_count,
                "customers": total_customers,
                "customers_delta": pct_change(monthly_customers, prev_customers),
                "products": total_products,
                "avg_order_value": avg_order_value,
                "avg_order_value_delta": avg_order_value_delta,
                "payment_success_rate": payment_success_rate,
                "payment_success_delta": payment_success_delta,
                "conversion_rate": conversion_rate,
                "conversion_metric_label": "payment_success_rate",
                "delta_label": delta_label,
                "abandonment_rate": abandonment_rate,
                "repeat_rate": repeat_rate,
                "repeat_delta": repeat_delta,
                "conversion_breakdown": {
                    "overall_rate": current_overall_conversion,
                    "overall_delta": pct_change(current_overall_conversion, previous_overall_conversion),
                    "note": conversion_note,
                    "steps": [
                        {
                            "key": "sessions",
                            "label": "Sessions",
                            "count": current_sessions,
                            "rate": 100.0 if current_sessions else 0.0,
                            "delta": pct_change(current_sessions, previous_sessions),
                        },
                        {
                            "key": "added_to_cart",
                            "label": "Added to cart",
                            "count": current_added_to_cart,
                            "rate": stage_rate(current_added_to_cart, current_sessions),
                            "delta": pct_change(
                                stage_rate(current_added_to_cart, current_sessions),
                                stage_rate(previous_added_to_cart, previous_sessions),
                            ),
                        },
                        {
                            "key": "checkout",
                            "label": "Reached checkout",
                            "count": current_checkout,
                            "rate": stage_rate(current_checkout, current_sessions),
                            "delta": pct_change(
                                stage_rate(current_checkout, current_sessions),
                                stage_rate(previous_checkout, previous_sessions),
                            ),
                        },
                        {
                            "key": "completed",
                            "label": "Completed",
                            "count": current_completed,
                            "rate": stage_rate(current_completed, current_sessions),
                            "delta": pct_change(
                                stage_rate(current_completed, current_sessions),
                                stage_rate(previous_completed, previous_sessions),
                            ),
                        },
                    ],
                },
                "analytics_health": {
                    "source": "storefront_events",
                    "date_scope": top_date_range,
                    "market_scope": top_market,
                    "event_count": current_event_total,
                    "latest_event_at": latest_event_at,
                    "has_page_views": bool(current_sessions),
                    "has_checkout_events": bool(current_checkout),
                },
                "low_stock": inventory_health_count,
                "low_stock_products": inventory_health_count,
                "inventory_health_threshold": inventory_health_threshold,
                "inventory_health_count": inventory_health_count,
                "inventory_health_products": inventory_health_products,
                "revenue_trend": revenue_trend,
                "orders_trend": orders_trend,
                "customers_trend": customers_trend,
                "status_mix": status_mix,
                "sales_by_channel": sales_by_channel,
                "top_products": top_products,
                "top_products_currency_code": top_products_currency_code,
                "top_products_metric": top_metric,
                "top_products_date_range": top_date_range,
                "top_products_market": top_market,
                "recent_customers": list(
                    User.objects.filter(is_staff=False)
                    .filter(
                        Q(
                            id__in=scoped_orders.exclude(user_id__isnull=True)
                            .values_list("user_id", flat=True)
                            .distinct()
                        )
                        | Q(
                            email__in=scoped_orders.exclude(customer_email="")
                            .values_list("customer_email", flat=True)
                            .distinct()
                        )
                    )
                    .order_by("-orders__created_at")
                    .distinct()
                    .values("id", "username", "email", "first_name", "last_name", "date_joined")[:10]
                ),
            }
        )


class AdminAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_DASHBOARD_VIEW,)

    @extend_schema(responses=dict)
    def get(self, request):
        now = timezone.now()
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        orders = Order.objects.all()
        # Count all placed orders (paid, COD, unpaid) — exclude only cancelled/failed/refunded
        paid_orders = orders.exclude(status__in=[Order.STATUS_CANCELLED, Order.STATUS_FAILED, Order.STATUS_REFUNDED])

        # Regional revenue split
        regional_revenue = {}
        rates = analytics_to_omr_rates()
        for region in Region.objects.filter(is_active=True):
            region_orders = paid_orders.filter(region=region)
            region_total = Decimal(region_orders.aggregate(total=Sum("grand_total"))["total"] or 0)
            rate = rates.get(str(region.currency_code or "OMR").upper(), Decimal("1.0"))
            regional_revenue[region.code] = {
                "name": region.name_en or region.code.upper(),
                "currency_code": region.currency_code,
                "revenue": float(region_total),
                "revenue_omr": float(region_total * rate),
                "orders": region_orders.count(),
            }

        # Conversion funnel — real AnalyticsEvent counts (all-time, no date filter applied here)
        try:
            all_events = AnalyticsEvent.objects.all()
            funnel_visitors = all_events.filter(
                event_type=AnalyticsEvent.EVENT_PAGE_VIEW
            ).values("session_key").distinct().count()
            funnel_product_views = all_events.filter(
                event_type=AnalyticsEvent.EVENT_PRODUCT_VIEW
            ).count()
            funnel_cart_adds = all_events.filter(
                event_type=AnalyticsEvent.EVENT_ADD_TO_CART
            ).values("session_key").distinct().count()
            funnel_checkouts = all_events.filter(
                event_type=AnalyticsEvent.EVENT_CHECKOUT_INITIATED
            ).values("session_key").distinct().count()

            # Traffic sources — read `source` key from metadata of page_view events
            # Uses one session per source (first-touch attribution per session)
            page_view_events = (
                all_events.filter(event_type=AnalyticsEvent.EVENT_PAGE_VIEW)
                .values("session_key", "metadata")
            )
            source_sessions = {}
            for ev in page_view_events:
                sk = ev["session_key"]
                if sk not in source_sessions:
                    src = (ev.get("metadata") or {}).get("source") or "Direct"
                    source_sessions[sk] = src
            source_counts: dict[str, int] = {}
            for src in source_sessions.values():
                source_counts[src] = source_counts.get(src, 0) + 1
            traffic_sources = sorted(
                [{"source": k, "sessions": v} for k, v in source_counts.items()],
                key=lambda x: -x["sessions"],
            )
        except (OperationalError, ProgrammingError):
            funnel_visitors = 0
            funnel_product_views = 0
            funnel_cart_adds = 0
            funnel_checkouts = 0
            traffic_sources = []

        total_orders_count = orders.count()
        paid_orders_count = paid_orders.count()
        cancelled_orders_count = orders.filter(status=Order.STATUS_CANCELLED).count()

        # Revenue trend (monthly)
        by_month_currency = (
            paid_orders.annotate(month=TruncMonth("created_at"))
            .values("month", "currency_code")
            .annotate(total=Sum("grand_total"))
            .order_by("month")
        )
        month_map = {}
        for row in by_month_currency:
            month = row.get("month")
            if not month:
                continue
            currency = str(row.get("currency_code") or "OMR").upper()
            rate = rates.get(currency, Decimal("1.0"))
            converted = Decimal(row.get("total") or 0) * rate
            month_map[month] = month_map.get(month, Decimal("0.0")) + converted
        revenue_trend = [
            {
                "label": month.strftime("%b %Y"),
                "value": float(total),
            }
            for month, total in sorted(month_map.items(), key=lambda item: item[0])[:12]
        ]

        payment_success_rate = round((paid_orders_count / total_orders_count) * 100, 1) if total_orders_count else 0

        return Response({
            "visitors": funnel_visitors,
            "product_views": funnel_product_views,
            "cart_adds": funnel_cart_adds,
            "checkouts": funnel_checkouts,
            "completed_orders": paid_orders_count,
            "abandoned_orders": cancelled_orders_count,
            "payment_success_rate": payment_success_rate,
            "conversion_rate": payment_success_rate,
            "analytics_currency_normalization": _analytics_currency_normalization_metadata(applied=True),
            "conversion_metric_label": "payment_success_rate",
            "region_om": regional_revenue.get("om", {}),
            "region_ae": regional_revenue.get("ae", {}),
            "region_sa": regional_revenue.get("sa", {}),
            "regional_revenue": regional_revenue,
            "revenue_trend": revenue_trend,
            "traffic_sources": traffic_sources,
            "status_mix": list(orders.values("status").annotate(count=Count("id")).order_by("status")),
            "top_products": list(
                Product.objects.filter(is_published=True)
                .order_by("-review_count", "-rating")
                .values("slug", "name_en", "review_count", "rating")[:8]
            ),
            "order_status_distribution": list(
                orders.values("status").annotate(count=Count("id")).order_by("status")
            ),
        })


class ReportCsvView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_REPORTS_VIEW,)

    @extend_schema(responses={200: bytes})
    def get(self, request, report_type):
        from django.conf import settings as _settings

        max_rows = int(getattr(_settings, "ADMIN_CSV_MAX_ROWS", 10000))

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{report_type}-{timezone.localdate()}.csv"'
        writer = csv.writer(response)

        rows_written = 0
        truncated = False

        def write_row(row):
            nonlocal rows_written, truncated
            if rows_written >= max_rows:
                truncated = True
                return False
            writer.writerow(row)
            rows_written += 1
            return True

        if report_type == "orders":
            writer.writerow(["order_number", "customer", "phone", "status", "payment_status", "total", "currency"])
            queryset = Order.objects.all().order_by("-created_at").only(
                "order_number", "customer_name", "customer_phone",
                "status", "payment_status", "grand_total", "currency_code",
            )[: max_rows + 1]
            for order in queryset:
                if not write_row([
                    order.order_number,
                    order.customer_name,
                    order.customer_phone,
                    order.status,
                    order.payment_status,
                    order.grand_total,
                    order.currency_code,
                ]):
                    break
        elif report_type == "sales":
            writer.writerow(["date", "orders", "revenue", "avg_order_value", "currency"])
            sales_data = (
                Order.objects.filter(payment_status=Order.PAYMENT_PAID)
                .annotate(day=TruncMonth("created_at"))
                .values("day")
                .annotate(
                    order_count=Count("id"),
                    total_revenue=Sum("grand_total"),
                )
                .order_by("-day")[: max_rows + 1]
            )
            for row in sales_data:
                day = row["day"]
                count_val = row["order_count"]
                revenue_val = float(row["total_revenue"] or 0)
                aov = round(revenue_val / count_val, 2) if count_val else 0
                if not write_row([
                    day.strftime("%Y-%m") if day else "",
                    count_val,
                    revenue_val,
                    aov,
                    "OMR",
                ]):
                    break
        elif report_type == "abandoned-carts":
            writer.writerow(["order_number", "customer", "phone", "created_at", "total", "currency"])
            queryset = Order.objects.filter(status=Order.STATUS_CANCELLED).order_by("-created_at").only(
                "order_number", "customer_name", "customer_phone",
                "created_at", "grand_total", "currency_code",
            )[: max_rows + 1]
            for order in queryset:
                if not write_row([
                    order.order_number,
                    order.customer_name,
                    order.customer_phone,
                    order.created_at.isoformat(),
                    order.grand_total,
                    order.currency_code,
                ]):
                    break
        elif report_type == "customers":
            writer.writerow(["id", "username", "email", "first_name", "last_name", "date_joined"])
            queryset = (
                get_user_model().objects.all()
                .order_by("-date_joined")
                .only("id", "username", "email", "first_name", "last_name", "date_joined")
                [: max_rows + 1]
            )
            for user in queryset:
                if not write_row([user.id, user.username, user.email, user.first_name, user.last_name, user.date_joined]):
                    break
        elif report_type in {"inventory", "low-stock"}:
            writer.writerow(["slug", "name", "brand", "stock_quantity", "track_inventory", "active"])
            products = Product.objects.all().only(
                "slug", "name_en", "brand", "stock_quantity", "track_inventory", "is_published",
            )
            if report_type == "low-stock":
                products = products.filter(track_inventory=True, stock_quantity__lte=get_inventory_health_threshold())
            for product in products[: max_rows + 1]:
                if not write_row([
                    product.slug,
                    product.name_en,
                    product.brand,
                    product.stock_quantity,
                    product.track_inventory,
                    product.is_published,
                ]):
                    break
        else:
            writer.writerow(["error"])
            writer.writerow(["Unknown report type."])

        if truncated:
            # Log the truncated export for the audit trail.
            logger.warning(
                "CSV export truncated to %s rows (type=%s actor=%s)",
                max_rows,
                report_type,
                getattr(request.user, "username", "unknown"),
            )
            response["X-Export-Truncated"] = "true"
            response["X-Export-Max-Rows"] = str(max_rows)

        # Best-effort audit log entry.
        try:
            AdminAuditLog.objects.create(
                actor=request.user if getattr(request.user, "pk", None) else None,
                action="export",
                resource_type="report",
                resource_id=report_type,
                after_snapshot={"rows": rows_written, "truncated": truncated},
                ip_address=(request.META.get("REMOTE_ADDR") or "")[:45],
                user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:255],
            )
        except Exception:
            logger.exception("Failed to write audit log for CSV export type=%s", report_type)

        return response


class AdminModerationSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_MODERATION_VIEW,)

    @extend_schema(responses=dict)
    def get(self, request):
        return Response(
            {
                "reviews_pending": Review.objects.filter(is_approved=False).count(),
                "active_push_devices": PushDevice.objects.filter(is_active=True).count(),
                "notification_failures": NotificationLog.objects.filter(success=False).count(),
            }
        )


class AdminNewsletterSubscriberListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_MODERATION_VIEW,)

    def get_queryset(self):
        return NewsletterSubscription.objects.select_related("region").order_by("-created_at")

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        data = [
            {
                "id": sub.id,
                "email": sub.email,
                "locale": sub.locale,
                "region": sub.region.code if sub.region else None,
                "is_active": sub.is_active,
                "subscribed_at": sub.created_at.isoformat(),
            }
            for sub in qs
        ]
        return Response(data)


class AdminAuditLogListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_AUDIT_VIEW,)
    serializer_class = AdminAuditLogSerializer
    queryset = AdminAuditLog.objects.select_related("actor").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        action = self.request.query_params.get("action", "").strip().lower()
        resource_type = self.request.query_params.get("resource_type", "").strip().lower()
        actor = self.request.query_params.get("actor", "").strip()
        if action:
            queryset = queryset.filter(action=action)
        if resource_type:
            queryset = queryset.filter(resource_type=resource_type)
        if actor.isdigit():
            queryset = queryset.filter(actor_id=int(actor))
        return queryset


class StaffListCreateView(AdminCapabilityMixin, generics.ListCreateAPIView):
    admin_read_capabilities = ()
    admin_write_capabilities = ()


class StaffRetrieveUpdateDestroyView(AdminCapabilityMixin, generics.RetrieveUpdateDestroyAPIView):
    admin_read_capabilities = ()
    admin_write_capabilities = ()


class AdminStaffListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_STAFF_MANAGE,)
    admin_write_capabilities = (CAP_STAFF_MANAGE,)
    serializer_class = AdminStaffSerializer

    def get_queryset(self):
        User = get_user_model()
        return User.objects.filter(is_staff=True).prefetch_related("groups").order_by("email")


class AdminStaffDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_STAFF_MANAGE,)
    admin_write_capabilities = (CAP_STAFF_MANAGE,)
    serializer_class = AdminStaffSerializer

    def get_queryset(self):
        User = get_user_model()
        return User.objects.filter(is_staff=True).prefetch_related("groups")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance == request.user:
            raise PermissionDenied("You cannot delete your own account.")
        if instance.is_superuser:
            raise PermissionDenied("Superuser accounts cannot be deleted via the admin API.")
        return super().destroy(request, *args, **kwargs)


class AdminTaxRateListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_REGIONS_VIEW,)
    admin_write_capabilities = (CAP_REGIONS_EDIT,)
    queryset = TaxRate.objects.select_related("region").all()
    serializer_class = AdminTaxRateSerializer


class AdminTaxRateDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_REGIONS_VIEW,)
    admin_write_capabilities = (CAP_REGIONS_EDIT,)
    queryset = TaxRate.objects.select_related("region").all()
    serializer_class = AdminTaxRateSerializer


class AdminProductListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_PRODUCTS_VIEW,)
    admin_write_capabilities = (CAP_PRODUCTS_EDIT,)
    queryset = Product.objects.prefetch_related("categories", "tags", "prices__region", "gallery_images").all()
    serializer_class = AdminProductSerializer
    lookup_field = "slug"

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name_en__icontains=search)
        return queryset


class AdminProductDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_PRODUCTS_VIEW,)
    admin_write_capabilities = (CAP_PRODUCTS_EDIT,)
    queryset = Product.objects.prefetch_related("categories", "tags", "prices__region", "gallery_images").all()
    serializer_class = AdminProductSerializer
    lookup_field = "slug"


class AdminProductGalleryUploadView(AdminCapabilityMixin, APIView):
    """Save one or more uploaded gallery images and return their /media URLs.

    The product's ``gallery`` JSON list is still persisted via the normal product
    PATCH (so add/remove/reorder stay atomic with Save); this endpoint only stores
    the files and hands back URLs for the admin gallery widget to append.
    """

    admin_read_capabilities = (CAP_PRODUCTS_EDIT,)
    admin_write_capabilities = (CAP_PRODUCTS_EDIT,)
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, slug):
        import os
        import uuid
        from django.conf import settings as dj_settings
        from django.core.files.storage import default_storage
        from django.utils.text import slugify
        from PIL import Image

        logger.warning(
            "GALLERY UPLOAD reached backend: slug=%s file_keys=%s content_type=%s",
            slug, list(request.FILES.keys()), request.content_type,
        )
        product = get_object_or_404(Product, slug=slug)
        files = request.FILES.getlist("files")
        if not files and "file" in request.FILES:
            files = [request.FILES["file"]]
        if not files:
            return Response({"detail": "No image files were provided."}, status=400)

        allowed_ext = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
        urls = []
        for upload in files:
            try:
                Image.open(upload).verify()
                upload.seek(0)
            except Exception:
                return Response(
                    {"detail": f"'{upload.name}' is not a valid image."},
                    status=400,
                )
            # Store under a clean, unique, URL-safe name — original names may carry
            # spaces/unicode/length that break filesystem paths or produce fragile URLs.
            base, ext = os.path.splitext(upload.name or "")
            ext = ext.lower()
            if ext not in allowed_ext:
                ext = ".jpg"
            safe_base = slugify(base)[:60] or "image"
            target = f"products/gallery/{safe_base}-{uuid.uuid4().hex[:8]}{ext}"
            try:
                stored_path = default_storage.save(target, upload)
            except Exception:
                logger.exception("Gallery image save failed (product=%s, file=%s)", product.slug, upload.name)
                return Response(
                    {"detail": f"Could not save '{upload.name}'. Please try a different file."},
                    status=400,
                )
            urls.append(f"{dj_settings.MEDIA_URL.rstrip('/')}/{stored_path}")

        try:
            log_admin_action(
                request=request,
                actor=request.user,
                action="product.gallery.upload",
                resource_type="product",
                resource_id=str(product.id),
                after_snapshot=snapshot_instance(product),
            )
        except Exception:
            logger.exception("Gallery upload audit-log failed (product=%s)", product.slug)
        return Response({"urls": urls})


class AdminCategoryListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_CATEGORIES_VIEW,)
    admin_write_capabilities = (CAP_CATEGORIES_EDIT,)
    queryset = Category.objects.all()
    serializer_class = AdminCategorySerializer
    lookup_field = "slug"


class AdminCategoryDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_CATEGORIES_VIEW,)
    admin_write_capabilities = (CAP_CATEGORIES_EDIT,)
    queryset = Category.objects.all()
    serializer_class = AdminCategorySerializer
    lookup_field = "slug"


class AdminHeroPromoCardListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    queryset = HeroPromoCard.objects.all()
    serializer_class = AdminHeroPromoCardSerializer


class AdminHeroPromoCardDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    queryset = HeroPromoCard.objects.all()
    serializer_class = AdminHeroPromoCardSerializer


class AdminInstagramPostListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    queryset = InstagramPost.objects.all().order_by("sort_order")
    serializer_class = AdminInstagramPostSerializer


class AdminInstagramPostDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    queryset = InstagramPost.objects.all()
    serializer_class = AdminInstagramPostSerializer


class AdminCouponListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_COUPONS_VIEW,)
    admin_write_capabilities = (CAP_COUPONS_EDIT,)
    queryset = Coupon.objects.prefetch_related("regions", "products", "categories").all()
    serializer_class = AdminCouponSerializer

    def perform_create(self, serializer):
        coupon = serializer.save()
        coupon.refresh_from_db()
        log_admin_action(
            request=self.request,
            actor=self.request.user,
            action=AdminAuditLog.ACTION_COUPON_CHANGED,
            resource_type="coupon",
            resource_id=str(coupon.id),
            before_snapshot=None,
            after_snapshot=snapshot_instance(coupon, include_m2m=True),
        )


class AdminCouponDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_COUPONS_VIEW,)
    admin_write_capabilities = (CAP_COUPONS_EDIT,)
    queryset = Coupon.objects.prefetch_related("regions", "products", "categories").all()
    serializer_class = AdminCouponSerializer

    def perform_update(self, serializer):
        coupon = self.get_object()
        before_snapshot = snapshot_instance(coupon, include_m2m=True)
        updated_coupon = serializer.save()
        updated_coupon.refresh_from_db()
        log_admin_action(
            request=self.request,
            actor=self.request.user,
            action=AdminAuditLog.ACTION_COUPON_CHANGED,
            resource_type="coupon",
            resource_id=str(updated_coupon.id),
            before_snapshot=before_snapshot,
            after_snapshot=snapshot_instance(updated_coupon, include_m2m=True),
        )

    def perform_destroy(self, instance):
        before_snapshot = snapshot_instance(instance, include_m2m=True)
        resource_id = str(instance.id)
        instance.delete()
        log_admin_action(
            request=self.request,
            actor=self.request.user,
            action=AdminAuditLog.ACTION_COUPON_CHANGED,
            resource_type="coupon",
            resource_id=resource_id,
            before_snapshot=before_snapshot,
            after_snapshot=None,
        )


class AdminOrderListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ORDERS_VIEW,)
    serializer_class = AdminOrderSerializer

    def get_queryset(self):
        queryset = Order.objects.select_related("region", "user").prefetch_related(
            "items__product",
            "transactions",
            "status_history__actor",
            "return_requests__reviewed_by",
        )
        search = _clean_text(self.request.query_params.get("search", ""))
        if search:
            queryset = queryset.filter(
                Q(order_number__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(customer_email__icontains=search)
                | Q(customer_phone__icontains=search)
                | Q(region__code__icontains=search)
                | Q(region__name_en__icontains=search)
                | Q(items__product_name__icontains=search)
                | Q(items__product_slug__icontains=search)
            ).distinct()
        sales_channel_filter = _clean_text(self.request.query_params.get("sales_channel", "")).lower()
        if sales_channel_filter in {Order.SALES_CHANNEL_ONLINE_STORE, Order.SALES_CHANNEL_DRAFT_ORDER}:
            queryset = queryset.filter(sales_channel=sales_channel_filter)

        status_filter = self.request.query_params.get("status", "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        market_filter = (
            self.request.query_params.get("market", "")
            or self.request.query_params.get("region", "")
            or ""
        )
        market_code = _resolve_market_code(market_filter)
        if market_code:
            queryset = queryset.filter(region__code=market_code)

        start_raw = str(self.request.query_params.get("date_from", "") or "").strip()
        end_raw = str(self.request.query_params.get("date_to", "") or "").strip()
        start_date = parse_date(start_raw) if start_raw else None
        end_date = parse_date(end_raw) if end_raw else None
        if start_date:
            queryset = queryset.filter(created_at__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)
        return queryset


class AdminDraftOrderCreateView(AdminCapabilityMixin, APIView):
    admin_read_capabilities = (CAP_ORDERS_VIEW,)
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    @extend_schema(request=DraftOrderUpsertSerializer, responses=AdminOrderSerializer)
    def post(self, request):
        serializer = DraftOrderUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = _upsert_draft_order(request=request, payload=serializer.validated_data)
        order = (
            Order.objects.filter(pk=order.pk)
            .select_related("region", "user")
            .prefetch_related("items__product", "transactions", "status_history__actor", "return_requests__reviewed_by")
            .first()
        )
        return Response(
            AdminOrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminDraftOrderDetailView(AdminCapabilityMixin, APIView):
    admin_read_capabilities = (CAP_ORDERS_VIEW,)
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    @extend_schema(request=DraftOrderUpsertSerializer, responses=AdminOrderSerializer)
    def patch(self, request, order_number):
        order = Order.objects.filter(
            order_number=order_number,
            sales_channel=Order.SALES_CHANNEL_DRAFT_ORDER,
        ).first()
        if not order:
            return Response({"detail": "Draft order not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = DraftOrderUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated_order = _upsert_draft_order(request=request, payload=serializer.validated_data, order=order)
        updated_order = (
            Order.objects.filter(pk=updated_order.pk)
            .select_related("region", "user")
            .prefetch_related("items__product", "transactions", "status_history__actor", "return_requests__reviewed_by")
            .first()
        )
        return Response(AdminOrderSerializer(updated_order, context={"request": request}).data)


class AdminDraftOrderCustomerSearchView(AdminCapabilityMixin, APIView):
    admin_read_capabilities = (CAP_ORDERS_VIEW,)
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    def get(self, request):
        query = _clean_text(request.query_params.get("q", ""))
        raw_limit = _clean_text(request.query_params.get("limit", ""))
        try:
            limit = int(raw_limit or DRAFT_CUSTOMER_SEARCH_LIMIT)
        except ValueError:
            limit = DRAFT_CUSTOMER_SEARCH_LIMIT
        limit = max(1, min(limit, 50))

        UserModel = get_user_model()
        users_queryset = UserModel.objects.all().order_by("-date_joined")
        if query:
            users_queryset = users_queryset.filter(
                Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(email__icontains=query)
                | Q(username__icontains=query)
                | Q(addresses__phone__icontains=query)
            )
        users = list(users_queryset.distinct()[:limit])

        results = []
        seen_keys = set()

        for user in users:
            address = _default_address_for_user(user)
            full_name = _join_full_name(user.first_name, user.last_name)
            label = full_name or _clean_text(user.email) or _clean_text(user.username) or f"Customer #{user.id}"
            subtitle_parts = []
            if user.email:
                subtitle_parts.append(user.email)
            if address and address.phone:
                subtitle_parts.append(address.phone)

            payload = {
                "type": "user",
                "user_id": user.id,
                "name": label,
                "first_name": _clean_text(user.first_name),
                "last_name": _clean_text(user.last_name),
                "email": _clean_text(user.email),
                "phone": _clean_text(getattr(address, "phone", "")),
                "address_line_1": _clean_text(getattr(address, "address_line_1", "")),
                "address_line_2": _clean_text(getattr(address, "address_line_2", "")),
                "area": _clean_text(getattr(address, "area", "")),
                "city": _clean_text(getattr(address, "city", "")),
                "postcode": _clean_text(getattr(address, "postcode", "")),
                "country": _clean_text(getattr(address, "country", "")),
                "label": label,
                "subtitle": " · ".join(subtitle_parts),
            }
            results.append(payload)
            seen_keys.add(f"user:{user.id}")

        remaining = max(limit - len(results), 0)
        if remaining > 0:
            orders_queryset = Order.objects.order_by("-created_at")
            if query:
                orders_queryset = orders_queryset.filter(
                    Q(customer_name__icontains=query)
                    | Q(customer_email__icontains=query)
                    | Q(customer_phone__icontains=query)
                )
            history_rows = list(
                orders_queryset.values(
                    "order_number",
                    "user_id",
                    "customer_name",
                    "customer_email",
                    "customer_phone",
                    "address_line_1",
                    "address_line_2",
                    "area",
                    "city",
                    "postcode",
                    "country",
                )[: remaining * 4]
            )
            for row in history_rows:
                user_id = row.get("user_id")
                dedupe_key = f"user:{user_id}" if user_id else (
                    f"history:{_clean_text(row.get('customer_email')).lower()}|{_clean_text(row.get('customer_phone'))}|{_clean_text(row.get('customer_name')).lower()}"
                )
                if dedupe_key in seen_keys:
                    continue
                name = _clean_text(row.get("customer_name"))
                email = _clean_text(row.get("customer_email"))
                phone = _clean_text(row.get("customer_phone"))
                if not name and not email and not phone:
                    continue
                label = name or email or phone
                subtitle = " · ".join(part for part in [email, phone] if part)
                results.append(
                    {
                        "type": "history",
                        "user_id": user_id,
                        "name": label,
                        "first_name": "",
                        "last_name": "",
                        "email": email,
                        "phone": phone,
                        "address_line_1": _clean_text(row.get("address_line_1")),
                        "address_line_2": _clean_text(row.get("address_line_2")),
                        "area": _clean_text(row.get("area")),
                        "city": _clean_text(row.get("city")),
                        "postcode": _clean_text(row.get("postcode")),
                        "country": _clean_text(row.get("country")),
                        "label": label,
                        "subtitle": subtitle,
                        "source_order_number": row.get("order_number"),
                    }
                )
                seen_keys.add(dedupe_key)
                if len(results) >= limit:
                    break

        return Response({"results": results[:limit]})


class AdminOrderDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ORDERS_VIEW,)
    admin_write_capabilities = (CAP_ORDERS_EDIT,)
    serializer_class = AdminOrderSerializer
    lookup_field = "order_number"
    queryset = Order.objects.select_related("region", "user").prefetch_related(
        "items__product",
        "transactions",
        "status_history__actor",
        "return_requests__reviewed_by",
    )

    def delete(self, request, order_number):
        order = (
            Order.objects.filter(order_number=order_number)
            .select_related("region", "user")
            .prefetch_related("items__product")
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        snapshot = {
            "order_number": order.order_number,
            "status": order.status,
            "grand_total": str(order.grand_total),
            "customer_name": order.customer_name,
        }

        # Each cleanup runs in its own savepoint so a DB error inside can't
        # corrupt the outer connection state.
        if not order.inventory_released:
            try:
                with transaction.atomic():
                    release_pending_gift_card_redemption(order, reason="deleted")
            except Exception:
                logger.exception("Gift card release failed on order delete %s", order.order_number)
            try:
                with transaction.atomic():
                    order.restore_inventory()
            except Exception:
                logger.exception("Inventory restore failed on order delete %s", order.order_number)

        try:
            with transaction.atomic():
                log_admin_action(
                    request=request,
                    actor=request.user,
                    action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
                    resource_type="order",
                    resource_id=order.order_number,
                    before_snapshot=snapshot,
                    after_snapshot={"action": "order_deleted"},
                )
                order.delete()
        except Exception:
            logger.exception("Order delete failed for %s", order.order_number)
            return Response({"detail": "Failed to delete order."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_update(self, serializer):
        old_order = self.get_object()
        previous_status = old_order.status
        previous_status_note = old_order.notes
        previous_tracking_number = old_order.tracking_number
        previous_tracking_url = old_order.tracking_url
        previous_payment_status = old_order.payment_status
        order = serializer.save()

        if previous_status != order.status:
            log_admin_action(
                request=self.request,
                actor=self.request.user,
                action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
                resource_type="order",
                resource_id=order.order_number,
                before_snapshot={
                    "status": previous_status,
                    "payment_status": previous_payment_status,
                    "notes": previous_status_note,
                },
                after_snapshot={
                    "status": order.status,
                    "payment_status": order.payment_status,
                    "notes": order.notes,
                },
            )

        tracking_changed = (
            order.tracking_number != previous_tracking_number
            or order.tracking_url != previous_tracking_url
        )

        if should_auto_create_shipment(previous_status, order.status):
            try:
                from ..tasks import generate_order_shipment_async
                generate_order_shipment_async.delay(order.id)
            except Exception:
                # Shipment creation should never block admin order updates.
                logger.exception("Auto shipment creation failed for order %s", order.order_number)
            order.refresh_from_db()

        if tracking_changed:
            try:
                update_manual_tracking(
                    order,
                    carrier=order.carrier,
                    tracking_number=order.tracking_number,
                    tracking_url=order.tracking_url,
                    shipment_status=order.shipment_status,
                )
            except ShipmentServiceError:
                logger.warning("Manual tracking update rejected for order %s", order.order_number)

        if previous_status != order.status and order.status in {
            Order.STATUS_CANCELLED,
            Order.STATUS_RETURNED,
            Order.STATUS_REFUNDED,
            Order.STATUS_FAILED,
        }:
            if order.status == Order.STATUS_CANCELLED:
                try:
                    release_pending_gift_card_redemption(order, reason="cancelled")
                except Exception:
                    logger.exception("Gift card release failed for cancelled order %s", order.order_number)
            try:
                order.restore_inventory()
                order.refresh_from_db()
            except Exception:
                logger.exception("Inventory restore failed for order %s after status=%s", order.order_number, order.status)

        if previous_payment_status != order.payment_status:
            if order.payment_status == Order.PAYMENT_PAID:
                try:
                    commit_reserved_inventory_for_order(order)
                except Exception:
                    logger.exception("Inventory commit failed for paid order %s", order.order_number)
                try:
                    finalize_online_gift_card_redemption(order)
                except GiftCardRedemptionError:
                    logger.exception("Gift card finalization failed for paid order %s", order.order_number)
                except Exception:
                    logger.exception("Unexpected gift card finalization error for paid order %s", order.order_number)
                notify_admins_paid_order(order)
            elif order.payment_status == Order.PAYMENT_REVIEW:
                notify_admins_payment_review(order)
            elif order.payment_status == Order.PAYMENT_REFUNDED:
                try:
                    release_pending_gift_card_redemption(order, reason="refunded")
                except Exception:
                    logger.exception("Gift card release failed for refunded order %s", order.order_number)
                try:
                    order.restore_inventory()
                    order.refresh_from_db()
                except Exception:
                    logger.exception("Inventory restore failed for refunded order %s", order.order_number)
        for item in order.items.select_related("product"):
            if item.product and item.product.track_inventory and item.product.stock_quantity <= 10:
                notify_admins_low_stock(item.product)
        if order.payment_status == Order.PAYMENT_PAID:
            from ..tasks import generate_order_invoice_async
            generate_order_invoice_async.delay(order.id)


class AdminOrderStatusRollbackView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    @transaction.atomic
    def post(self, request, order_number):
        order = (
            Order.objects.select_for_update()
            .filter(order_number=order_number)
            .select_related("region", "user")
            .prefetch_related("items__product", "transactions", "status_history__actor", "return_requests__reviewed_by")
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            serializer = AdminOrderSerializer(context={"request": request})
            previous_status = serializer.get_previous_status(order)
        except Exception:
            previous_status = order.get_previous_status()

        if not previous_status:
            return Response(
                {"detail": "No previous order status is available for rollback."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if previous_status == order.status:
            return Response(
                {"detail": "The previous status matches the current order status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        admin_note = str(request.data.get("admin_note", "")).strip()
        before_snapshot = {
            "status": order.status,
            "payment_status": order.payment_status,
            "refund_status": order.refund_status,
            "inventory_released": bool(order.inventory_released),
        }

        moving_back_to_inventory_active = (
            order.status in Order.INVENTORY_RELEASED_STATUSES
            and previous_status in Order.INVENTORY_ACTIVE_STATUSES
        )
        inventory_committed = (
            order.payment_method != Order.PAYMENT_ONLINE
            or previous_status in {
                Order.STATUS_PAID,
                Order.STATUS_PROCESSING,
                Order.STATUS_SHIPPED,
                Order.STATUS_DELIVERED,
            }
        )

        try:
            if moving_back_to_inventory_active and order.inventory_released:
                reapply_order_inventory(order, inventory_committed=inventory_committed)
                reopen_released_gift_card_redemption(order)

            rollback_marker = f"Admin rollback to previous status: {previous_status}."
            rollback_note = f"{rollback_marker} {admin_note}".strip() if admin_note else rollback_marker
            order.force_status_to(
                previous_status,
                actor=request.user,
                note=rollback_note,
            )
        except Exception as exc:
            message = getattr(exc, "message", "") or str(exc) or "Unable to roll back order status."
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

        order.refresh_from_db()
        # Clear the cached previous-status metadata so the response reflects the new state.
        try:
            del order._admin_previous_status_metadata
        except AttributeError:
            pass

        try:
            log_admin_action(
                request=request,
                actor=request.user,
                action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
                resource_type="order",
                resource_id=order.order_number,
                before_snapshot=before_snapshot,
                after_snapshot={
                    "status": order.status,
                    "payment_status": order.payment_status,
                    "refund_status": order.refund_status,
                    "inventory_released": bool(order.inventory_released),
                    "rollback": True,
                },
            )
        except Exception:
            pass

        try:
            response_data = AdminOrderSerializer(order, context={"request": request}).data
        except Exception as exc:
            message = getattr(exc, "message", "") or str(exc) or "Rollback succeeded but response serialization failed."
            return Response({"detail": message, "status": order.status}, status=status.HTTP_200_OK)

        return Response(response_data, status=status.HTTP_200_OK)


class AdminOrderShipmentCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    def post(self, request, order_number):
        order = (
            Order.objects.filter(order_number=order_number)
            .select_related("region")
            .prefetch_related("items__product", "transactions", "status_history__actor", "return_requests__reviewed_by")
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        manual_tracking_number = str(request.data.get("tracking_number", "")).strip()
        manual_tracking_url = str(request.data.get("tracking_url", "")).strip()
        carrier = str(request.data.get("carrier", "")).strip().lower()
        shipment_status = str(request.data.get("shipment_status", "")).strip().lower()

        try:
            if manual_tracking_number or manual_tracking_url:
                shipment_result = update_manual_tracking(
                    order,
                    carrier=carrier,
                    tracking_number=manual_tracking_number,
                    tracking_url=manual_tracking_url,
                    shipment_status=shipment_status or Order.SHIPMENT_MANUAL,
                )
            else:
                shipment_result = create_order_shipment(
                    order,
                    carrier_key=carrier,
                    force=bool(request.data.get("force", False)),
                )
        except ShipmentServiceError as exc:
            return Response(
                {"error": str(exc), "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"error": str(exc), "code": "shipment_error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        order.refresh_from_db()
        return Response(
            {
                "order": AdminOrderSerializer(order, context={"request": request}).data,
                "shipment": shipment_result,
            },
            status=status.HTTP_200_OK,
        )


class AdminOrderTrackingRefreshView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    def post(self, request, order_number):
        order = (
            Order.objects.filter(order_number=order_number)
            .select_related("region")
            .prefetch_related("items__product", "transactions", "status_history__actor", "return_requests__reviewed_by")
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            refresh_result = refresh_order_tracking(order)
        except ShipmentServiceError as exc:
            return Response(
                {"error": str(exc), "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"error": str(exc), "code": "shipment_refresh_failed"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        order.refresh_from_db()
        return Response(
            {
                "order": AdminOrderSerializer(order, context={"request": request}).data,
                "tracking": refresh_result,
            },
            status=status.HTTP_200_OK,
        )


class AdminOrderInvoiceDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ORDERS_VIEW,)

    def get(self, request, order_number):
        order = (
            Order.objects.filter(order_number=order_number)
            .select_related("region")
            .prefetch_related("items")
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            order = generate_order_invoice(order, force=True)
        except Exception:
            logger.exception("Admin invoice generation failed for order %s", order.order_number)
            order.invoice_status = Order.INVOICE_FAILED
            order.save(update_fields=["invoice_status", "updated_at"])
            return Response(
                {"detail": "Invoice generation failed. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if not order.invoice_pdf:
            return Response({"detail": "Invoice is not available yet."}, status=status.HTTP_404_NOT_FOUND)

        order.invoice_pdf.open("rb")
        filename = f"{order.invoice_number or order.order_number}.pdf"
        return FileResponse(order.invoice_pdf, as_attachment=True, filename=filename)


def _recalculate_order_totals(order):
    # Query fresh from DB — never rely on the prefetch cache which is stale after mutations.
    fresh_items = list(OrderItem.objects.filter(order_id=order.pk))
    subtotal = sum((item.line_total for item in fresh_items), Decimal("0.00"))
    base_total = subtotal - order.discount_total + order.shipping_total
    if order.tax_inclusive:
        grand_total = base_total
    else:
        grand_total = base_total + order.tax_total
    order.subtotal = quantize_money(subtotal)
    order.grand_total = quantize_money(max(grand_total, Decimal("0.00")))
    order.save(update_fields=["subtotal", "grand_total"])


def _fetch_order_for_items_edit(order_number):
    return (
        Order.objects.filter(order_number=order_number)
        .select_related("region", "user")
        .prefetch_related("items__product", "transactions", "status_history__actor", "return_requests__reviewed_by")
        .first()
    )


class AdminOrderItemsView(APIView):
    """Add a new item to an existing order."""
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ORDERS_VIEW,)
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    @transaction.atomic
    def post(self, request, order_number):
        order = _fetch_order_for_items_edit(order_number)
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        product_slug = str(request.data.get("product_slug", "")).strip()
        if not product_slug:
            return Response({"detail": "product_slug is required."}, status=status.HTTP_400_BAD_REQUEST)

        product = Product.objects.filter(slug=product_slug).first()
        if not product:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            quantity = max(1, int(request.data.get("quantity", 1)))
        except (TypeError, ValueError):
            quantity = 1

        raw_price = request.data.get("unit_price")
        if raw_price not in (None, ""):
            try:
                unit_price = quantize_money(Decimal(str(raw_price)))
            except Exception:
                return Response({"detail": "Invalid unit_price."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            price_obj = product.prices.filter(region=order.region).first()
            if not price_obj:
                price_obj = product.prices.first()
            unit_price = quantize_money(price_obj.price) if price_obj else Decimal("0.00")

        line_total = quantize_money(unit_price * quantity)
        existing = order.items.filter(product_slug=product_slug).first()
        if existing:
            existing.quantity += quantity
            existing.line_total = quantize_money(existing.unit_price * existing.quantity)
            existing.save(update_fields=["quantity", "line_total"])
        else:
            OrderItem.objects.create(
                order=order,
                product=product,
                product_slug=product_slug,
                product_name=product.name_en or product_slug,
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
                selected_options_text="",
                taxable_amount=Decimal("0.00"),
                tax_rate=Decimal("0.00"),
                tax_total=Decimal("0.00"),
            )

        _recalculate_order_totals(order)
        log_admin_action(
            request=request,
            actor=request.user,
            action=AdminAuditLog.ACTION_ORDER_STATUS_CHANGED,
            resource_type="order",
            resource_id=order.order_number,
            before_snapshot={"action": "item_added", "product_slug": product_slug, "quantity": quantity},
            after_snapshot={"subtotal": str(order.subtotal), "grand_total": str(order.grand_total)},
        )
        order.refresh_from_db()
        order = _fetch_order_for_items_edit(order_number)
        return Response(AdminOrderSerializer(order, context={"request": request}).data)


class AdminOrderItemDetailView(APIView):
    """Update quantity or remove a single item from an order."""
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ORDERS_VIEW,)
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    def _get_item(self, order_number, pk):
        order = _fetch_order_for_items_edit(order_number)
        if not order:
            return None, None
        item = order.items.filter(pk=pk).first()
        return order, item

    @transaction.atomic
    def patch(self, request, order_number, pk):
        order, item = self._get_item(order_number, pk)
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        if not item:
            return Response({"detail": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            quantity = max(1, int(request.data.get("quantity", item.quantity)))
        except (TypeError, ValueError):
            return Response({"detail": "Invalid quantity."}, status=status.HTTP_400_BAD_REQUEST)

        item.quantity = quantity
        item.line_total = quantize_money(item.unit_price * quantity)
        item.save(update_fields=["quantity", "line_total"])
        _recalculate_order_totals(order)
        order = _fetch_order_for_items_edit(order_number)
        return Response(AdminOrderSerializer(order, context={"request": request}).data)

    @transaction.atomic
    def delete(self, request, order_number, pk):
        order, item = self._get_item(order_number, pk)
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        if not item:
            return Response({"detail": "Item not found."}, status=status.HTTP_404_NOT_FOUND)
        if order.items.count() <= 1:
            return Response({"detail": "Cannot remove the last item from an order."}, status=status.HTTP_400_BAD_REQUEST)

        item.delete()
        _recalculate_order_totals(order)
        order = _fetch_order_for_items_edit(order_number)
        return Response(AdminOrderSerializer(order, context={"request": request}).data)


class AdminOrderRefundView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_REFUNDS_VIEW,)
    admin_write_capabilities = (CAP_REFUNDS_EDIT,)

    @transaction.atomic
    def post(self, request, order_number):
        order = (
            Order.objects.select_for_update()
            .filter(order_number=order_number)
            .select_related("region", "user")
            .prefetch_related("items__product", "transactions", "status_history__actor", "return_requests__reviewed_by")
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        before_refund_snapshot = {
            "status": order.status,
            "payment_status": order.payment_status,
            "refund_status": order.refund_status,
            "refund_amount": str(order.refund_amount),
            "refund_reference": order.refund_reference,
            "refunded_at": order.refunded_at.isoformat() if order.refunded_at else None,
        }

        raw_amount = request.data.get("amount")
        try:
            refund_amount = Decimal(str(raw_amount if raw_amount not in (None, "") else order.grand_total))
        except Exception:
            return Response({"detail": "Invalid refund amount."}, status=status.HTTP_400_BAD_REQUEST)

        if refund_amount <= 0:
            return Response({"detail": "Refund amount must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
        if refund_amount > order.grand_total:
            return Response({"detail": "Refund amount cannot exceed order total."}, status=status.HTTP_400_BAD_REQUEST)

        mode = str(request.data.get("mode", "gateway")).strip().lower()
        admin_note = str(request.data.get("admin_note", "")).strip()
        manual_reference = str(request.data.get("manual_reference", "")).strip()
        return_request_id = request.data.get("return_request_id")

        latest_paid_tx = (
            PaymentTransaction.objects.filter(order=order, status=PaymentTransaction.STATUS_PAID)
            .order_by("-updated_at", "-id")
            .first()
        )

        refund_response = {}
        provider_key = latest_paid_tx.provider if latest_paid_tx else PaymentTransaction.PROVIDER_BANK_TRANSFER
        provider_reference = manual_reference or f"manual-refund-{timezone.now().strftime('%Y%m%d%H%M%S')}"
        tx_status = PaymentTransaction.STATUS_REFUNDED

        if mode == "gateway":
            if not latest_paid_tx:
                return Response(
                    {"detail": "No paid online transaction available. Use manual mode for offline refunds."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                refund_response = process_gateway_refund(latest_paid_tx, refund_amount)
            except PaymentProviderError as exc:
                return Response(
                    {"error": str(exc), "code": getattr(exc, "code", "refund_error")},
                    status=getattr(exc, "http_status", status.HTTP_400_BAD_REQUEST),
                )
            provider_key = str(refund_response.get("provider") or latest_paid_tx.provider).strip().lower()
            provider_reference = str(refund_response.get("provider_reference") or latest_paid_tx.provider_reference).strip()
            tx_status = str(refund_response.get("status") or PaymentTransaction.STATUS_REFUNDED).strip().lower()
        elif mode != "manual":
            return Response({"detail": "Unsupported refund mode."}, status=status.HTTP_400_BAD_REQUEST)

        PaymentTransaction.objects.update_or_create(
            order=order,
            provider=provider_key,
            provider_reference=provider_reference,
            defaults={
                "amount": refund_amount,
                "currency_code": order.currency_code,
                "status": tx_status,
                "raw_response": refund_response or {
                    "mode": mode,
                    "manual_reference": provider_reference,
                    "admin_note": admin_note,
                },
            },
        )

        order.refund_amount = refund_amount
        order.refund_reference = provider_reference
        order.refund_status = Order.REFUND_REFUNDED if tx_status == PaymentTransaction.STATUS_REFUNDED else Order.REFUND_PROCESSING
        if order.refund_status == Order.REFUND_REFUNDED:
            order.refunded_at = timezone.now()
            order.payment_status = Order.PAYMENT_REFUNDED

            if order.status != Order.STATUS_REFUNDED:
                if order.can_transition_to(Order.STATUS_REFUNDED):
                    order.transition_to(
                        Order.STATUS_REFUNDED,
                        actor=request.user,
                        note=admin_note or "Refund processed.",
                    )
                elif order.can_transition_to(Order.STATUS_RETURNED):
                    order.transition_to(
                        Order.STATUS_RETURNED,
                        actor=request.user,
                        note=admin_note or "Return marked before refund.",
                    )
                    if order.can_transition_to(Order.STATUS_REFUNDED):
                        order.transition_to(
                            Order.STATUS_REFUNDED,
                            actor=request.user,
                            note=admin_note or "Refund processed.",
                        )

            if not order.inventory_released:
                try:
                    release_pending_gift_card_redemption(order, reason="refunded")
                except Exception:
                    logger.exception("Gift card release failed during refund for order %s", order.order_number)
                try:
                    order.restore_inventory()
                except Exception:
                    logger.exception("Inventory restore failed for refunded order %s", order.order_number)

            order.save(
                update_fields=[
                    "refund_amount",
                    "refund_reference",
                    "refund_status",
                    "refunded_at",
                    "payment_status",
                    "updated_at",
                ]
            )
        else:
            order.save(
                update_fields=[
                    "refund_amount",
                    "refund_reference",
                    "refund_status",
                    "updated_at",
                ]
            )

        linked_return_request = None
        if return_request_id:
            linked_return_request = ReturnRequest.objects.filter(pk=return_request_id, order=order).first()
        else:
            linked_return_request = (
                ReturnRequest.objects.filter(order=order, status=ReturnRequest.STATUS_APPROVED)
                .order_by("-requested_at")
                .first()
            )
        if linked_return_request and order.refund_status == Order.REFUND_REFUNDED:
            linked_return_request.status = ReturnRequest.STATUS_REFUNDED
            linked_return_request.reviewed_by = request.user
            if admin_note:
                linked_return_request.admin_note = admin_note
            linked_return_request.save(update_fields=["status", "reviewed_by", "admin_note"])

        order.refresh_from_db()
        log_admin_action(
            request=request,
            actor=request.user,
            action=AdminAuditLog.ACTION_REFUND_ACTION,
            resource_type="order",
            resource_id=order.order_number,
            before_snapshot=before_refund_snapshot,
            after_snapshot={
                "status": order.status,
                "payment_status": order.payment_status,
                "refund_status": order.refund_status,
                "refund_amount": str(order.refund_amount),
                "refund_reference": order.refund_reference,
                "refunded_at": order.refunded_at.isoformat() if order.refunded_at else None,
                "mode": mode,
                "requested_amount": str(refund_amount),
            },
        )
        return Response(
            {
                "order": AdminOrderSerializer(order, context={"request": request}).data,
                "refund": {
                    "mode": mode,
                    "amount": str(refund_amount),
                    "provider": provider_key,
                    "reference": provider_reference,
                    "status": tx_status,
                    "response": refund_response,
                },
            },
            status=status.HTTP_200_OK,
        )


class AdminReturnRequestListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_RETURNS_VIEW,)
    serializer_class = AdminReturnRequestSerializer
    queryset = ReturnRequest.objects.select_related("order", "reviewed_by").all()


class AdminReturnRequestDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_RETURNS_VIEW,)
    admin_write_capabilities = (CAP_RETURNS_EDIT,)
    serializer_class = AdminReturnRequestSerializer
    queryset = ReturnRequest.objects.select_related("order", "reviewed_by").all()

    @transaction.atomic
    def perform_update(self, serializer):
        old_request = self.get_object()
        previous_status = old_request.status
        instance = serializer.save()

        status_changed = previous_status != instance.status
        if status_changed and instance.status in {
            ReturnRequest.STATUS_APPROVED,
            ReturnRequest.STATUS_REJECTED,
            ReturnRequest.STATUS_REFUNDED,
        }:
            instance.reviewed_by = self.request.user
            instance.save(update_fields=["reviewed_by"])

        if status_changed and instance.status == ReturnRequest.STATUS_APPROVED:
            order = instance.order
            if order.can_transition_to(Order.STATUS_RETURNED):
                order.transition_to(
                    Order.STATUS_RETURNED,
                    actor=self.request.user,
                    note=instance.admin_note or "Return request approved.",
                )
            if not order.inventory_released:
                try:
                    order.restore_inventory()
                except Exception:
                    logger.exception("Inventory restore failed for approved return %s", order.order_number)
            if order.refund_status == Order.REFUND_NONE:
                order.refund_status = Order.REFUND_REQUESTED
                order.save(update_fields=["refund_status", "updated_at"])
        elif status_changed and instance.status == ReturnRequest.STATUS_REJECTED:
            order = instance.order
            if order.refund_status == Order.REFUND_REQUESTED:
                order.refund_status = Order.REFUND_NONE
                order.save(update_fields=["refund_status", "updated_at"])


class AdminReviewListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_REVIEWS_VIEW,)
    admin_write_capabilities = (CAP_REVIEWS_EDIT,)
    serializer_class = AdminReviewSerializer
    queryset = Review.objects.select_related("product", "user", "order").all()


class AdminReviewDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_REVIEWS_VIEW,)
    admin_write_capabilities = (CAP_REVIEWS_EDIT,)
    serializer_class = AdminReviewSerializer
    queryset = Review.objects.select_related("product", "user", "order").all()


class AdminCustomerListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_CUSTOMERS_VIEW,)
    admin_write_capabilities = (CAP_CUSTOMERS_EDIT,)
    serializer_class = AdminCustomerSerializer

    def get_queryset(self):
        queryset = get_user_model().objects.all().order_by("-date_joined")
        if not has_admin_capability(self.request.user, CAP_STAFF_MANAGE):
            queryset = queryset.filter(is_staff=False)
        search = _clean_text(self.request.query_params.get("search", ""))
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(addresses__phone__icontains=search)
            ).distinct()
        return queryset

    def perform_create(self, serializer):
        requested_is_staff = bool(serializer.validated_data.get("is_staff"))
        if requested_is_staff and not has_admin_capability(self.request.user, CAP_STAFF_MANAGE):
            raise PermissionDenied("Only Owner/Super Admin can create staff users.")
        user = serializer.save()
        if requested_is_staff:
            log_admin_action(
                request=self.request,
                actor=self.request.user,
                action=AdminAuditLog.ACTION_STAFF_ROLE_CHANGED,
                resource_type="staff_user",
                resource_id=str(user.id),
                before_snapshot={"is_staff": False},
                after_snapshot={"is_staff": True, "username": user.username, "email": user.email},
            )


class AdminCustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_CUSTOMERS_VIEW,)
    admin_write_capabilities = (CAP_CUSTOMERS_EDIT,)
    serializer_class = AdminCustomerSerializer

    def get_queryset(self):
        queryset = get_user_model().objects.all()
        if not has_admin_capability(self.request.user, CAP_STAFF_MANAGE):
            queryset = queryset.filter(is_staff=False)
        return queryset

    def perform_update(self, serializer):
        instance = self.get_object()
        previous_is_staff = bool(instance.is_staff)
        requested_is_staff = serializer.validated_data.get("is_staff", instance.is_staff)
        if requested_is_staff != instance.is_staff and not has_admin_capability(self.request.user, CAP_STAFF_MANAGE):
            raise PermissionDenied("Only Owner/Super Admin can update staff access.")
        user = serializer.save()
        if bool(previous_is_staff) != bool(user.is_staff):
            log_admin_action(
                request=self.request,
                actor=self.request.user,
                action=AdminAuditLog.ACTION_STAFF_ROLE_CHANGED,
                resource_type="staff_user",
                resource_id=str(user.id),
                before_snapshot={"is_staff": previous_is_staff},
                after_snapshot={"is_staff": bool(user.is_staff), "username": user.username, "email": user.email},
            )

    def perform_destroy(self, instance):
        if instance.is_staff and not has_admin_capability(self.request.user, CAP_STAFF_MANAGE):
            raise PermissionDenied("Only Owner/Super Admin can delete staff users.")
        instance.delete()


class AdminPaymentListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_PAYMENTS_VIEW,)
    serializer_class = AdminPaymentTransactionSerializer
    queryset = PaymentTransaction.objects.select_related("order").all()


class AdminPaymentDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_PAYMENTS_VIEW,)
    serializer_class = AdminPaymentTransactionSerializer
    queryset = PaymentTransaction.objects.select_related("order").all()


class AdminRegionListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_REGIONS_VIEW,)
    admin_write_capabilities = (CAP_REGIONS_EDIT,)
    serializer_class = AdminRegionSerializer
    queryset = Region.objects.all()


class AdminRegionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_REGIONS_VIEW,)
    admin_write_capabilities = (CAP_REGIONS_EDIT,)
    serializer_class = AdminRegionSerializer
    queryset = Region.objects.all()
    lookup_field = "code"


class AdminApplyConversionView(AdminCapabilityMixin, APIView):
    """Recompute every non-base region's product prices from the base price × fx_rate."""

    admin_read_capabilities = (CAP_REGIONS_VIEW,)
    admin_write_capabilities = (CAP_REGIONS_EDIT,)

    def post(self, request):
        result = apply_fx_conversion(dry_run=bool(request.data.get("dry_run")))
        if not result.get("ok"):
            return Response(
                {"detail": result.get("error", "Conversion failed.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not result.get("dry_run"):
            log_admin_action(
                request=request,
                actor=request.user,
                action="apply_fx_conversion",
                resource_type="pricing",
                resource_id=result.get("base_region", ""),
                before_snapshot=None,
                after_snapshot={
                    "base_currency": result.get("base_currency"),
                    "updated": result.get("updated"),
                    "created": result.get("created"),
                    "unchanged": result.get("unchanged"),
                },
            )
        return Response(result, status=status.HTTP_200_OK)


class AdminShippingRuleListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_SHIPPING_VIEW,)
    admin_write_capabilities = (CAP_SHIPPING_EDIT,)
    serializer_class = AdminShippingRuleSerializer
    queryset = ShippingRule.objects.select_related("region").all()


class AdminShippingRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_SHIPPING_VIEW,)
    admin_write_capabilities = (CAP_SHIPPING_EDIT,)
    serializer_class = AdminShippingRuleSerializer
    queryset = ShippingRule.objects.select_related("region").all()


class AdminCartMilestoneListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_SHIPPING_VIEW,)
    admin_write_capabilities = (CAP_SHIPPING_EDIT,)
    serializer_class = AdminCartMilestoneSerializer
    queryset = CartMilestone.objects.select_related("region").all()


class AdminCartMilestoneDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_SHIPPING_VIEW,)
    admin_write_capabilities = (CAP_SHIPPING_EDIT,)
    serializer_class = AdminCartMilestoneSerializer
    queryset = CartMilestone.objects.select_related("region").all()


class AdminWarehouseListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_INVENTORY_VIEW,)
    admin_write_capabilities = (CAP_INVENTORY_EDIT,)
    serializer_class = AdminWarehouseSerializer
    queryset = Warehouse.objects.select_related("region").prefetch_related("fulfillment_regions").all()


class AdminWarehouseDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_INVENTORY_VIEW,)
    admin_write_capabilities = (CAP_INVENTORY_EDIT,)
    serializer_class = AdminWarehouseSerializer
    queryset = Warehouse.objects.select_related("region").prefetch_related("fulfillment_regions").all()


class AdminProductStockListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_INVENTORY_VIEW,)
    admin_write_capabilities = (CAP_INVENTORY_EDIT,)
    serializer_class = AdminProductStockSerializer
    queryset = ProductStock.objects.select_related("product", "warehouse", "warehouse__region").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        region_code = self.request.query_params.get("region", "").strip().lower()
        warehouse_code = self.request.query_params.get("warehouse", "").strip().lower()
        product_slug = self.request.query_params.get("product", "").strip().lower()
        if region_code:
            queryset = queryset.filter(warehouse__region__code=region_code)
        if warehouse_code:
            queryset = queryset.filter(warehouse__code=warehouse_code)
        if product_slug:
            queryset = queryset.filter(product__slug=product_slug)
        return queryset


class AdminProductStockDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_INVENTORY_VIEW,)
    admin_write_capabilities = (CAP_INVENTORY_EDIT,)
    serializer_class = AdminProductStockSerializer
    queryset = ProductStock.objects.select_related("product", "warehouse", "warehouse__region").all()


class AdminBlogPostListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    queryset = BlogPost.objects.all()
    serializer_class = AdminBlogPostSerializer
    lookup_field = "slug"

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(title_en__icontains=search)
        return queryset

    def perform_create(self, serializer):
        post = serializer.save()
        post.refresh_from_db()
        log_admin_action(
            request=self.request,
            actor=self.request.user,
            action="blog_content_changed",
            resource_type="blog_post",
            resource_id=post.slug,
            before_snapshot=None,
            after_snapshot=snapshot_instance(post),
        )


class AdminBlogPostDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    queryset = BlogPost.objects.all()
    serializer_class = AdminBlogPostSerializer
    lookup_field = "slug"

    def perform_update(self, serializer):
        post = self.get_object()
        before_snapshot = snapshot_instance(post)
        updated_post = serializer.save()
        updated_post.refresh_from_db()
        log_admin_action(
            request=self.request,
            actor=self.request.user,
            action="blog_content_changed",
            resource_type="blog_post",
            resource_id=updated_post.slug,
            before_snapshot=before_snapshot,
            after_snapshot=snapshot_instance(updated_post),
        )

    def perform_destroy(self, instance):
        before_snapshot = snapshot_instance(instance)
        slug = instance.slug
        instance.delete()
        log_admin_action(
            request=self.request,
            actor=self.request.user,
            action="blog_content_changed",
            resource_type="blog_post",
            resource_id=slug,
            before_snapshot=before_snapshot,
            after_snapshot=None,
        )


class AdminCmsPageListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    queryset = CmsPage.objects.select_related("region").all()
    serializer_class = AdminCmsPageSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        search = str(self.request.query_params.get("search", "") or "").strip()
        if search:
            queryset = queryset.filter(Q(slug__icontains=search) | Q(title_en__icontains=search) | Q(title_ar__icontains=search))
        return queryset


class AdminCmsPageDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    queryset = CmsPage.objects.select_related("region").all()
    serializer_class = AdminCmsPageSerializer


class AdminSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    serializer_class = AdminSiteSettingsSerializer

    def get(self, request):
        settings = SiteSettings.objects.first()
        return Response(AdminSiteSettingsSerializer(settings).data if settings else {})

    def patch(self, request):
        settings = SiteSettings.objects.first()
        before_snapshot = snapshot_instance(settings) if settings else None
        if not settings:
            serializer = AdminSiteSettingsSerializer(data=request.data)
        else:
            serializer = AdminSiteSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_settings = serializer.save()
        log_admin_action(
            request=request,
            actor=request.user,
            action=AdminAuditLog.ACTION_SITE_SETTINGS_CHANGED,
            resource_type="site_settings",
            resource_id=str(updated_settings.id),
            before_snapshot=before_snapshot,
            after_snapshot=snapshot_instance(updated_settings),
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


def _paymob_audit_snapshot(row):
    """Audit snapshot for a PaymobRegionConfig that never records raw secrets."""
    if row is None:
        return None
    return {
        "region_code":    row.region_code,
        "enabled":        row.enabled,
        "integration_id": row.integration_id,
        "iframe_id":      row.iframe_id,
        "base_url":       row.base_url,
        "currency":       row.currency,
        "api_key_set":     bool((row.api_key or "").strip()),
        "hmac_secret_set": bool((row.hmac_secret or "").strip()),
    }


class AdminPaymobRegionConfigView(APIView):
    """Region-aware Paymob credentials, manageable from the admin panel.

    GET   → status of all supported regions (Oman / Saudi / UAE), including
            whether each is active, disabled, or setup-pending. Secrets are
            never returned — only boolean "is set" / "is resolved" indicators.
    PATCH → update a single region (body must include ``region_code``). Blank
            credential fields are ignored so they never overwrite a working
            value (DB or env fallback).
    """

    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_CONTENT_VIEW,)
    admin_write_capabilities = (CAP_CONTENT_EDIT,)
    serializer_class = AdminPaymobRegionConfigSerializer

    def _region_payload(self, region_code):
        from ..services.payment_config import get_paymob_config, paymob_config_is_complete

        row = PaymobRegionConfig.objects.filter(region_code=region_code).first()
        instance = row or PaymobRegionConfig(region_code=region_code)
        data = AdminPaymobRegionConfigSerializer(instance).data

        # Resolved view = what the gateway would actually use (DB layered over
        # env). Exposes only booleans for secrets, never the values themselves.
        cfg = get_paymob_config(region_code.lower())
        configured = paymob_config_is_complete(cfg)
        enabled = cfg.get("enabled", True)
        data["resolved"] = {
            "enabled":            enabled,
            "currency":           cfg.get("currency", ""),
            "base_url":           cfg.get("base_url", ""),
            "has_api_key":        bool(cfg.get("api_key")),
            "has_integration_id": bool(cfg.get("integration_id")),
            "has_iframe_id":      bool(cfg.get("iframe_id")),
            "has_hmac_secret":    bool(cfg.get("hmac_secret")),
        }
        data["configured"] = configured
        data["available"] = bool(configured)
        if not enabled:
            data["status"] = "disabled"
        elif configured:
            data["status"] = "active"
        else:
            data["status"] = "setup_pending"
        data["has_db_row"] = row is not None
        return data

    def get(self, request):
        regions = [self._region_payload(code) for code in PaymobRegionConfig.DEFAULT_CURRENCY.keys()]
        return Response({"regions": regions})

    def patch(self, request):
        region_code = str(request.data.get("region_code") or "").strip().upper()
        valid_codes = {choice[0] for choice in PaymobRegionConfig.REGION_CHOICES}
        if region_code not in valid_codes:
            return Response(
                {"detail": f"region_code must be one of {sorted(valid_codes)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        row, _created = PaymobRegionConfig.objects.get_or_create(region_code=region_code)
        before_snapshot = _paymob_audit_snapshot(row)
        serializer = AdminPaymobRegionConfigSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        log_admin_action(
            request=request,
            actor=request.user,
            action=AdminAuditLog.ACTION_SITE_SETTINGS_CHANGED,
            resource_type="paymob_region_config",
            resource_id=region_code,
            before_snapshot=before_snapshot,
            after_snapshot=_paymob_audit_snapshot(updated),
        )
        return Response(self._region_payload(region_code), status=status.HTTP_200_OK)


class AdminGiftCardListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_GIFTCARDS_VIEW,)
    admin_write_capabilities = (CAP_GIFTCARDS_EDIT,)
    queryset = GiftCard.objects.all()
    serializer_class = AdminGiftCardSerializer


class AdminGiftCardDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_GIFTCARDS_VIEW,)
    admin_write_capabilities = (CAP_GIFTCARDS_EDIT,)
    queryset = GiftCard.objects.all()
    serializer_class = AdminGiftCardSerializer


class AdminBackInStockRequestListView(StaffListCreateView):
    admin_read_capabilities = (CAP_INVENTORY_VIEW,)
    admin_write_capabilities = (CAP_INVENTORY_EDIT,)
    queryset = BackInStockRequest.objects.select_related("product", "region", "user").all()
    serializer_class = AdminBackInStockRequestSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = str(self.request.query_params.get("status", "") or "").strip().lower()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        region_code = str(self.request.query_params.get("region", "") or "").strip().lower()
        if region_code:
            queryset = queryset.filter(region__code=region_code)
        return queryset


class AdminBackInStockRequestDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_INVENTORY_VIEW,)
    admin_write_capabilities = (CAP_INVENTORY_EDIT,)
    queryset = BackInStockRequest.objects.select_related("product", "region", "user").all()
    serializer_class = AdminBackInStockRequestSerializer


class AdminAbandonedCartListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ABANDONED_VIEW,)
    serializer_class = AdminAbandonedCartSerializer

    def get_queryset(self):
        queryset = AbandonedCart.objects.select_related("region").order_by("-abandoned_at")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        else:
            # Default: only show actionable carts — exclude recovered (= completed orders) and lost
            queryset = queryset.filter(
                status__in=[AbandonedCart.STATUS_ABANDONED, AbandonedCart.STATUS_CONTACTED]
            )
        return queryset


class AdminAbandonedCartDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ABANDONED_VIEW,)
    admin_write_capabilities = (CAP_ABANDONED_EDIT,)
    queryset = AbandonedCart.objects.all()
    serializer_class = AdminAbandonedCartSerializer


class AnalyticsEventCreateView(APIView):
    """
    Public endpoint for recording real storefront analytics events.

    Called by the Next.js storefront on: page load (page_view), product detail
    page load (product_view), add-to-cart action (add_to_cart), and checkout page
    load (checkout_initiated).

    Authentication is intentionally not required — all visitors (including guests)
    must be able to record events. Rate-limited by the 'analytics' throttle scope.

    Body: {
        event_type: "page_view" | "product_view" | "add_to_cart" | "checkout_initiated",
        session_key: "<uuid>",           # localStorage-persisted anonymous visitor ID
        product_slug: "<slug>",          # optional, for product_view / add_to_cart
        region_code: "om" | "ae" | "sa", # optional
    }
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = "analytics"

    VALID_EVENT_TYPES = {
        AnalyticsEvent.EVENT_PAGE_VIEW,
        AnalyticsEvent.EVENT_PRODUCT_VIEW,
        AnalyticsEvent.EVENT_ADD_TO_CART,
        AnalyticsEvent.EVENT_CHECKOUT_INITIATED,
    }

    @extend_schema(responses=dict)
    def post(self, request):
        event_type = str(request.data.get("event_type") or "").strip()
        if event_type not in self.VALID_EVENT_TYPES:
            return Response({"error": "Invalid event_type."}, status=status.HTTP_400_BAD_REQUEST)

        session_key = str(request.data.get("session_key") or "").strip()[:64]
        if not session_key:
            return Response({"error": "session_key is required."}, status=status.HTTP_400_BAD_REQUEST)

        product_slug = str(request.data.get("product_slug") or "").strip()
        region_code = str(request.data.get("region_code") or "").strip().lower()
        metadata = request.data.get("metadata") if isinstance(request.data.get("metadata"), dict) else {}
        safe_metadata = {}
        for key, value in metadata.items():
            if key not in {
                "session_key",
                "source",
                "medium",
                "campaign",
                "utm_source",
                "utm_medium",
                "utm_campaign",
                "utm_content",
                "utm_term",
                "referrer",
                "landing_page",
                "current_page",
                "region_code",
            }:
                continue
            text = str(value).strip()
            if text:
                safe_metadata[key] = text[:500]

        product = Product.objects.filter(slug=product_slug).only("id").first() if product_slug else None
        region = Region.objects.filter(code=region_code, is_active=True).only("id").first() if region_code else None
        user = request.user if request.user and request.user.is_authenticated else None

        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        client_ip = (forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR", ""))[:45]
        if client_ip:
            safe_metadata["_ip"] = client_ip

        AnalyticsEvent.objects.create(
            event_type=event_type,
            session_key=session_key,
            user=user,
            product=product,
            region=region,
            metadata=safe_metadata,
        )
        return Response({"status": "ok"}, status=status.HTTP_201_CREATED)


_IP_COUNTRY_CACHE = {}


def _lookup_countries_batch(ips):
    """Return {ip: country_code} dict using ip-api.com batch endpoint (free, no key needed)."""
    uncached = [ip for ip in ips if ip not in _IP_COUNTRY_CACHE]
    if uncached:
        try:
            import requests as req
            resp = req.post(
                "http://ip-api.com/batch?fields=query,countryCode",
                json=[{"query": ip} for ip in uncached[:100]],
                timeout=3,
            )
            if resp.status_code == 200:
                for row in resp.json():
                    ip = row.get("query", "")
                    code = row.get("countryCode", "")
                    if ip:
                        _IP_COUNTRY_CACHE[ip] = code
        except Exception:
            pass
    return {ip: _IP_COUNTRY_CACHE.get(ip, "") for ip in ips}


class AdminLiveVisitorsView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = ("analytics.view",)

    @extend_schema(responses=dict)
    def get(self, request):
        minutes = int(request.query_params.get("minutes", 5))
        minutes = max(1, min(60, minutes))
        cutoff = timezone.now() - timedelta(minutes=minutes)

        events = (
            AnalyticsEvent.objects.filter(
                event_type=AnalyticsEvent.EVENT_PAGE_VIEW,
                created_at__gte=cutoff,
            )
            .values("session_key", "metadata")
        )

        sessions = {}
        for ev in events:
            sk = ev["session_key"]
            if sk not in sessions:
                sessions[sk] = ev.get("metadata") or {}

        all_ips = list({m.get("_ip", "") for m in sessions.values() if m.get("_ip")})
        ip_country = _lookup_countries_batch(all_ips) if all_ips else {}

        country_counts = {}
        for meta in sessions.values():
            ip = meta.get("_ip", "")
            code = ip_country.get(ip, "") if ip else ""
            if not code:
                code = "??"
            country_counts[code] = country_counts.get(code, 0) + 1

        unknown = country_counts.pop("??", 0)

        return Response({
            "live_sessions": len(sessions),
            "window_minutes": minutes,
            "countries": country_counts,
            "unknown": unknown,
        })


class AbandonedCartCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=dict)
    def post(self, request):
        data = request.data
        region_code = data.get("region")
        region = None
        if region_code:
            region = Region.objects.filter(code=region_code).first()

        session_token = (data.get("session_token") or "").strip()
        # Always ensure a non-empty session_token so update_or_create works correctly.
        # An empty token would cause every request to create a new record.
        if not session_token:
            session_token = f"anon-{uuid.uuid4()}"
        defaults = {
            "customer_name": data.get("customer_name", ""),
            "customer_email": data.get("customer_email", ""),
            "customer_phone": data.get("customer_phone", ""),
            "cart_items": data.get("cart_items", []),
            "subtotal": data.get("subtotal", 0),
            "currency_code": data.get("currency_code", "OMR"),
            "region": region,
            "locale": data.get("locale", "en"),
        }
        try:
            cart, _ = AbandonedCart.objects.update_or_create(
                session_token=session_token,
                defaults=defaults,
            )
        except AbandonedCart.MultipleObjectsReturned:
            # Duplicate session_token records from before the unique-token fix.
            # Keep the newest record, delete the rest, then update it.
            duplicates = AbandonedCart.objects.filter(session_token=session_token).order_by("-abandoned_at")
            cart = duplicates.first()
            duplicates.exclude(pk=cart.pk).delete()
            for key, value in defaults.items():
                setattr(cart, key, value)
            cart.save()

        # If this cart was just created (status=abandoned) but the customer has
        # already placed an order with the same session/email/phone, mark it
        # recovered immediately so it never shows as a ghost abandoned entry.
        if cart.status == AbandonedCart.STATUS_ABANDONED:
            customer_email = defaults.get("customer_email", "")
            customer_phone = defaults.get("customer_phone", "")
            order_q = Q(conversion_session_key=session_token)
            if customer_email:
                order_q |= Q(customer_email=customer_email)
            if customer_phone:
                order_q |= Q(customer_phone=customer_phone)
            already_ordered = Order.objects.filter(order_q).exists()
            if already_ordered:
                cart.status = AbandonedCart.STATUS_RECOVERED
                cart.save(update_fields=["status"])

        return Response({"id": cart.id, "status": cart.status}, status=status.HTTP_201_CREATED)
