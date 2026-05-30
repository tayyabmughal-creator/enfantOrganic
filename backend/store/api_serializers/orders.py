from rest_framework import serializers
from django.urls import reverse

from ..models import Order, OrderItem, OrderStatusHistory, PaymentTransaction, ReturnRequest
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
            "taxable_amount",
            "tax_rate",
            "tax_total",
            "tax_inclusive",
            "tax_breakdown",
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


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    label_ar = serializers.SerializerMethodField()
    actor_name = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()
    is_completed = serializers.SerializerMethodField()
    key = serializers.CharField(source="new_status", read_only=True)

    class Meta:
        model = OrderStatusHistory
        fields = (
            "key",
            "old_status",
            "new_status",
            "label",
            "label_ar",
            "is_completed",
            "is_current",
            "actor_name",
            "note",
            "timestamp",
        )

    def get_label(self, obj):
        return Order.get_status_label(obj.new_status, locale="en")

    def get_label_ar(self, obj):
        return Order.get_status_label(obj.new_status, locale="ar")

    def get_actor_name(self, obj):
        if not obj.actor_id:
            return ""
        return obj.actor.get_full_name() or obj.actor.username or obj.actor.email or ""

    def get_is_current(self, obj):
        current = self.context.get("current_entry")
        if current is None:
            return False
        return current.id == obj.id

    def get_is_completed(self, obj):
        return True


class ReturnRequestSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ReturnRequest
        fields = (
            "id",
            "order",
            "order_number",
            "customer_name",
            "customer_email",
            "reason",
            "status",
            "requested_at",
            "reviewed_by",
            "reviewed_by_name",
            "admin_note",
        )
        read_only_fields = (
            "id",
            "order",
            "order_number",
            "customer_name",
            "customer_email",
            "requested_at",
            "reviewed_by",
            "reviewed_by_name",
        )

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by_id:
            return ""
        return obj.reviewed_by.get_full_name() or obj.reviewed_by.username or obj.reviewed_by.email or ""


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    region_code = serializers.CharField(source="region.code", read_only=True)
    region = RegionSerializer(read_only=True)
    status_timeline = serializers.SerializerMethodField()
    return_requests = ReturnRequestSerializer(many=True, read_only=True)
    transactions = PaymentTransactionSerializer(many=True, read_only=True)
    invoice_download_url = serializers.SerializerMethodField()
    # Only exposed to the order owner: the authenticated user who placed it, or
    # immediately after checkout (context flag) so the confirmation page/email link works.
    lookup_token = serializers.SerializerMethodField()

    def get_lookup_token(self, obj):
        request = self.context.get("request")
        force_expose = self.context.get("expose_lookup_token", False)
        is_owner = bool(
            request
            and getattr(request, "user", None)
            and request.user.is_authenticated
            and obj.user_id
            and obj.user_id == request.user.pk
        )
        if not (force_expose or is_owner):
            return ""
        if not obj.lookup_token:
            obj.ensure_lookup_token()
            obj.save(update_fields=["lookup_token", "updated_at"])
        return obj.lookup_token

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
            "sms_opt_in",
            "whatsapp_opt_in",
            "address_line_1",
            "address_line_2",
            "building",
            "floor",
            "apartment",
            "landmark",
            "area",
            "city",
            "postcode",
            "country",
            "formatted_address",
            "place_id",
            "latitude",
            "longitude",
            "location_notes",
            "notes",
            "coupon_code",
            "discount_total",
            "gift_card_code",
            "gift_card_amount",
            "subtotal",
            "shipping_fee",
            "shipping_method",
            "shipping_carrier_name",
            "shipping_eta_min_days",
            "shipping_eta_max_days",
            "shipping_total",
            "taxable_amount",
            "tax_rate",
            "tax_total",
            "tax_inclusive",
            "tax_applies_to_shipping",
            "tax_label",
            "tax_breakdown",
            "grand_total",
            "currency_code",
            "status",
            "payment_method",
            "payment_status",
            "carrier",
            "shipment_status",
            "shipment_created_at",
            "delivered_at",
            "refund_amount",
            "refund_status",
            "refund_reference",
            "refunded_at",
            "invoice_number",
            "invoice_date",
            "invoice_status",
            "invoice_download_url",
            "tracking_number",
            "tracking_url",
            "created_at",
            "status_timeline",
            "return_requests",
            "transactions",
            "items",
            "lookup_token",
        )

    def get_status_timeline(self, obj):
        entries = list(obj.status_history.select_related("actor").all())
        if not entries:
            return [
                {
                    "key": obj.status,
                    "old_status": None,
                    "new_status": obj.status,
                    "label": Order.get_status_label(obj.status, locale="en"),
                    "label_ar": Order.get_status_label(obj.status, locale="ar"),
                    "is_completed": True,
                    "is_current": True,
                    "actor_name": "",
                    "note": "",
                    "timestamp": obj.updated_at,
                }
            ]
        serializer = OrderStatusHistorySerializer(
            entries,
            many=True,
            context={"current_entry": entries[-1]},
        )
        return serializer.data

    def get_invoice_download_url(self, obj):
        if not obj.invoice_access_token:
            obj.ensure_invoice_access_token()
            obj.save(update_fields=["invoice_access_token", "updated_at"])
        path = reverse("order-invoice-download", kwargs={"order_number": obj.order_number})
        url = f"{path}?token={obj.invoice_access_token}"
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class GuestOrderLookupSerializer(serializers.Serializer):
    order_number = serializers.CharField()
    # Either lookup_token (preferred, from order confirmation email) OR
    # email_or_phone must be supplied. Both can be provided; token wins.
    lookup_token = serializers.CharField(required=False, allow_blank=True)
    email_or_phone = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        token = (attrs.get("lookup_token") or "").strip()
        contact = (attrs.get("email_or_phone") or "").strip()
        if not token and not contact:
            raise serializers.ValidationError(
                "Provide either lookup_token (from order email) or email_or_phone."
            )
        attrs["lookup_token"] = token
        attrs["email_or_phone"] = contact
        return attrs
