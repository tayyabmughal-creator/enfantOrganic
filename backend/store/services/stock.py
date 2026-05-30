from django.db import transaction
from django.db.models import F, Q, Sum

from ..models import ProductStock, Warehouse
from ..notifications import notify_admins_low_stock

INVENTORY_MODE_RESERVED = "reserved_only"
INVENTORY_MODE_DEDUCTED = "deducted_at_checkout"


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
            quantity__gt=F("reserved_quantity"),
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
def reserve_and_deduct_stock_for_item(product, region, quantity, *, commit_immediately=True):
    """
    Reserve inventory for a product and optionally commit deduction immediately.

    Returns allocation list:
        [{"warehouse_id": 1, "warehouse_code": "sa-default", "quantity": 2, "inventory_mode": "..."}]
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
        # Legacy fallback without warehouse rows cannot represent reservations.
        # Keep historical behavior (immediate deduction) and rely on restore flow
        # for failed/cancelled orders.
        product.stock_quantity = int(product.stock_quantity or 0) - required_qty
        product.save(update_fields=["stock_quantity"])
        allocations.append(
            {
                "warehouse_id": None,
                "warehouse_code": "legacy",
                "quantity": required_qty,
                "inventory_mode": INVENTORY_MODE_DEDUCTED,
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
        if commit_immediately:
            stock.quantity = int(stock.quantity or 0) - take
        stock.reserved_quantity = int(stock.reserved_quantity or 0) + take
        stock.save(update_fields=["quantity", "reserved_quantity", "updated_at"])
        allocations.append(
            {
                "warehouse_id": stock.warehouse_id,
                "warehouse_code": stock.warehouse.code,
                "quantity": take,
                "inventory_mode": INVENTORY_MODE_DEDUCTED if commit_immediately else INVENTORY_MODE_RESERVED,
            }
        )
        _notify_if_low_stock(stock)
        remaining -= take

    sync_product_stock_quantity(product)
    return allocations


@transaction.atomic
def commit_reserved_inventory_for_order(order):
    """
    Commit reserved inventory for an order exactly once.

    This is used for online-payment orders after confirmed payment success.
    """
    committed_any = False
    for item in order.items.select_related("product"):
        if not item.product or not item.product.track_inventory:
            continue

        price_snapshot = item.price_snapshot or {}
        if price_snapshot.get("inventory_committed") is True:
            continue

        allocations = price_snapshot.get("warehouse_allocations", [])
        if not allocations:
            continue

        item_committed = False
        for allocation in allocations:
            warehouse_id = allocation.get("warehouse_id")
            qty = int(allocation.get("quantity") or 0)
            mode = str(allocation.get("inventory_mode") or INVENTORY_MODE_DEDUCTED).strip().lower()
            if qty <= 0 or mode != INVENTORY_MODE_RESERVED or warehouse_id is None:
                continue

            stock = (
                ProductStock.objects.select_for_update()
                .filter(product=item.product, warehouse_id=warehouse_id)
                .first()
            )
            if not stock:
                continue

            # Commit: move from reserved bucket into deducted quantity.
            # Clamp with current reserved/quantity to stay safe under retries.
            committed_qty = min(qty, int(stock.reserved_quantity or 0), int(stock.quantity or 0))
            if committed_qty <= 0:
                continue
            stock.quantity = int(stock.quantity or 0) - committed_qty
            stock.reserved_quantity = int(stock.reserved_quantity or 0) - committed_qty
            stock.save(update_fields=["quantity", "reserved_quantity", "updated_at"])
            _notify_if_low_stock(stock)
            item_committed = True

        if item_committed:
            sync_product_stock_quantity(item.product)
            next_snapshot = dict(price_snapshot)
            next_snapshot["inventory_committed"] = True
            item.price_snapshot = next_snapshot
            item.save(update_fields=["price_snapshot"])
            committed_any = True

    return committed_any


@transaction.atomic
def reserve_inventory_for_online_retry(order):
    """
    Re-reserve stock for an online order that had its previous reservation released.
    """
    if not getattr(order, "inventory_released", False):
        return False

    reserved_any = False
    for item in order.items.select_related("product"):
        if not item.product or not item.product.track_inventory:
            continue

        allocations = reserve_and_deduct_stock_for_item(
            item.product,
            order.region,
            item.quantity,
            commit_immediately=False,
        )
        if not allocations:
            continue

        snapshot = dict(item.price_snapshot or {})
        snapshot["warehouse_allocations"] = allocations
        snapshot["inventory_committed"] = False
        item.price_snapshot = snapshot
        item.save(update_fields=["price_snapshot"])
        reserved_any = True

    if reserved_any:
        order.inventory_released = False
        order.save(update_fields=["inventory_released", "updated_at"])
    return reserved_any


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
                mode = str(allocation.get("inventory_mode") or INVENTORY_MODE_DEDUCTED).strip().lower()
                if qty <= 0:
                    continue
                if warehouse_id is None:
                    # Legacy/non-warehouse fallback always deducts immediately.
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
                if mode == INVENTORY_MODE_RESERVED:
                    stock.reserved_quantity = max(int(stock.reserved_quantity or 0) - qty, 0)
                else:
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
