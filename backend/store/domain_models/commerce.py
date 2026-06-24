import secrets

from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from .catalog import Product, Region


class Order(models.Model):
    SALES_CHANNEL_ONLINE_STORE = "online_store"
    SALES_CHANNEL_DRAFT_ORDER = "draft_order"

    SALES_CHANNEL_CHOICES = (
        (SALES_CHANNEL_ONLINE_STORE, "Online store"),
        (SALES_CHANNEL_DRAFT_ORDER, "Draft orders"),
    )

    STATUS_PENDING = "pending"
    STATUS_CONFIRMED = "confirmed"
    STATUS_PAID = "paid"
    STATUS_PROCESSING = "processing"
    STATUS_SHIPPED = "shipped"
    STATUS_DELIVERED = "delivered"
    STATUS_CANCELLED = "cancelled"
    STATUS_RETURNED = "returned"
    STATUS_REFUNDED = "refunded"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_PAID, "Paid"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_SHIPPED, "Shipped"),
        (STATUS_DELIVERED, "Delivered"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_RETURNED, "Returned"),
        (STATUS_REFUNDED, "Refunded"),
        (STATUS_FAILED, "Failed"),
    )

    STATUS_LABELS = {
        STATUS_PENDING: ("Pending", "قيد الانتظار"),
        STATUS_CONFIRMED: ("Confirmed", "تم التأكيد"),
        STATUS_PAID: ("Paid", "مدفوع"),
        STATUS_PROCESSING: ("Processing", "قيد المعالجة"),
        STATUS_SHIPPED: ("Shipped", "تم الشحن"),
        STATUS_DELIVERED: ("Delivered", "تم التسليم"),
        STATUS_CANCELLED: ("Cancelled", "ملغي"),
        STATUS_RETURNED: ("Returned", "مرتجع"),
        STATUS_REFUNDED: ("Refunded", "مسترد"),
        STATUS_FAILED: ("Failed", "فشل"),
    }

    STATUS_TRANSITIONS = {
        STATUS_PENDING: {STATUS_CONFIRMED, STATUS_PAID, STATUS_PROCESSING, STATUS_CANCELLED, STATUS_FAILED},
        STATUS_CONFIRMED: {STATUS_PAID, STATUS_PROCESSING, STATUS_CANCELLED, STATUS_FAILED},
        STATUS_PAID: {STATUS_PROCESSING, STATUS_SHIPPED, STATUS_DELIVERED, STATUS_CANCELLED, STATUS_REFUNDED, STATUS_FAILED},
        STATUS_PROCESSING: {STATUS_SHIPPED, STATUS_DELIVERED, STATUS_CANCELLED, STATUS_FAILED},
        STATUS_SHIPPED: {STATUS_DELIVERED, STATUS_RETURNED, STATUS_FAILED},
        STATUS_DELIVERED: {STATUS_RETURNED, STATUS_REFUNDED},
        STATUS_CANCELLED: {STATUS_REFUNDED},
        STATUS_RETURNED: {STATUS_REFUNDED},
        STATUS_REFUNDED: set(),
        STATUS_FAILED: {STATUS_PENDING, STATUS_CONFIRMED, STATUS_PAID, STATUS_CANCELLED},
    }

    INVENTORY_ACTIVE_STATUSES = {
        STATUS_PENDING,
        STATUS_CONFIRMED,
        STATUS_PAID,
        STATUS_PROCESSING,
        STATUS_SHIPPED,
        STATUS_DELIVERED,
    }

    INVENTORY_RELEASED_STATUSES = {
        STATUS_CANCELLED,
        STATUS_RETURNED,
        STATUS_REFUNDED,
        STATUS_FAILED,
    }

    PAYMENT_COD = "cod"
    PAYMENT_WHATSAPP = "whatsapp"
    PAYMENT_BANK_TRANSFER = "bank_transfer"
    PAYMENT_ONLINE = "online"

    PAYMENT_METHOD_CHOICES = (
        (PAYMENT_COD, "Cash on delivery"),
        (PAYMENT_WHATSAPP, "WhatsApp confirmation"),
        (PAYMENT_BANK_TRANSFER, "Bank transfer"),
        (PAYMENT_ONLINE, "Online payment"),
    )

    PAYMENT_UNPAID = "unpaid"
    PAYMENT_REVIEW = "review"
    PAYMENT_PAID = "paid"
    PAYMENT_REFUNDED = "refunded"

    PAYMENT_STATUS_CHOICES = (
        (PAYMENT_UNPAID, "Unpaid"),
        (PAYMENT_REVIEW, "Needs review"),
        (PAYMENT_PAID, "Paid"),
        (PAYMENT_REFUNDED, "Refunded"),
    )

    REFUND_NONE = "none"
    REFUND_REQUESTED = "requested"
    REFUND_PROCESSING = "processing"
    REFUND_REFUNDED = "refunded"
    REFUND_FAILED = "failed"

    REFUND_STATUS_CHOICES = (
        (REFUND_NONE, "No refund"),
        (REFUND_REQUESTED, "Requested"),
        (REFUND_PROCESSING, "Processing"),
        (REFUND_REFUNDED, "Refunded"),
        (REFUND_FAILED, "Failed"),
    )

    SHIPPING_METHOD_FLAT = "flat"
    SHIPPING_METHOD_RULE = "rule_based"
    SHIPPING_METHOD_CARRIER = "carrier"

    SHIPPING_METHOD_CHOICES = (
        (SHIPPING_METHOD_FLAT, "Flat region shipping"),
        (SHIPPING_METHOD_RULE, "Rules-based shipping"),
        (SHIPPING_METHOD_CARRIER, "Carrier-calculated shipping"),
    )

    SHIPMENT_PENDING = "pending"
    SHIPMENT_CREATED = "created"
    SHIPMENT_IN_TRANSIT = "in_transit"
    SHIPMENT_DELIVERED = "delivered"
    SHIPMENT_FAILED = "failed"
    SHIPMENT_MANUAL = "manual"

    SHIPMENT_STATUS_CHOICES = (
        (SHIPMENT_PENDING, "Pending"),
        (SHIPMENT_CREATED, "Created"),
        (SHIPMENT_IN_TRANSIT, "In transit"),
        (SHIPMENT_DELIVERED, "Delivered"),
        (SHIPMENT_FAILED, "Failed"),
        (SHIPMENT_MANUAL, "Manual"),
    )

    INVOICE_PENDING = "pending"
    INVOICE_GENERATED = "generated"
    INVOICE_FAILED = "failed"

    INVOICE_STATUS_CHOICES = (
        (INVOICE_PENDING, "Pending"),
        (INVOICE_GENERATED, "Generated"),
        (INVOICE_FAILED, "Failed"),
    )

    order_number = models.CharField(max_length=24, unique=True, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="orders")
    locale = models.CharField(max_length=8, default="en")
    sales_channel = models.CharField(
        max_length=32,
        choices=SALES_CHANNEL_CHOICES,
        default=SALES_CHANNEL_ONLINE_STORE,
    )

    customer_name = models.CharField(max_length=160)
    customer_email = models.EmailField(blank=True)
    customer_phone = models.CharField(max_length=60)
    sms_opt_in = models.BooleanField(default=False)
    whatsapp_opt_in = models.BooleanField(default=False)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    building = models.CharField(max_length=120, blank=True)
    floor = models.CharField(max_length=60, blank=True)
    apartment = models.CharField(max_length=120, blank=True)
    landmark = models.CharField(max_length=255, blank=True)
    area = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=120)
    postcode = models.CharField(max_length=40, blank=True)
    country = models.CharField(max_length=120)
    formatted_address = models.CharField(max_length=500, blank=True)
    place_id = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_notes = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    customer_snapshot = models.JSONField(default=dict, blank=True)
    address_snapshot = models.JSONField(default=dict, blank=True)
    conversion_session_key = models.CharField(max_length=64, blank=True, default="", db_index=True)
    conversion_attribution = models.JSONField(default=dict, blank=True)

    coupon_code = models.CharField(max_length=40, blank=True)
    discount_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gift_card_code = models.CharField(max_length=32, blank=True)
    gift_card_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_method = models.CharField(
        max_length=32,
        choices=SHIPPING_METHOD_CHOICES,
        default=SHIPPING_METHOD_FLAT,
    )
    shipping_carrier_name = models.CharField(max_length=120, blank=True, default="")
    shipping_eta_min_days = models.PositiveSmallIntegerField(blank=True, null=True)
    shipping_eta_max_days = models.PositiveSmallIntegerField(blank=True, null=True)
    shipping_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    taxable_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    tax_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_inclusive = models.BooleanField(default=False)
    tax_applies_to_shipping = models.BooleanField(default=False)
    tax_label = models.CharField(max_length=120, blank=True)
    tax_breakdown = models.JSONField(default=dict, blank=True)
    grand_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency_code = models.CharField(max_length=3)
    fx_rate_snapshot = models.DecimalField(
        max_digits=18, decimal_places=8, null=True, blank=True,
        help_text="Region fx_rate at the time this order was placed (OMR→region). Preserved for historic OMR conversion."
    )

    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_PENDING)
    payment_method = models.CharField(max_length=32, choices=PAYMENT_METHOD_CHOICES, default=PAYMENT_COD)
    payment_status = models.CharField(max_length=32, choices=PAYMENT_STATUS_CHOICES, default=PAYMENT_UNPAID)
    carrier = models.CharField(max_length=32, blank=True, default="")
    tracking_number = models.CharField(max_length=120, blank=True)
    tracking_url = models.URLField(max_length=500, blank=True)
    shipment_status = models.CharField(
        max_length=24,
        choices=SHIPMENT_STATUS_CHOICES,
        default=SHIPMENT_PENDING,
    )
    shipment_created_at = models.DateTimeField(blank=True, null=True)
    delivered_at = models.DateTimeField(blank=True, null=True)
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refund_status = models.CharField(
        max_length=20,
        choices=REFUND_STATUS_CHOICES,
        default=REFUND_NONE,
    )
    refund_reference = models.CharField(max_length=255, blank=True)
    refunded_at = models.DateTimeField(blank=True, null=True)
    inventory_released = models.BooleanField(default=False)
    invoice_number = models.CharField(max_length=40, unique=True, blank=True, null=True)
    invoice_date = models.DateTimeField(blank=True, null=True)
    invoice_pdf = models.FileField(upload_to="invoices/", blank=True, null=True)
    invoice_status = models.CharField(
        max_length=20,
        choices=INVOICE_STATUS_CHOICES,
        default=INVOICE_PENDING,
    )
    invoice_access_token = models.CharField(max_length=64, blank=True, db_index=True)
    # Unguessable token bound to this order; required for guest order lookup.
    # Sent in the order confirmation email's tracking link.
    lookup_token = models.CharField(max_length=64, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.order_number or f"Order #{self.pk}"

    def save(self, *args, **kwargs):
        is_create = self.pk is None
        previous_status = None
        skip_status_transition_validation = bool(getattr(self, "_skip_status_transition_validation", False))
        if not is_create:
            previous_status = Order.objects.filter(pk=self.pk).values_list("status", flat=True).first()
            if previous_status and previous_status != self.status and not skip_status_transition_validation:
                if not self.can_transition_to(self.status, from_status=previous_status):
                    raise ValidationError(
                        {
                            "status": (
                                f"Invalid status transition from '{previous_status}' to '{self.status}'."
                            )
                        }
                    )

        if self.status == self.STATUS_DELIVERED and self.delivered_at is None:
            self.delivered_at = timezone.now()
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                update_fields = set(update_fields)
                update_fields.add("delivered_at")
                kwargs["update_fields"] = list(update_fields)

        if self.refund_status == self.REFUND_REFUNDED and self.refunded_at is None:
            self.refunded_at = timezone.now()
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                update_fields = set(update_fields)
                update_fields.add("refunded_at")
                kwargs["update_fields"] = list(update_fields)

        if not self.order_number:
            today = timezone.localdate().strftime("%Y%m%d")
            prefix = f"EO-{today}"
            count_today = Order.objects.filter(order_number__startswith=prefix).count() + 1
            self.order_number = f"{prefix}-{count_today:04d}"
        if not self.customer_snapshot:
            self.customer_snapshot = {
                "name": self.customer_name,
                "email": self.customer_email,
                "phone": self.customer_phone,
                "sms_opt_in": bool(self.sms_opt_in),
                "whatsapp_opt_in": bool(self.whatsapp_opt_in),
            }
        if not self.address_snapshot:
            self.address_snapshot = {
                "address_line_1": self.address_line_1,
                "address_line_2": self.address_line_2,
                "building": self.building,
                "floor": self.floor,
                "apartment": self.apartment,
                "landmark": self.landmark,
                "area": self.area,
                "city": self.city,
                "postcode": self.postcode,
                "country": self.country,
                "formatted_address": self.formatted_address,
                "place_id": self.place_id,
                "latitude": str(self.latitude) if self.latitude is not None else None,
                "longitude": str(self.longitude) if self.longitude is not None else None,
                "location_notes": self.location_notes,
            }
        if not self.invoice_access_token:
            self.invoice_access_token = secrets.token_urlsafe(24)
        if not self.lookup_token:
            self.lookup_token = secrets.token_urlsafe(24)
        super().save(*args, **kwargs)

        status_changed = is_create or previous_status != self.status
        actor = getattr(self, "_status_actor", None)
        note = getattr(self, "_status_note", "")
        if status_changed:
            OrderStatusHistory.objects.create(
                order=self,
                old_status=previous_status,
                new_status=self.status,
                actor=actor if getattr(actor, "pk", None) else None,
                note=note or "",
            )
            try:
                from ..notifications import queue_order_notification_events

                queue_order_notification_events(
                    self,
                    is_create=is_create,
                    previous_status=previous_status,
                )
            except Exception:
                # Notifications should never block order persistence.
                pass
        self._status_actor = None
        self._status_note = ""
        self._skip_status_transition_validation = False

    @classmethod
    def get_status_label(cls, status_key, *, locale="en"):
        label = cls.STATUS_LABELS.get(status_key)
        if not label:
            return status_key
        return label[1] if locale == "ar" else label[0]

    @classmethod
    def is_valid_transition(cls, from_status, to_status):
        if from_status == to_status:
            return True
        allowed = cls.STATUS_TRANSITIONS.get(from_status, set())
        return to_status in allowed

    def can_transition_to(self, new_status, *, from_status=None):
        source_status = from_status if from_status is not None else self.status
        return self.is_valid_transition(source_status, new_status)

    def get_previous_status(self):
        # Only consider entries that moved INTO the current status and were not
        # themselves rollback operations. This ensures that repeated reverts walk
        # the history backwards correctly instead of bouncing between two states.
        previous_entry = (
            self.status_history
            .filter(new_status=self.status)
            .exclude(note__startswith="Admin rollback")
            .order_by("-timestamp", "-id")
            .values_list("old_status", flat=True)
            .first()
        )
        return str(previous_entry or "").strip().lower() or ""

    def transition_to(self, new_status, *, actor=None, note=""):
        target_status = str(new_status or "").strip().lower()
        if not target_status:
            raise ValidationError({"status": "Target status is required."})
        if target_status == self.status:
            return False
        if not self.can_transition_to(target_status):
            raise ValidationError(
                {"status": f"Invalid status transition from '{self.status}' to '{target_status}'."}
            )

        self._status_actor = actor
        self._status_note = str(note or "").strip()
        self.status = target_status
        self.save(update_fields=["status", "updated_at"])
        return True

    def force_status_to(self, new_status, *, actor=None, note=""):
        target_status = str(new_status or "").strip().lower()
        if not target_status:
            raise ValidationError({"status": "Target status is required."})
        if target_status == self.status:
            return False

        self._status_actor = actor
        self._status_note = str(note or "").strip()
        self._skip_status_transition_validation = True
        self.status = target_status
        try:
            self.save(update_fields=["status", "updated_at"])
        finally:
            self._skip_status_transition_validation = False
        return True

    def ensure_invoice_number(self, when=None):
        if self.invoice_number:
            return self.invoice_number
        base_time = when or self.invoice_date or timezone.now()
        date_key = timezone.localtime(base_time).strftime("%Y%m%d")
        prefix = f"INV-{date_key}-"
        existing = (
            Order.objects.filter(invoice_number__startswith=prefix)
            .exclude(pk=self.pk)
            .values_list("invoice_number", flat=True)
        )
        sequence = 1
        for value in existing:
            try:
                sequence = max(sequence, int(value.rsplit("-", 1)[-1]) + 1)
            except (TypeError, ValueError):
                continue
        self.invoice_number = f"{prefix}{sequence:04d}"
        return self.invoice_number

    def ensure_invoice_access_token(self):
        if self.invoice_access_token:
            return self.invoice_access_token
        self.invoice_access_token = secrets.token_urlsafe(24)
        return self.invoice_access_token

    def ensure_lookup_token(self):
        if self.lookup_token:
            return self.lookup_token
        self.lookup_token = secrets.token_urlsafe(24)
        return self.lookup_token

    def can_customer_cancel(self):
        return self.payment_status == self.PAYMENT_UNPAID and self.status in {
            self.STATUS_PENDING,
            self.STATUS_CONFIRMED,
        }

    def restore_inventory(self):
        from ..services.stock import restore_order_inventory

        restore_order_inventory(self, reason="order_restore")

    def cancel(self, *, actor=None, note=""):
        if self.status != self.STATUS_CANCELLED:
            try:
                from ..services.gift_cards import release_pending_gift_card_redemption

                release_pending_gift_card_redemption(self, reason="cancelled")
            except Exception:
                pass
            self.restore_inventory()
            self.transition_to(
                self.STATUS_CANCELLED,
                actor=actor,
                note=note or "Order cancelled.",
            )


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="status_history")
    old_status = models.CharField(max_length=32, blank=True, null=True)
    new_status = models.CharField(max_length=32, choices=Order.STATUS_CHOICES)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_status_history_entries",
    )
    note = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("timestamp", "id")

    def __str__(self):
        return f"{self.order.order_number}: {self.old_status or 'none'} -> {self.new_status}"


