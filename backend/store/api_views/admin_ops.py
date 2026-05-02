import csv

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth

from ..models import Category, Coupon, NotificationLog, Order, PaymentTransaction, Product, PushDevice, Region, Review, SiteSettings
from ..api_serializers.admin_ops import (
    AdminCategorySerializer,
    AdminCouponSerializer,
    AdminCustomerSerializer,
    AdminOrderSerializer,
    AdminPaymentTransactionSerializer,
    AdminProductSerializer,
    AdminRegionSerializer,
    AdminReviewSerializer,
    AdminSiteSettingsSerializer,
)
from ..notifications import notify_admins_low_stock, notify_admins_paid_order, notify_admins_payment_review


class IsStaffUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_staff)


class AdminDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    @extend_schema(responses=dict)
    def get(self, request):
        orders = Order.objects.all()
        low_stock = Product.objects.filter(track_inventory=True, stock_quantity__lte=10)
        paid_orders = orders.filter(payment_status=Order.PAYMENT_PAID)
        revenue_trend = [
            {
                "label": item["month"].strftime("%b %Y"),
                "value": float(item["total"] or 0),
            }
            for item in paid_orders.annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(total=Sum("grand_total"))
            .order_by("month")[:6]
        ]
        status_mix = list(orders.values("status").annotate(count=Count("id")).order_by("status"))
        total_sales = paid_orders.aggregate(total=Sum("grand_total"))["total"] or 0
        return Response(
            {
                "revenue": total_sales,
                "total_sales": total_sales,
                "monthly_revenue": paid_orders.filter(created_at__month=timezone.now().month).aggregate(total=Sum("grand_total"))["total"] or 0,
                "orders": orders.count(),
                "total_orders": orders.count(),
                "pending_orders": orders.filter(status=Order.STATUS_PENDING).count(),
                "paid_orders": paid_orders.count(),
                "customers": get_user_model().objects.filter(is_staff=False).count(),
                "low_stock": low_stock.count(),
                "low_stock_products": low_stock.count(),
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
            }
        )


class ReportCsvView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    @extend_schema(responses={200: bytes})
    def get(self, request, report_type):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{report_type}-{timezone.localdate()}.csv"'
        writer = csv.writer(response)

        if report_type == "orders":
            writer.writerow(["order_number", "customer", "phone", "status", "payment_status", "total", "currency"])
            for order in Order.objects.all():
                writer.writerow([
                    order.order_number,
                    order.customer_name,
                    order.customer_phone,
                    order.status,
                    order.payment_status,
                    order.grand_total,
                    order.currency_code,
                ])
        elif report_type == "customers":
            writer.writerow(["id", "username", "email", "first_name", "last_name", "date_joined"])
            for user in get_user_model().objects.all():
                writer.writerow([user.id, user.username, user.email, user.first_name, user.last_name, user.date_joined])
        elif report_type in {"inventory", "low-stock"}:
            writer.writerow(["slug", "name", "brand", "stock_quantity", "track_inventory", "active"])
            products = Product.objects.all()
            if report_type == "low-stock":
                products = products.filter(track_inventory=True, stock_quantity__lte=10)
            for product in products:
                writer.writerow([
                    product.slug,
                    product.name_en,
                    product.brand,
                    product.stock_quantity,
                    product.track_inventory,
                    product.is_published,
                ])
        else:
            writer.writerow(["error"])
            writer.writerow(["Unknown report type."])

        return response


class AdminModerationSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]

    @extend_schema(responses=dict)
    def get(self, request):
        return Response(
            {
                "reviews_pending": Review.objects.filter(is_approved=False).count(),
                "active_push_devices": PushDevice.objects.filter(is_active=True).count(),
                "notification_failures": NotificationLog.objects.filter(success=False).count(),
            }
        )


class StaffListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]


class StaffRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]


class AdminProductListCreateView(StaffListCreateView):
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
    queryset = Product.objects.select_related("category").prefetch_related("tags", "prices__region").all()
    serializer_class = AdminProductSerializer
    lookup_field = "slug"


class AdminCategoryListCreateView(StaffListCreateView):
    queryset = Category.objects.all()
    serializer_class = AdminCategorySerializer
    lookup_field = "slug"


class AdminCategoryDetailView(StaffRetrieveUpdateDestroyView):
    queryset = Category.objects.all()
    serializer_class = AdminCategorySerializer
    lookup_field = "slug"


class AdminCouponListCreateView(StaffListCreateView):
    queryset = Coupon.objects.prefetch_related("regions", "products", "categories").all()
    serializer_class = AdminCouponSerializer


class AdminCouponDetailView(StaffRetrieveUpdateDestroyView):
    queryset = Coupon.objects.prefetch_related("regions", "products", "categories").all()
    serializer_class = AdminCouponSerializer


class AdminOrderListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminOrderSerializer

    def get_queryset(self):
        queryset = Order.objects.select_related("region", "user").prefetch_related("items", "transactions")
        status_filter = self.request.query_params.get("status", "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class AdminOrderDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminOrderSerializer
    lookup_field = "order_number"
    queryset = Order.objects.select_related("region", "user").prefetch_related("items", "transactions")

    def perform_update(self, serializer):
        old_order = self.get_object()
        previous_payment_status = old_order.payment_status
        order = serializer.save()
        if previous_payment_status != order.payment_status:
            if order.payment_status == Order.PAYMENT_PAID:
                notify_admins_paid_order(order)
            elif order.payment_status == Order.PAYMENT_REVIEW:
                notify_admins_payment_review(order)
        for item in order.items.select_related("product"):
            if item.product and item.product.track_inventory and item.product.stock_quantity <= 10:
                notify_admins_low_stock(item.product)


class AdminReviewListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminReviewSerializer
    queryset = Review.objects.select_related("product", "user", "order").all()


class AdminReviewDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminReviewSerializer
    queryset = Review.objects.select_related("product", "user", "order").all()


class AdminCustomerListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminCustomerSerializer

    def get_queryset(self):
        return get_user_model().objects.all().order_by("-date_joined")


class AdminCustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminCustomerSerializer
    queryset = get_user_model().objects.all()


class AdminPaymentListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminPaymentTransactionSerializer
    queryset = PaymentTransaction.objects.select_related("order").all()


class AdminPaymentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminPaymentTransactionSerializer
    queryset = PaymentTransaction.objects.select_related("order").all()


class AdminRegionListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminRegionSerializer
    queryset = Region.objects.all()


class AdminSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffUser]
    serializer_class = AdminSiteSettingsSerializer

    def get(self, request):
        settings = SiteSettings.objects.first()
        return Response(AdminSiteSettingsSerializer(settings).data if settings else {})

    def patch(self, request):
        settings = SiteSettings.objects.first()
        if not settings:
            serializer = AdminSiteSettingsSerializer(data=request.data)
        else:
            serializer = AdminSiteSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
