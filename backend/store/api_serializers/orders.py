from rest_framework import serializers

from ..models import Order, OrderItem, PaymentTransaction
from .catalog import RegionSerializer


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = (
            "product_slug",
            "product_name",
            "selected_options_text",
            "quantity",
            "unit_price",
            "line_total",
        )


class PaymentTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTransaction
        fields = (
            "provider",
            "provider_reference",
            "amount",
            "currency_code",
            "status",
            "created_at",
        )


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    region_code = serializers.CharField(source="region.code", read_only=True)
    region = RegionSerializer(read_only=True)
    status_timeline = serializers.SerializerMethodField()
    transactions = PaymentTransactionSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            "order_number",
            "region_code",
            "region",
            "locale",
            "customer_name",
            "customer_email",
            "customer_phone",
            "address_line_1",
            "address_line_2",
            "city",
            "country",
            "notes",
            "coupon_code",
            "discount_total",
            "subtotal",
            "shipping_total",
            "grand_total",
            "currency_code",
            "status",
            "payment_method",
            "payment_status",
            "tracking_number",
            "tracking_url",
            "created_at",
            "status_timeline",
            "transactions",
            "items",
        )

    def get_status_timeline(self, obj):
        steps = [
            (Order.STATUS_PENDING, "Order received"),
            (Order.STATUS_CONFIRMED, "Confirmed"),
            (Order.STATUS_PREPARING, "Preparing"),
            (Order.STATUS_READY, "Ready"),
            (Order.STATUS_OUT_FOR_DELIVERY, "Out for delivery"),
            (Order.STATUS_DELIVERED, "Delivered"),
        ]

        if obj.status == Order.STATUS_CANCELLED:
            return [
                {
                    "key": Order.STATUS_CANCELLED,
                    "label": "Cancelled",
                    "is_completed": True,
                    "is_current": True,
                }
            ]

        current_index = 0

        for index, step in enumerate(steps):
            if step[0] == obj.status:
                current_index = index
                break

        return [
            {
                "key": key,
                "label": label,
                "is_completed": index <= current_index,
                "is_current": index == current_index,
            }
            for index, (key, label) in enumerate(steps)
        ]


class GuestOrderLookupSerializer(serializers.Serializer):
    order_number = serializers.CharField()
    email_or_phone = serializers.CharField()
