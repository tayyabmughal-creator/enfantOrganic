from django.conf import settings as django_settings
from django.db.models import Case, IntegerField, Value, When

from ..models import Product, SiteSettings


DEFAULT_INVENTORY_HEALTH_THRESHOLD = 10


def get_inventory_health_threshold():
    site_settings = SiteSettings.objects.only("inventory_low_stock_threshold").first()
    raw_threshold = (
        getattr(site_settings, "inventory_low_stock_threshold", None)
        if site_settings
        else DEFAULT_INVENTORY_HEALTH_THRESHOLD
    )
    try:
        return max(0, int(raw_threshold))
    except (TypeError, ValueError):
        return DEFAULT_INVENTORY_HEALTH_THRESHOLD


def get_inventory_admin_email():
    site_settings = SiteSettings.objects.only("contact_email").first()
    candidates = [
        getattr(site_settings, "contact_email", "") if site_settings else "",
        getattr(django_settings, "ADMIN_EMAIL", ""),
        getattr(django_settings, "DEFAULT_FROM_EMAIL", ""),
    ]
    for candidate in candidates:
        email = str(candidate or "").strip()
        if email:
            return email
    return ""


def inventory_status_for_quantity(quantity):
    qty = int(quantity or 0)
    if qty <= 0:
        return {
            "key": "out_of_stock",
            "label": "Out of Stock",
            "tone": "danger",
            "priority": 0,
        }
    if qty <= 5:
        return {
            "key": "critical",
            "label": "Critical",
            "tone": "critical",
            "priority": 1,
        }
    return {
        "key": "low_stock",
        "label": "Low Stock",
        "tone": "warning",
        "priority": 2,
    }


def inventory_health_queryset(*, threshold=None):
    resolved_threshold = get_inventory_health_threshold() if threshold is None else max(0, int(threshold or 0))
    return (
        Product.objects.filter(track_inventory=True, stock_quantity__lte=resolved_threshold)
        .annotate(
            inventory_health_priority=Case(
                When(stock_quantity__lte=0, then=Value(0)),
                When(stock_quantity__lte=5, then=Value(1)),
                default=Value(2),
                output_field=IntegerField(),
            )
        )
        .order_by("inventory_health_priority", "stock_quantity", "sort_order", "name_en", "id")
    )


def product_image_url(product, request=None):
    image_file = getattr(product, "image_file", None)
    if image_file:
        try:
            url = image_file.url
            return request.build_absolute_uri(url) if request else url
        except Exception:
            pass
    return str(getattr(product, "image", "") or "")


def serialize_inventory_health_products(*, threshold=None, limit=None, request=None):
    resolved_threshold = get_inventory_health_threshold() if threshold is None else max(0, int(threshold or 0))
    queryset = inventory_health_queryset(threshold=resolved_threshold)
    if limit:
        queryset = queryset[: int(limit)]

    rows = []
    for product in queryset:
        stock_quantity = int(product.stock_quantity or 0)
        status = inventory_status_for_quantity(stock_quantity)
        rows.append(
            {
                "id": product.id,
                "slug": product.slug,
                "name_en": product.name_en,
                "image": product_image_url(product, request=request),
                "stock_quantity": stock_quantity,
                "threshold": resolved_threshold,
                "status": status["key"],
                "status_label": status["label"],
                "status_tone": status["tone"],
                "priority": status["priority"],
            }
        )
    return rows


def inventory_health_summary(*, threshold=None, request=None):
    resolved_threshold = get_inventory_health_threshold() if threshold is None else max(0, int(threshold or 0))
    products = serialize_inventory_health_products(threshold=resolved_threshold, request=request)
    grouped = {
        "out_of_stock": [],
        "critical": [],
        "low_stock": [],
    }
    for product in products:
        grouped[product["status"]].append(product)
    return {
        "threshold": resolved_threshold,
        "count": len(products),
        "products": products,
        "out_of_stock": grouped["out_of_stock"],
        "critical": grouped["critical"],
        "low_stock": grouped["low_stock"],
    }