class ReturnRequest(models.Model):
    STATUS_REQUESTED = "requested"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_REFUNDED = "refunded"

    STATUS_CHOICES = (
        (STATUS_REQUESTED, "Requested"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_REFUNDED, "Refunded"),
    )

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="return_requests")
    customer_name = models.CharField(max_length=160, blank=True)
    customer_email = models.EmailField(blank=True)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_REQUESTED)
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_return_requests",
    )
    admin_note = models.TextField(blank=True)

    class Meta:
        ordering = ("-requested_at",)

    def __str__(self):
        return f"{self.order.order_number} return ({self.status})"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    product_slug = models.SlugField(max_length=255)
    product_name = models.CharField(max_length=255)
    selected_options_text = models.CharField(max_length=255, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)
    taxable_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    tax_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_inclusive = models.BooleanField(default=False)
    tax_breakdown = models.JSONField(default=dict, blank=True)
    price_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.product_name} x {self.quantity}"


class Coupon(models.Model):
    DISCOUNT_PERCENTAGE = "percentage"
    DISCOUNT_FIXED = "fixed"
    DISCOUNT_FREE_SHIPPING = "free_shipping"

    DISCOUNT_TYPE_CHOICES = (
        (DISCOUNT_PERCENTAGE, "Percentage"),
        (DISCOUNT_FIXED, "Fixed amount"),
        (DISCOUNT_FREE_SHIPPING, "Free shipping"),
    )

    code = models.CharField(max_length=40, unique=True)
    description = models.TextField(blank=True)
    discount_type = models.CharField(
        max_length=20,
        choices=DISCOUNT_TYPE_CHOICES,
        default=DISCOUNT_FIXED,
    )
    value = models.DecimalField(max_digits=10, decimal_places=2)
    regions = models.ManyToManyField(Region, blank=True, related_name="coupons")
    is_active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(blank=True, null=True)
    ends_at = models.DateTimeField(blank=True, null=True)
    minimum_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_uses = models.PositiveIntegerField(blank=True, null=True)
    used_count = models.PositiveIntegerField(default=0)
    products = models.ManyToManyField(Product, blank=True, related_name="coupons")
    categories = models.ManyToManyField("Category", blank=True, related_name="coupons")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.code.upper()

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)


