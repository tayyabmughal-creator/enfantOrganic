import csv
import logging
from datetime import datetime
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.http import FileResponse, HttpResponse
from django.utils.dateparse import parse_date
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db import transaction
from django.db.models import Count, Sum, Q
from django.db.models.functions import TruncMonth

from ..models import (
    AbandonedCart,
    AdminAuditLog,
    AnalyticsEvent,
    BlogPost,
    Category,
    Coupon,
    GiftCard,
    HeroPromoCard,
    InstagramPost,
    NewsletterSubscription,
    NotificationLog,
    Order,
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
    TaxRule,
    Warehouse,
)
from ..api_serializers.admin_ops import (
    AdminAbandonedCartSerializer,
    AdminAuditLogSerializer,
    AdminBlogPostSerializer,
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
    AdminTaxRuleSerializer,
    AdminWarehouseSerializer,
)
from ..notifications import notify_admins_low_stock, notify_admins_paid_order, notify_admins_payment_review
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
from ..services.invoice import ensure_paid_order_invoice
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


logger = logging.getLogger(__name__)


# GCC storefront currencies normalized to OMR for cross-market analytics.
# These can be overridden in the future via settings if needed.
ANALYTICS_TO_OMR_RATE = {
    "OMR": Decimal("1.0"),
    "AED": Decimal("0.1040"),
    "SAR": Decimal("0.1026"),
}


def _sum_money_in_omr(queryset, amount_field):
    rows = queryset.values("currency_code").annotate(total=Sum(amount_field))
    total = Decimal("0.0")
    for row in rows:
        currency = str(row.get("currency_code") or "OMR").upper()
        rate = ANALYTICS_TO_OMR_RATE.get(currency, Decimal("1.0"))
        total += Decimal(row.get("total") or 0) * rate
    return float(total)


def _analytics_money_total(rows):
    total = Decimal("0.0")
    for row in rows:
        currency = str(row.get("currency_code") or "OMR").upper()
        rate = ANALYTICS_TO_OMR_RATE.get(currency, Decimal("1.0"))
        total += Decimal(row.get("total") or 0) * rate
    return float(total)


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
            rows = channel_qs.values("currency_code").annotate(total=Sum("grand_total"))
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
            return True

        return all(has_admin_capability(user, capability) for capability in required_capabilities)


