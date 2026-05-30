from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import CustomerAddress, NotificationLog, Order, Product, PushDevice, Region, ReturnRequest, Review
from ..notifications import queue_order_notification_event
from ..serializers import (
    BackInStockRequestSerializer,
    CustomerReturnRequestSerializer,
    CustomerAddressSerializer,
    NewsletterSubscriptionSerializer,
    OrderSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileSerializer,
    PushDeviceSerializer,
    RegisterSerializer,
    ReviewCreateSerializer,
    WishlistItemSerializer,
)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer
    throttle_scope = "auth"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(RegisterSerializer(user).data, status=status.HTTP_201_CREATED)


class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProfileSerializer

    def get(self, request):
        return Response(ProfileSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetRequestSerializer
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "If an account exists for this email, password reset instructions will be sent."})


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetConfirmSerializer
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password has been reset."})


class AddressListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CustomerAddressSerializer

    def get(self, request):
        addresses = CustomerAddress.objects.filter(user=request.user)
        return Response(CustomerAddressSerializer(addresses, many=True).data)

    def post(self, request):
        serializer = CustomerAddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("is_default"):
            CustomerAddress.objects.filter(user=request.user).update(is_default=False)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CustomerOrderListView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def get(self, request):
        orders = Order.objects.filter(user=request.user).prefetch_related(
            "items",
            "transactions",
            "status_history__actor",
            "return_requests__reviewed_by",
        )
        return Response(OrderSerializer(orders, many=True, context={"request": request}).data)


class CustomerReturnRequestListView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CustomerReturnRequestSerializer

    def get(self, request):
        queryset = (
            ReturnRequest.objects.filter(order__user=request.user)
            .select_related("order", "reviewed_by")
            .order_by("-requested_at")
        )
        return Response(CustomerReturnRequestSerializer(queryset, many=True).data)


class CustomerReturnRequestCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CustomerReturnRequestSerializer

    @transaction.atomic
    def post(self, request, order_number):
        order = (
            Order.objects.select_for_update()
            .filter(order_number=order_number, user=request.user)
            .first()
        )
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.status not in {
            Order.STATUS_SHIPPED,
            Order.STATUS_DELIVERED,
            Order.STATUS_RETURNED,
            Order.STATUS_REFUNDED,
        }:
            return Response(
                {"detail": "Return requests are available only after shipment or delivery."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        has_open_request = ReturnRequest.objects.filter(
            order=order,
            status__in=[ReturnRequest.STATUS_REQUESTED, ReturnRequest.STATUS_APPROVED],
        ).exists()
        if has_open_request:
            return Response(
                {"detail": "A return request is already open for this order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CustomerReturnRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        return_request = ReturnRequest.objects.create(
            order=order,
            customer_name=order.customer_name,
            customer_email=order.customer_email,
            reason=serializer.validated_data["reason"],
            status=ReturnRequest.STATUS_REQUESTED,
        )

        if order.refund_status == Order.REFUND_NONE:
            order.refund_status = Order.REFUND_REQUESTED
            order.save(update_fields=["refund_status", "updated_at"])

        queue_order_notification_event(
            order,
            NotificationLog.EVENT_RETURN_REQUESTED,
            extra_payload={
                "return_request_id": return_request.id,
                "return_reason": return_request.reason,
            },
        )

        return Response(
            CustomerReturnRequestSerializer(return_request).data,
            status=status.HTTP_201_CREATED,
        )


class CancelOrderView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    @transaction.atomic
    def post(self, request, order_number):
        order = Order.objects.select_for_update().filter(order_number=order_number, user=request.user).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        if not order.can_customer_cancel():
            return Response({"detail": "This order can no longer be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        order.cancel(actor=request.user, note="Cancelled by customer.")
        return Response(OrderSerializer(order, context={"request": request}).data)


class ReviewCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ReviewCreateSerializer

    def post(self, request):
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        product = Product.objects.filter(slug=serializer.validated_data["product_slug"], is_published=True).first()
        order = Order.objects.filter(
            order_number=serializer.validated_data["order_number"],
            user=request.user,
            status=Order.STATUS_DELIVERED,
            items__product=product,
        ).first()

        if not product or not order:
            raise serializers.ValidationError("Reviews are available only after a delivered purchase.")

        review = Review.objects.create(
            product=product,
            user=request.user,
            order=order,
            customer_name=serializer.validated_data["customer_name"],
            rating=serializer.validated_data["rating"],
            title=serializer.validated_data.get("title", ""),
            comment=serializer.validated_data["comment"],
            is_verified_purchase=True,
            is_approved=False,
        )
        return Response(ReviewCreateSerializer(review).data, status=status.HTTP_201_CREATED)


class PushDeviceRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PushDeviceSerializer

    def post(self, request):
        serializer = PushDeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device, _ = PushDevice.objects.update_or_create(
            token=serializer.validated_data["token"],
            defaults={
                "user": request.user,
                "platform": serializer.validated_data["platform"],
                "is_active": True,
            },
        )
        return Response(PushDeviceSerializer(device).data, status=status.HTTP_201_CREATED)


class PushDeviceDeactivateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PushDeviceSerializer

    def post(self, request):
        token = request.data.get("token", "")
        PushDevice.objects.filter(user=request.user, token=token).update(is_active=False)
        return Response({"detail": "Push token deactivated."})


class WishlistView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WishlistItemSerializer

    def get_serializer_context(self, request):
        region_code = request.query_params.get("region", "")
        region = (
            Region.objects.filter(code=region_code, is_active=True).first()
            or Region.objects.filter(is_default=True, is_active=True).first()
            or Region.objects.filter(is_active=True).order_by("sort_order", "id").first()
        )
        return {
            "request": request,
            "region": region,
            "locale": request.query_params.get("locale", "en"),
        }

    def get(self, request):
        items = request.user.wishlist_items.select_related("product", "product__category").prefetch_related("product__tags", "product__prices__region")
        return Response(WishlistItemSerializer(items, many=True, context=self.get_serializer_context(request)).data)

    def post(self, request):
        serializer = WishlistItemSerializer(data=request.data, context=self.get_serializer_context(request))
        serializer.is_valid(raise_exception=True)
        item = serializer.save()
        return Response(WishlistItemSerializer(item, context=self.get_serializer_context(request)).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        product_slug = request.data.get("product_slug", "")
        request.user.wishlist_items.filter(product__slug=product_slug).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NewsletterSubscriptionView(APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = NewsletterSubscriptionSerializer

    def post(self, request):
        serializer = NewsletterSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Newsletter subscription saved."}, status=status.HTTP_201_CREATED)


class BackInStockRequestCreateView(APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = BackInStockRequestSerializer
    throttle_scope = "checkout"

    def post(self, request):
        serializer = BackInStockRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "We'll let you know when this product is back in stock."}, status=status.HTTP_201_CREATED)