class PaymentTransaction(models.Model):
    PROVIDER_COD = "cod"
    PROVIDER_WHATSAPP = "whatsapp"
    PROVIDER_BANK_TRANSFER = "bank_transfer"
    PROVIDER_ONLINE = "online"
    PROVIDER_PAYMOB = "paymob"
    PROVIDER_STRIPE = "stripe"
    PROVIDER_TAP = "tap"
    PROVIDER_PAYTABS = "paytabs"
    PROVIDER_HYPERPAY = "hyperpay"
    PROVIDER_TELR = "telr"
    PROVIDER_THAWANI = "thawani"
    PROVIDER_OMANNET = "omannet"
    PROVIDER_CHECKOUT_COM = "checkout_com"

    PROVIDER_CHOICES = (
        (PROVIDER_COD, "Cash on delivery"),
        (PROVIDER_WHATSAPP, "WhatsApp confirmation"),
        (PROVIDER_BANK_TRANSFER, "Bank transfer"),
        (PROVIDER_ONLINE, "Online payment placeholder"),
        (PROVIDER_PAYMOB, "Paymob"),
        (PROVIDER_STRIPE, "Stripe"),
        (PROVIDER_TAP, "Tap Payments"),
        (PROVIDER_PAYTABS, "PayTabs"),
        (PROVIDER_HYPERPAY, "HyperPay"),
        (PROVIDER_TELR, "Telr"),
        (PROVIDER_THAWANI, "Thawani"),
        (PROVIDER_OMANNET, "OmanNet"),
        (PROVIDER_CHECKOUT_COM, "Checkout.com"),
    )

    STATUS_PENDING = "pending"
    STATUS_AUTHORIZED = "authorized"
    STATUS_PAID = "paid"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_REFUNDED = "refunded"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_AUTHORIZED, "Authorized"),
        (STATUS_PAID, "Paid"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_REFUNDED, "Refunded"),
    )

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="transactions")
    provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES, default=PROVIDER_COD)
    provider_reference = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency_code = models.CharField(max_length=3)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_PENDING)
    raw_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.provider} - {self.order.order_number} - {self.status}"