class AdminCapabilityMixin:
    admin_read_capabilities = ()
    admin_write_capabilities = ()
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
        base_orders = Order.objects.all()
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

        scoped_paid_orders = scoped_orders.filter(payment_status=Order.PAYMENT_PAID)

        if top_date_range == "all_time":
            current_period_orders = base_orders.filter(created_at__gte=this_month_start)
            previous_period_orders = base_orders.filter(created_at__gte=last_month_start, created_at__lt=this_month_start)
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

        current_period_paid = current_period_orders.filter(payment_status=Order.PAYMENT_PAID)
        previous_period_paid = previous_period_orders.filter(payment_status=Order.PAYMENT_PAID)

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
        total_customers = (
            scoped_orders.exclude(customer_email="")
            .values("customer_email")
            .distinct()
            .count()
            + scoped_orders.filter(customer_email="")
            .exclude(user_id__isnull=True)
            .values("user_id")
            .distinct()
            .count()
        )
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
        monthly_customers = (
            current_period_orders.exclude(customer_email="")
            .values("customer_email")
            .distinct()
            .count()
            + current_period_orders.filter(customer_email="")
            .exclude(user_id__isnull=True)
            .values("user_id")
            .distinct()
            .count()
        )

        if top_market == "all":
            prev_revenue = _sum_money_in_omr(previous_period_paid, "grand_total")
        else:
            prev_revenue = float(previous_period_paid.aggregate(total=Sum("grand_total"))["total"] or 0)
        prev_orders = previous_period_orders.count()
        prev_customers = (
            previous_period_orders.exclude(customer_email="")
            .values("customer_email")
            .distinct()
            .count()
            + previous_period_orders.filter(customer_email="")
            .exclude(user_id__isnull=True)
            .values("user_id")
            .distinct()
            .count()
        )

        # Conversion breakdown using real AnalyticsEvent data.
        # Period window mirrors current_period_orders (this month / last N days / custom range).
        if top_date_range == "all_time":
            event_period_start = this_month_start
            event_prev_start = last_month_start
            event_prev_end = this_month_start
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

        def _period_events(start, end=None):
            qs = AnalyticsEvent.objects.filter(created_at__gte=start)
            if end:
                qs = qs.filter(created_at__lt=end)
            if top_market != "all":
                qs = qs.filter(region__code=top_market)
            return qs

        curr_events = _period_events(event_period_start)
        prev_events = _period_events(event_prev_start, event_prev_end)

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

        avg_order_value = round(total_revenue / total_orders, 2) if total_orders else 0

        # Real conversion rate: paid orders / total orders
        conversion_rate = round((scoped_paid_orders.count() / total_orders) * 100, 1) if total_orders else 0

        # Real repeat rate: customers with >1 order / customers with any order
        customer_order_counts = (
            scoped_orders.exclude(customer_email="")
            .values("customer_email")
            .annotate(order_count=Count("id"))
        )
        repeat_customers = customer_order_counts.filter(order_count__gt=1).count()
        total_customers_with_orders = customer_order_counts.count()
        repeat_rate = round((repeat_customers / total_customers_with_orders) * 100, 1) if total_customers_with_orders else 0

        # Real cart abandonment rate: abandoned carts / (abandoned carts + paid orders in scope)
        # Uses the same date + market scope as the rest of the dashboard.
        scoped_abandoned_carts_count = current_period_carts.count()
        scoped_paid_count = scoped_paid_orders.count()
        abandonment_rate = (
            round(scoped_abandoned_carts_count / (scoped_abandoned_carts_count + scoped_paid_count) * 100, 1)
            if (scoped_abandoned_carts_count + scoped_paid_count)
            else 0
        )

        if top_market == "all":
            by_month_currency = (
                scoped_paid_orders.annotate(month=TruncMonth("created_at"))
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
                rate = ANALYTICS_TO_OMR_RATE.get(currency, Decimal("1.0"))
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

        # Customers trend — distinct customer emails per month for sparkline
        customers_trend = [
            {
                "label": item["month"].strftime("%b %Y"),
                "value": item["total"],
            }
            for item in scoped_orders.exclude(customer_email="")
            .annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(total=Count("customer_email", distinct=True))
            .order_by("month")[:12]
        ]

        # Status mix follows the active dashboard scope (date + market).
        status_mix = list(scoped_orders.values("status").annotate(count=Count("id")).order_by("status"))
        sales_channel_orders = scoped_orders.exclude(
            status__in=[
                Order.STATUS_CANCELLED,
                Order.STATUS_FAILED,
                Order.STATUS_REFUNDED,
            ]
        )
        previous_sales_channel_orders = previous_period_orders.exclude(
            status__in=[
                Order.STATUS_CANCELLED,
                Order.STATUS_FAILED,
                Order.STATUS_REFUNDED,
            ]
        )
        sales_by_channel = _build_sales_channel_summary(
            sales_channel_orders,
            previous_sales_channel_orders,
            currency_code=dashboard_currency_code,
            convert_to_omr=top_market == "all",
        )

        top_paid_orders = scoped_paid_orders

        top_products = []
        metric_label = {
            "rating": "By rating",
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
                for raw in raw_rows:
                    product_id = raw["id"]
                    currency = str(raw.get("orderitem__order__currency_code") or "OMR").upper()
                    rate = float(ANALYTICS_TO_OMR_RATE.get(currency, Decimal("1.0")))
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

            repeat_purchase_counts = {
                row["items__product_id"]: int(row["repeat_customers"] or 0)
                for row in (
                    top_paid_orders
                    .filter(items__product_id__isnull=False)
                    .exclude(customer_email="")
                    .values("items__product_id", "customer_email")
                    .annotate(order_count=Count("id", distinct=True))
                    .filter(order_count__gt=1)
                    .values("items__product_id")
                    .annotate(repeat_customers=Count("customer_email", distinct=True))
                )
            }

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

        return Response(
            {
                "revenue": total_revenue,
                "currency_code": dashboard_currency_code,
                "revenue_delta": pct_change(monthly_revenue, prev_revenue),
                "monthly_revenue": monthly_revenue,
                "orders": total_orders,
                "orders_delta": pct_change(monthly_orders, prev_orders),
                "pending_orders": pending_orders,
                "paid_orders": scoped_paid_orders.count(),
                "customers": total_customers,
                "customers_delta": pct_change(monthly_customers, prev_customers),
                "products": total_products,
                "avg_order_value": avg_order_value,
                "conversion_rate": conversion_rate,
                "abandonment_rate": abandonment_rate,
                "repeat_rate": repeat_rate,
                "conversion_breakdown": {
                    "overall_rate": current_overall_conversion,
                    "overall_delta": pct_change(current_overall_conversion, previous_overall_conversion),
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
                    .order_by("-date_joined")
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
        paid_orders = orders.filter(payment_status=Order.PAYMENT_PAID)

        # Regional revenue split
        regional_revenue = {}
        for region in Region.objects.filter(is_active=True):
            region_orders = paid_orders.filter(region=region)
            region_total = Decimal(region_orders.aggregate(total=Sum("grand_total"))["total"] or 0)
            rate = ANALYTICS_TO_OMR_RATE.get(str(region.currency_code or "OMR").upper(), Decimal("1.0"))
            regional_revenue[region.code] = {
                "name": region.name_en or region.code.upper(),
                "currency_code": region.currency_code,
                "revenue": float(region_total),
                "revenue_omr": float(region_total * rate),
                "orders": region_orders.count(),
            }

        # Conversion funnel — real AnalyticsEvent counts (all-time, no date filter applied here)
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
            rate = ANALYTICS_TO_OMR_RATE.get(currency, Decimal("1.0"))
            converted = Decimal(row.get("total") or 0) * rate
            month_map[month] = month_map.get(month, Decimal("0.0")) + converted
        revenue_trend = [
            {
                "label": month.strftime("%b %Y"),
                "value": float(total),
            }
            for month, total in sorted(month_map.items(), key=lambda item: item[0])[:12]
        ]

        return Response({
            "visitors": funnel_visitors,
            "product_views": funnel_product_views,
            "cart_adds": funnel_cart_adds,
            "checkouts": funnel_checkouts,
            "completed_orders": paid_orders_count,
            "abandoned_orders": cancelled_orders_count,
            "conversion_rate": round((paid_orders_count / total_orders_count) * 100, 1) if total_orders_count else 0,
            "region_om": regional_revenue.get("om", {}),
            "region_ae": regional_revenue.get("ae", {}),
            "region_sa": regional_revenue.get("sa", {}),
            "regional_revenue": regional_revenue,
            "revenue_trend": revenue_trend,
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


class AdminTaxRuleListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_REGIONS_VIEW,)
    admin_write_capabilities = (CAP_REGIONS_EDIT,)
    queryset = TaxRule.objects.select_related("region").all()
    serializer_class = AdminTaxRuleSerializer


class AdminTaxRuleDetailView(StaffRetrieveUpdateDestroyView):
    admin_read_capabilities = (CAP_REGIONS_VIEW,)
    admin_write_capabilities = (CAP_REGIONS_EDIT,)
    queryset = TaxRule.objects.select_related("region").all()
    serializer_class = AdminTaxRuleSerializer


class AdminProductListCreateView(StaffListCreateView):
    admin_read_capabilities = (CAP_PRODUCTS_VIEW,)
    admin_write_capabilities = (CAP_PRODUCTS_EDIT,)
    queryset = Product.objects.select_related("category").prefetch_related("tags", "prices__region").all()
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
    queryset = Product.objects.select_related("category").prefetch_related("tags", "prices__region").all()
    serializer_class = AdminProductSerializer
    lookup_field = "slug"


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
        queryset = Order.objects.select_related("region", "user").prefetch_related("items", "transactions", "status_history__actor")
        status_filter = self.request.query_params.get("status", "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class AdminOrderDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ORDERS_VIEW,)
    admin_write_capabilities = (CAP_ORDERS_EDIT,)
    serializer_class = AdminOrderSerializer
    lookup_field = "order_number"
    queryset = Order.objects.select_related("region", "user").prefetch_related("items", "transactions", "status_history__actor")

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
            try:
                order.restore_inventory()
                order.refresh_from_db()
            except Exception:
                logger.exception("Inventory restore failed for order %s after status=%s", order.order_number, order.status)

        if previous_payment_status != order.payment_status:
            if order.payment_status == Order.PAYMENT_PAID:
                notify_admins_paid_order(order)
            elif order.payment_status == Order.PAYMENT_REVIEW:
                notify_admins_payment_review(order)
            elif order.payment_status == Order.PAYMENT_REFUNDED:
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


class AdminOrderShipmentCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_write_capabilities = (CAP_ORDERS_EDIT,)

    def post(self, request, order_number):
        order = (
            Order.objects.filter(order_number=order_number)
            .select_related("region")
            .prefetch_related("items", "transactions", "status_history__actor")
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
            .prefetch_related("items", "transactions", "status_history__actor")
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

        if order.payment_status != Order.PAYMENT_PAID:
            return Response(
                {"detail": "Invoice is available after payment confirmation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = ensure_paid_order_invoice(order)
        if not order.invoice_pdf:
            return Response({"detail": "Invoice is not available yet."}, status=status.HTTP_404_NOT_FOUND)

        order.invoice_pdf.open("rb")
        filename = f"{order.invoice_number or order.order_number}.pdf"
        return FileResponse(order.invoice_pdf, as_attachment=True, filename=filename)


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
            .prefetch_related("items", "transactions")
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


class AdminPaymentListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_PAYMENTS_VIEW,)
    admin_write_capabilities = (CAP_PAYMENTS_EDIT,)
    serializer_class = AdminPaymentTransactionSerializer
    queryset = PaymentTransaction.objects.select_related("order").all()


class AdminPaymentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_PAYMENTS_VIEW,)
    admin_write_capabilities = (CAP_PAYMENTS_EDIT,)
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


class AdminAbandonedCartListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_ABANDONED_VIEW,)
    serializer_class = AdminAbandonedCartSerializer

    def get_queryset(self):
        queryset = AbandonedCart.objects.all()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
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

        product = Product.objects.filter(slug=product_slug).only("id").first() if product_slug else None
        region = Region.objects.filter(code=region_code, is_active=True).only("id").first() if region_code else None
        user = request.user if request.user and request.user.is_authenticated else None

        AnalyticsEvent.objects.create(
            event_type=event_type,
            session_key=session_key,
            user=user,
            product=product,
            region=region,
        )
        return Response({"status": "ok"}, status=status.HTTP_201_CREATED)


class AbandonedCartCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=dict)
    def post(self, request):
        data = request.data
        region_code = data.get("region")
        region = None
        if region_code:
            region = Region.objects.filter(code=region_code).first()

        cart = AbandonedCart.objects.create(
            session_token=data.get("session_token", ""),
            customer_name=data.get("customer_name", ""),
            customer_email=data.get("customer_email", ""),
            customer_phone=data.get("customer_phone", ""),
            cart_items=data.get("cart_items", []),
            subtotal=data.get("subtotal", 0),
            currency_code=data.get("currency_code", "OMR"),
            region=region,
            locale=data.get("locale", "en"),
        )
        return Response({"id": cart.id, "status": cart.status}, status=status.HTTP_201_CREATED)
