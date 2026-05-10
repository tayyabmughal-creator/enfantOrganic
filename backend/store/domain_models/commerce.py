from django.db import models
from django.conf import settings
from django.utils import timezone

from .catalog import Product, Region


class Order(models.Model):
    STATUS_PENDING = "pending"
    STATUS_CONFIRMED = "confirmed"
    STATUS_PREPARING = "preparing"
    STATUS_READY = "ready"
    STATUS_OUT_FOR_DELIVERY = "out_for_delivery"
    STATUS_DELIVERED = "delivered"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_PREPARING, "Preparing"),
        (STATUS_READY, "Ready"),
        (STATUS_OUT_FOR_DELIVERY, "Out for delivery"),
        (STATUS_DELIVERED, "Delivered"),
        (STATUS_CANCELLED, "Cancelled"),
    )

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

    customer_name = models.CharField(max_length=160)
    customer_email = models.EmailField(blank=True)
    customer_phone = models.CharField(max_length=60)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120)
    country = models.CharField(max_length=120)
    notes = models.TextField(blank=True)
    customer_snapshot = models.JSONField(default=dict, blank=True)
    address_snapshot = models.JSONField(default=dict, blank=True)

    coupon_code = models.CharField(max_length=40, blank=True)
    discount_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency_code = models.CharField(max_length=3)

    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_PENDING)
    payment_method = models.CharField(max_length=32, choices=PAYMENT_METHOD_CHOICES, default=PAYMENT_COD)
    payment_status = models.CharField(max_length=32, choices=PAYMENT_STATUS_CHOICES, default=PAYMENT_UNPAID)
    tracking_number = models.CharField(max_length=120, blank=True)
    tracking_url = models.URLField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.order_number or f"Order #{self.pk}"

    def save(self, *args, **kwargs):
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
            }
        if not self.address_snapshot:
            self.address_snapshot = {
                "address_line_1": self.address_line_1,
                "address_line_2": self.address_line_2,
                "city": self.city,
                "country": self.country,
            }
        super().save(*args, **kwargs)

    def can_customer_cancel(self):
        return self.payment_status == self.PAYMENT_UNPAID and self.status in {
            self.STATUS_PENDING,
            self.STATUS_CONFIRMED,
        }

    def restore_inventory(self):
        for item in self.items.select_related("product"):
            if item.product and item.product.track_inventory:
                item.product.stock_quantity += item.quantity
                item.product.save(update_fields=["stock_quantity"])

    def cancel(self):
        if self.status != self.STATUS_CANCELLED:
            self.restore_inventory()
            self.status = self.STATUS_CANCELLED
            self.save(update_fields=["status", "updated_at"])


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    product_slug = models.SlugField(max_length=255)
    product_name = models.CharField(max_length=255)
    selected_options_text = models.CharField(max_length=255, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2)
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
    city = models.CharField(max_length=120)
    country = models.CharField(max_length=120)
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


class NotificationLog(models.Model):
    EVENT_NEW_ORDER = "new_order"
    EVENT_PAID_ORDER = "paid_order"
    EVENT_PAYMENT_REVIEW = "payment_review"
    EVENT_LOW_STOCK = "low_stock"

    EVENT_CHOICES = (
        (EVENT_NEW_ORDER, "New order"),
        (EVENT_PAID_ORDER, "Paid order"),
        (EVENT_PAYMENT_REVIEW, "Payment review needed"),
        (EVENT_LOW_STOCK, "Low stock alert"),
    )

    event = models.CharField(max_length=40, choices=EVENT_CHOICES)
    title = models.CharField(max_length=160)
    body = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    success = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.event} - {'sent' if self.success else 'failed'}"


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