class CustomerAddress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="addresses")
    full_name = models.CharField(max_length=160)
    phone = models.CharField(max_length=60)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    building = models.CharField(max_length=120, blank=True)
    floor = models.CharField(max_length=60, blank=True)
    apartment = models.CharField(max_length=120, blank=True)
    landmark = models.CharField(max_length=255, blank=True)
    area = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=120)
    postcode = models.CharField(max_length=40, blank=True)
    country = models.CharField(max_length=120)
    formatted_address = models.CharField(max_length=500, blank=True)
    place_id = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_notes = models.TextField(blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-is_default", "-updated_at")

    def __str__(self):
        return f"{self.full_name} - {self.city}"


class Review(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="customer_reviews")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_reviews",
    )
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviews")
    customer_name = models.CharField(max_length=160)
    rating = models.PositiveSmallIntegerField(default=5)
    title = models.CharField(max_length=160, blank=True)
    comment = models.TextField()
    is_verified_purchase = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.product.name_en} - {self.rating}/5"


class PushDevice(models.Model):
    PLATFORM_IOS = "ios"
    PLATFORM_ANDROID = "android"
    PLATFORM_WEB = "web"

    PLATFORM_CHOICES = (
        (PLATFORM_IOS, "iOS"),
        (PLATFORM_ANDROID, "Android"),
        (PLATFORM_WEB, "Web"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_devices",
        null=True,
        blank=True,
    )
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self):
        return f"{self.platform} - {self.token[:18]}"


