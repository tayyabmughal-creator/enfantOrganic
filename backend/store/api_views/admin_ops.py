import csv
import logging
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db import transaction
from django.db.models import Count, F, Sum
from django.db.models.functions import TruncMonth

from ..models import (
    AdminAuditLog,
    BlogPost,
    Category,
    Coupon,
    NotificationLog,
    Order,
    PaymentTransaction,
    Product,
    ProductStock,
    PushDevice,
    Region,
    ReturnRequest,
    Review,
    ShippingRule,
    SiteSettings,
    Warehouse,
)
from ..api_serializers.admin_ops import (
    AdminAuditLogSerializer,
    AdminBlogPostSerializer,
    AdminCategorySerializer,
    AdminCouponSerializer,
    AdminCustomerSerializer,
    AdminOrderSerializer,
    AdminPaymentTransactionSerializer,
    AdminProductSerializer,
    AdminRegionSerializer,
    AdminReturnRequestSerializer,
    AdminReviewSerializer,
    AdminShippingRuleSerializer,
    AdminSiteSettingsSerializer,
    AdminProductStockSerializer,
    AdminWarehouseSerializer,
)
from ..notifications import notify_admins_low_stock, notify_admins_paid_order, notify_admins_payment_review
from ..services.admin_roles import (
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
from ..services.payment_router import PaymentProviderError, refund as process_gateway_refund
from ..services.shipment import (
    ShipmentServiceError,
    create_order_shipment,
    refresh_order_tracking,
    should_auto_create_shipment,
    update_manual_tracking,
)


logger = logging.getLogger(__name__)


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
        now = timezone.now()
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)

        User = get_user_model()
        orders = Order.objects.all()
        paid_orders = orders.filter(payment_status=Order.PAYMENT_PAID)
        low_stock = ProductStock.objects.select_related("product", "warehouse").filter(
            warehouse__active=True,
            quantity__lte=F("low_stock_threshold"),
        )

        total_revenue = float(paid_orders.aggregate(total=Sum("grand_total"))["total"] or 0)
        total_orders = orders.count()
        total_customers = User.objects.filter(is_staff=False).count()
        total_products = Product.objects.filter(is_published=True).count()
        pending_orders = orders.filter(status=Order.STATUS_PENDING).count()

        # Current month
        monthly_paid = paid_orders.filter(created_at__gte=this_month_start)
        monthly_revenue = float(monthly_paid.aggregate(total=Sum("grand_total"))["total"] or 0)
        monthly_orders = orders.filter(created_at__gte=this_month_start).count()
        monthly_customers = User.objects.filter(is_staff=False, date_joined__gte=this_month_start).count()

        # Previous month
        prev_paid = paid_orders.filter(created_at__gte=last_month_start, created_at__lt=this_month_start)
        prev_revenue = float(prev_paid.aggregate(total=Sum("grand_total"))["total"] or 0)
        prev_orders = orders.filter(created_at__gte=last_month_start, created_at__lt=this_month_start).count()
        prev_customers = User.objects.filter(is_staff=False, date_joined__gte=last_month_start, date_joined__lt=this_month_start).count()

        def pct_change(current, previous):
            if not previous:
                return None
            return round(((current - previous) / previous) * 100, 1)

        avg_order_value = round(total_revenue / total_orders, 2) if total_orders else 0

        revenue_trend = [
            {
                "label": item["month"].strftime("%b %Y"),
                "value": float(item["total"] or 0),
            }
            for item in paid_orders.annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(total=Sum("grand_total"))
            .order_by("month")[:12]
        ]
        status_mix = list(orders.values("status").annotate(count=Count("id")).order_by("status"))

        return Response(
            {
                "revenue": total_revenue,
                "revenue_delta": pct_change(monthly_revenue, prev_revenue),
                "monthly_revenue": monthly_revenue,
                "orders": total_orders,
                "orders_delta": pct_change(monthly_orders, prev_orders),
                "pending_orders": pending_orders,
                "paid_orders": paid_orders.count(),
                "customers": total_customers,
                "customers_delta": pct_change(monthly_customers, prev_customers),
                "products": total_products,
                "avg_order_value": avg_order_value,
                "conversion_rate": 0,
                "abandonment_rate": 0,
                "repeat_rate": 0,
                "low_stock": low_stock.count(),
                "low_stock_products": low_stock.values("product_id").distinct().count(),
                "revenue_trend": revenue_trend,
                "status_mix": status_mix,
                "top_products": list(
                    Product.objects.filter(is_published=True)
                    .order_by("-review_count", "-rating")
                    .values("slug", "name_en", "stock_quantity")[:8]
                ),
                "recent_orders": list(
                    orders.order_by("-created_at").values(
                        "order_number",
                        "customer_name",
                        "grand_total",
                        "currency_code",
                        "status",
                        "payment_status",
                        "created_at",
                    )[:10]
                ),
                "recent_customers": list(
                    User.objects.filter(is_staff=False)
                    .order_by("-date_joined")
                    .values("id", "username", "email", "first_name", "last_name", "date_joined")[:10]
                ),
            }
        )


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
                products = products.filter(track_inventory=True, stock_quantity__lte=10)
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


class AdminRegionListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, HasAdminCapability]
    admin_read_capabilities = (CAP_REGIONS_VIEW,)
    serializer_class = AdminRegionSerializer
    queryset = Region.objects.all()


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
