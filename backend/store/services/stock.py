from django.db import transaction
from django.db.models import Q, Sum

from ..models import ProductStock, Warehouse
from ..notifications import notify_admins_low_stock


class StockError(Exception):
    def __init__(self, message, *, code="stock_error"):
        super().__init__(message)
        self.code = code


def get_region_warehouses(region):
    if not region:
        return Warehouse.objects.none()
    mapped = region.fulfillment_warehouses.filter(active=True)
    if mapped.exists():
        return mapped
    return Warehouse.objects.filter(region=region, active=True)


def _region_stocks_queryset(product, region, *, lock=False):
    warehouses = get_region_warehouses(region)
    if not warehouses.exists():
        return ProductStock.objects.none()
    queryset = ProductStock.objects.select_related("warehouse").filter(
        product=product,
        warehouse__in=warehouses,
        warehouse__active=True,
    )
    if lock:
        queryset = queryset.select_for_update()
    return queryset


def sync_product_stock_quantity(product):
    total = (
        ProductStock.objects.filter(product=product, warehouse__active=True)
        .aggregate(total=Sum("quantity"))
        .get("total")
    )
    product.stock_quantity = int(total or 0)
    product.save(update_fields=["stock_quantity"])
    return product.stock_quantity


def get_region_available_stock(product, region):
    if not product.track_inventory:
        return None
    warehouses = get_region_warehouses(region)
    if not warehouses.exists():
        return int(product.stock_quantity or 0)
    stocks = list(
        ProductStock.objects.select_related("warehouse").filter(
            product=product,
            warehouse__in=warehouses,
            warehouse__active=True,
        )
    )
    if not stocks:
        return 0
    return int(sum(stock.available_quantity for stock in stocks))


def filter_products_fulfillable_for_region(queryset, region):
    if not region:
        return queryset
    warehouses = list(get_region_warehouses(region).values_list("id", flat=True))
    if not warehouses:
        return queryset

    in_stock_ids = set(
        ProductStock.objects.filter(
            warehouse_id__in=warehouses,
            warehouse__active=True,
            quantity__gt=0,
        ).values_list("product_id", flat=True)
    )
    return queryset.filter(Q(track_inventory=False) | Q(pk__in=in_stock_ids))


def ensure_region_stock_available(product, region, required_qty):
    if not product.track_inventory:
        return None
    available_qty = get_region_available_stock(product, region)
    if available_qty is None:
        return None
    if int(required_qty) > int(available_qty):
        raise StockError(
            f"Only {available_qty} item(s) available for {product.name_en}.",
            code="insufficient_stock",
        )
    return int(available_qty)


def _notify_if_low_stock(stock):
    if not stock.product.track_inventory:
        return
    threshold = int(stock.low_stock_threshold or 0)
    if threshold < 0:
        threshold = 0
    if int(stock.available_quantity) <= threshold:
        notify_admins_low_stock(stock.product)


@transaction.atomic
def reserve_and_deduct_stock_for_item(product, region, quantity):
    """
    Reserve and deduct inventory for a single product in a selected region.

    Returns allocation list:
        [{"warehouse_id": 1, "warehouse_code": "sa-default", "quantity": 2}, ...]
    """
    if not product.track_inventory:
        return []

    required_qty = int(quantity or 0)
    if required_qty <= 0:
        return []

    warehouses = list(get_region_warehouses(region).values_list("id", flat=True))
    stocks = list(_region_stocks_queryset(product, region, lock=True).order_by("-quantity", "id"))
    allocations = []

    # Legacy fallback for products without warehouse rows.
    if not stocks:
        if warehouses:
            raise StockError(
                f"Only 0 item(s) available for {product.name_en}.",
                code="insufficient_stock",
            )
        if required_qty > int(product.stock_quantity or 0):
            raise StockError(
                f"Only {product.stock_quantity} item(s) available for {product.name_en}.",
                code="insufficient_stock",
            )
        product.stock_quantity = int(product.stock_quantity or 0) - required_qty
        product.save(update_fields=["stock_quantity"])
        allocations.append(
            {
                "warehouse_id": None,
                "warehouse_code": "legacy",
                "quantity": required_qty,
            }
        )
        return allocations

    total_available = int(sum(stock.available_quantity for stock in stocks))
    if required_qty > total_available:
        raise StockError(
            f"Only {total_available} item(s) available for {product.name_en}.",
            code="insufficient_stock",
        )

    remaining = required_qty
    for stock in stocks:
        if remaining <= 0:
            break
        take = min(int(stock.available_quantity), remaining)
        if take <= 0:
            continue
        stock.quantity = int(stock.quantity or 0) - take
        stock.reserved_quantity = int(stock.reserved_quantity or 0) + take
        stock.save(update_fields=["quantity", "reserved_quantity", "updated_at"])
        allocations.append(
            {
                "warehouse_id": stock.warehouse_id,
                "warehouse_code": stock.warehouse.code,
                "quantity": take,
            }
        )
        _notify_if_low_stock(stock)
        remaining -= take

    sync_product_stock_quantity(product)
    return allocations


@transaction.atomic
def restore_order_inventory(order, *, reason=""):
    if getattr(order, "inventory_released", False):
        return False

    for item in order.items.select_related("product"):
        if not item.product or not item.product.track_inventory:
            continue

        price_snapshot = item.price_snapshot or {}
        allocations = price_snapshot.get("warehouse_allocations", [])
        if allocations:
            for allocation in allocations:
                warehouse_id = allocation.get("warehouse_id")
                qty = int(allocation.get("quantity") or 0)
                if qty <= 0:
                    continue
                if warehouse_id is None:
                    item.product.stock_quantity = int(item.product.stock_quantity or 0) + qty
                    item.product.save(update_fields=["stock_quantity"])
                    continue
                stock = (
                    ProductStock.objects.select_for_update()
                    .filter(product=item.product, warehouse_id=warehouse_id)
                    .first()
                )
                if not stock:
                    continue
                stock.quantity = int(stock.quantity or 0) + qty
                stock.reserved_quantity = max(int(stock.reserved_quantity or 0) - qty, 0)
                stock.save(update_fields=["quantity", "reserved_quantity", "updated_at"])
            sync_product_stock_quantity(item.product)
        else:
            item.product.stock_quantity = int(item.product.stock_quantity or 0) + int(item.quantity or 0)
            item.product.save(update_fields=["stock_quantity"])

    order.inventory_released = True
    order.save(update_fields=["inventory_released", "updated_at"])
    return True