class AdminAuditLog(models.Model):
    ACTION_PRODUCT_PRICE_CHANGED = "product_price_changed"
    ACTION_COUPON_CHANGED = "coupon_changed"
    ACTION_ORDER_STATUS_CHANGED = "order_status_changed"
    ACTION_REFUND_ACTION = "refund_action"
    ACTION_STAFF_ROLE_CHANGED = "staff_role_changed"
    ACTION_SITE_SETTINGS_CHANGED = "site_settings_changed"

    ACTION_CHOICES = (
        (ACTION_PRODUCT_PRICE_CHANGED, "Product price changed"),
        (ACTION_COUPON_CHANGED, "Coupon changed"),
        (ACTION_ORDER_STATUS_CHANGED, "Order status changed"),
        (ACTION_REFUND_ACTION, "Refund action"),
        (ACTION_STAFF_ROLE_CHANGED, "Staff role changed"),
        (ACTION_SITE_SETTINGS_CHANGED, "Site settings changed"),
    )

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_audit_logs",
    )
    action = models.CharField(max_length=80, choices=ACTION_CHOICES, db_index=True)
    resource_type = models.CharField(max_length=80, db_index=True)
    resource_id = models.CharField(max_length=120, blank=True, default="", db_index=True)
    before_snapshot = models.JSONField(blank=True, null=True)
    after_snapshot = models.JSONField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.TextField(blank=True, default="")
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-timestamp", "-id")

    def __str__(self):
        actor = self.actor.get_username() if self.actor_id else "system"
        return f"{self.action} · {self.resource_type}:{self.resource_id or '-'} · {actor}"


class NotificationLog(models.Model):
    CHANNEL_SYSTEM = "system"
    CHANNEL_EMAIL = "email"
    CHANNEL_SMS = "sms"
    CHANNEL_WHATSAPP = "whatsapp"
    CHANNEL_PUSH = "push"

    CHANNEL_CHOICES = (
        (CHANNEL_SYSTEM, "System"),
        (CHANNEL_EMAIL, "Email"),
        (CHANNEL_SMS, "SMS"),
        (CHANNEL_WHATSAPP, "WhatsApp"),
        (CHANNEL_PUSH, "Push"),
    )

    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_SKIPPED = "skipped"
    STATUS_SKIPPED_NO_EMAIL = "skipped_no_email"
    STATUS_SKIPPED_DRAFT_ORDER = "skipped_draft_order"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_SENT, "Sent"),
        (STATUS_FAILED, "Failed"),
        (STATUS_SKIPPED, "Skipped"),
        (STATUS_SKIPPED_NO_EMAIL, "Skipped (no customer email)"),
        (STATUS_SKIPPED_DRAFT_ORDER, "Skipped (draft order)"),
    )

    EVENT_ORDER_CREATED = "order_created"
    EVENT_PAYMENT_PAID = "payment_paid"
    EVENT_ORDER_SHIPPED = "order_shipped"
    EVENT_ORDER_DELIVERED = "order_delivered"
    EVENT_ORDER_CANCELLED = "order_cancelled"
    EVENT_RETURN_REQUESTED = "return_requested"
    EVENT_REFUND_PROCESSED = "refund_processed"
    EVENT_REVIEW_REQUEST = "review_request"

    # Backwards-compatible aliases.
    EVENT_NEW_ORDER = EVENT_ORDER_CREATED
    EVENT_PAID_ORDER = EVENT_PAYMENT_PAID

    EVENT_PAYMENT_REVIEW = "payment_review"
    EVENT_LOW_STOCK = "low_stock"
    EVENT_SHIPMENT_UPDATE = "shipment_update"

    EVENT_CHOICES = (
        (EVENT_ORDER_CREATED, "Order created"),
        (EVENT_PAYMENT_PAID, "Payment paid"),
        (EVENT_ORDER_SHIPPED, "Order shipped"),
        (EVENT_ORDER_DELIVERED, "Order delivered"),
        (EVENT_ORDER_CANCELLED, "Order cancelled"),
        (EVENT_RETURN_REQUESTED, "Return requested"),
        (EVENT_REFUND_PROCESSED, "Refund processed"),
        (EVENT_REVIEW_REQUEST, "Review request"),
        (EVENT_PAYMENT_REVIEW, "Payment review needed"),
        (EVENT_LOW_STOCK, "Low stock alert"),
        (EVENT_SHIPMENT_UPDATE, "Shipment update"),
    )

    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default=CHANNEL_SYSTEM)
    event = models.CharField(max_length=40, choices=EVENT_CHOICES)
    recipient = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    provider = models.CharField(max_length=80, blank=True, default="")
    provider_message_id = models.CharField(max_length=255, blank=True, default="")
    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notification_logs",
    )
    title = models.CharField(max_length=160)
    body = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    success = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)
    attempt_count = models.PositiveIntegerField(default=0)
    task_id = models.CharField(max_length=255, blank=True, default="")
    sent_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.event} - {'sent' if self.success else 'failed'}"


class WhatsAppLog(models.Model):
    EVENT_ORDER_CREATED = "order_created"
    EVENT_ORDER_SHIPPED = "order_shipped"
    EVENT_ORDER_DELIVERED = "order_delivered"
    EVENT_REFUND_PROCESSED = "refund_processed"
    EVENT_DELIVERY_RECEIPT = "delivery_receipt"

    EVENT_CHOICES = (
        (EVENT_ORDER_CREATED, "Order confirmed"),
        (EVENT_ORDER_SHIPPED, "Order shipped"),
        (EVENT_ORDER_DELIVERED, "Order delivered"),
        (EVENT_REFUND_PROCESSED, "Refund processed"),
        (EVENT_DELIVERY_RECEIPT, "Delivery receipt"),
    )

    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_DELIVERED = "delivered"
    STATUS_READ = "read"
    STATUS_FAILED = "failed"
    STATUS_SKIPPED = "skipped"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_SENT, "Sent"),
        (STATUS_DELIVERED, "Delivered"),
        (STATUS_READ, "Read"),
        (STATUS_FAILED, "Failed"),
        (STATUS_SKIPPED, "Skipped"),
    )

    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="whatsapp_logs",
    )
    event = models.CharField(max_length=40, choices=EVENT_CHOICES)
    recipient = models.CharField(max_length=255, blank=True, default="")
    locale = models.CharField(max_length=8, default="en")
    template_name = models.CharField(max_length=120, blank=True, default="")
    provider = models.CharField(max_length=40, default="whatsapp_cloud")
    provider_message_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    webhook_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        order_number = self.order.order_number if self.order_id else "no-order"
        return f"{self.event} - {self.status} - {order_number}"


class WishlistItem(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist_items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="wishlisted_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        unique_together = ("user", "product")

    def __str__(self):
        return f"{self.user} - {self.product.name_en}"


class NewsletterSubscription(models.Model):
    email = models.EmailField(unique=True)
    locale = models.CharField(max_length=8, default="en")
    region = models.ForeignKey(Region, on_delete=models.SET_NULL, null=True, blank=True, related_name="newsletter_subscriptions")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.email


class GiftCard(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_REDEEMED = "redeemed"
    STATUS_EXPIRED = "expired"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = (
        (STATUS_ACTIVE, "Active"),
        (STATUS_REDEEMED, "Redeemed"),
        (STATUS_EXPIRED, "Expired"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    code = models.CharField(max_length=32, unique=True, db_index=True)
    initial_balance = models.DecimalField(max_digits=10, decimal_places=2)
    remaining_balance = models.DecimalField(max_digits=10, decimal_places=2)
    currency_code = models.CharField(max_length=3, default="OMR")
    region = models.ForeignKey(Region, on_delete=models.SET_NULL, null=True, blank=True, related_name="gift_cards")
    recipient_name = models.CharField(max_length=160, blank=True)
    recipient_email = models.EmailField(blank=True)
    recipient_phone = models.CharField(max_length=60, blank=True)
    sender_name = models.CharField(max_length=160, blank=True)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    expiry_date = models.DateTimeField(blank=True, null=True)
    redeemed_at = models.DateTimeField(blank=True, null=True)
    redeemed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="redeemed_gift_cards",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.code} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self._generate_code()
        if self.remaining_balance is None:
            self.remaining_balance = self.initial_balance
        super().save(*args, **kwargs)

    def _generate_code(self):
        prefix = "EOG"
        token = secrets.token_hex(6).upper()
        return f"{prefix}-{token[:4]}-{token[4:8]}-{token[8:12]}"


class GiftCardRedemption(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPLIED = "applied"
    STATUS_RELEASED = "released"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_APPLIED, "Applied"),
        (STATUS_RELEASED, "Released"),
    )

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="gift_card_redemption")
    gift_card = models.ForeignKey(GiftCard, on_delete=models.PROTECT, related_name="redemptions")
    code_snapshot = models.CharField(max_length=32, blank=True, default="")
    requested_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    applied_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    applied_at = models.DateTimeField(blank=True, null=True)
    released_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        unique_together = ("gift_card", "order")

    def __str__(self):
        return f"{self.order.order_number} - {self.gift_card.code} ({self.status})"


class BackInStockRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_NOTIFIED = "notified"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_NOTIFIED, "Notified"),
    )

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="back_in_stock_requests")
    region = models.ForeignKey(
        Region,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="back_in_stock_requests",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="back_in_stock_requests",
    )
    email = models.EmailField()
    phone = models.CharField(max_length=60, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    notified_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        unique_together = ("product", "region", "email")

    def __str__(self):
        region_code = self.region.code.upper() if self.region_id else "all"
        return f"{self.product.slug} - {self.email} ({region_code})"


class AnalyticsEvent(models.Model):
    """
    Lightweight event table for real storefront funnel tracking.

    Events are written by the public POST /api/analytics/event/ endpoint and read by
    AdminAnalyticsView + AdminDashboardView to produce honest conversion-funnel data.

    session_key: anonymous UUID stored in the visitor's localStorage. Used to count
    unique visitors/sessions without requiring authentication.
    """

    EVENT_PAGE_VIEW = "page_view"
    EVENT_PRODUCT_VIEW = "product_view"
    EVENT_ADD_TO_CART = "add_to_cart"
    EVENT_CHECKOUT_INITIATED = "checkout_initiated"

    EVENT_CHOICES = [
        (EVENT_PAGE_VIEW, "Page View"),
        (EVENT_PRODUCT_VIEW, "Product View"),
        (EVENT_ADD_TO_CART, "Add to Cart"),
        (EVENT_CHECKOUT_INITIATED, "Checkout Initiated"),
    ]

    event_type = models.CharField(max_length=32, choices=EVENT_CHOICES, db_index=True)
    session_key = models.CharField(max_length=64, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="analytics_events",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="analytics_events",
    )
    region = models.ForeignKey(
        Region,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="analytics_events",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["event_type", "created_at"]),
            models.Index(fields=["session_key", "event_type"]),
        ]

    def __str__(self):
        return f"{self.event_type} — {self.session_key[:8]} ({self.created_at})"


class AbandonedCart(models.Model):
    STATUS_ABANDONED = "abandoned"
    STATUS_CONTACTED = "contacted"
    STATUS_RECOVERED = "recovered"
    STATUS_LOST = "lost"

    STATUS_CHOICES = (
        (STATUS_ABANDONED, "Abandoned"),
        (STATUS_CONTACTED, "Contacted"),
        (STATUS_RECOVERED, "Recovered"),
        (STATUS_LOST, "Lost"),
    )

    session_token = models.CharField(max_length=64, db_index=True)
    customer_name = models.CharField(max_length=160, blank=True)
    customer_email = models.EmailField(blank=True)
    customer_phone = models.CharField(max_length=60, blank=True)
    cart_items = models.JSONField(default=list, blank=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency_code = models.CharField(max_length=3, default="OMR")
    region = models.ForeignKey(Region, on_delete=models.SET_NULL, null=True, blank=True, related_name="abandoned_carts")
    locale = models.CharField(max_length=8, default="en")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ABANDONED)
    abandoned_at = models.DateTimeField(auto_now_add=True)
    recovered_at = models.DateTimeField(blank=True, null=True)
    recovery_sent_count = models.PositiveIntegerField(default=0)
    last_recovery_sent_at = models.DateTimeField(blank=True, null=True)
    recovery_notes = models.TextField(blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="abandoned_carts",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-abandoned_at",)

    def __str__(self):
        return f"Abandoned cart {self.customer_email or self.session_token[:12]} ({self.status})"
