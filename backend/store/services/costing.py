from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


COST_QUANTIZER = Decimal("0.001")


def quantize_cost(value):
    try:
        return Decimal(str(value or 0)).quantize(COST_QUANTIZER, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.000")


def _cost_or_none(value):
    if value in (None, ""):
        return None
    try:
        amount = Decimal(str(value)).quantize(COST_QUANTIZER, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return None
    return max(amount, Decimal("0.000"))


def _variant_options(raw):
    options = raw.get("options") if isinstance(raw, dict) else None
    if not isinstance(options, dict):
        return {}
    return {str(key).strip(): str(value).strip() for key, value in options.items() if str(key).strip()}


def _variant_identity(raw):
    if not isinstance(raw, dict):
        return set()
    return {
        str(value).strip()
        for value in (raw.get("id"), raw.get("sku"))
        if str(value or "").strip()
    }


def _snapshot_identity(variant_snapshot, variant_id):
    identity = {str(variant_id or "").strip()} if str(variant_id or "").strip() else set()
    if isinstance(variant_snapshot, dict):
        identity.update(
            str(value).strip()
            for value in (variant_snapshot.get("id"), variant_snapshot.get("sku"))
            if str(value or "").strip()
        )
    return identity


def _variant_matches(raw, *, variant_snapshot=None, variant_id=""):
    raw_identity = _variant_identity(raw)
    snapshot_identity = _snapshot_identity(variant_snapshot, variant_id)
    if raw_identity and snapshot_identity and raw_identity.intersection(snapshot_identity):
        return True

    snapshot_options = _variant_options(variant_snapshot) if isinstance(variant_snapshot, dict) else {}
    raw_options = _variant_options(raw)
    return bool(raw_options and snapshot_options and raw_options == snapshot_options)


def _variant_cost(raw):
    if not isinstance(raw, dict):
        return None
    nested = raw.get("cost") if isinstance(raw.get("cost"), dict) else {}
    for value in (
        raw.get("cost_price"),
        raw.get("unit_cost"),
        raw.get("base_cost"),
        raw.get("cost"),
        nested.get("amount"),
        nested.get("cost_price"),
    ):
        amount = _cost_or_none(value)
        if amount is not None:
            return amount
    return None


def _find_raw_variant(product, *, variant_snapshot=None, variant_id=""):
    rows = getattr(product, "variants", None)
    if not isinstance(rows, list):
        return None
    for raw in rows:
        if _variant_matches(raw, variant_snapshot=variant_snapshot, variant_id=variant_id):
            return raw
    return None


def resolve_fx_rate(value):
    """Normalise an OMR→region rate. Anything unusable falls back to 1 (no conversion)."""
    try:
        rate = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("1")
    return rate if rate > 0 else Decimal("1")


def convert_cost_to_order_currency(omr_cost, fx_rate):
    """Cost prices are captured once, in the base (OMR) currency.

    Order money — unit_price, line_total — is stored in the order's own currency,
    so a cost left in OMR sat in an AED row understating itself ~9.5x and inflating
    the gross profit beside it. Costs now travel to the order's currency the same
    way prices do.
    """
    return quantize_cost(Decimal(str(omr_cost or 0)) * resolve_fx_rate(fx_rate))


def resolve_order_item_cost(product, *, quantity=1, variant_snapshot=None, variant_id="", fx_rate=None):
    raw_variant = _find_raw_variant(product, variant_snapshot=variant_snapshot, variant_id=variant_id)
    variant_unit_cost = _variant_cost(raw_variant)
    product_unit_cost = quantize_cost(getattr(product, "cost_price", 0))
    base_unit_cost = variant_unit_cost if variant_unit_cost is not None else product_unit_cost
    unit_cost = convert_cost_to_order_currency(base_unit_cost, fx_rate)

    try:
        qty = max(int(quantity or 0), 0)
    except (TypeError, ValueError):
        qty = 0

    sku = ""
    if isinstance(variant_snapshot, dict):
        sku = str(variant_snapshot.get("sku") or "").strip()
    if not sku and isinstance(raw_variant, dict):
        sku = str(raw_variant.get("sku") or raw_variant.get("id") or "").strip()

    return {
        "sku": sku,
        "unit_cost_price": unit_cost,
        "line_cost_total": quantize_cost(unit_cost * qty),
        "cost_source": "variant" if variant_unit_cost is not None else "product",
        "missing_cost": unit_cost <= 0,
    }


def backfill_missing_order_item_costs(*, queryset=None, dry_run=False):
    """Fill in cost snapshots that were never captured.

    ``OrderItem.unit_cost_price`` is frozen when the order is placed. Every sale
    made before a product's cost price was entered in the admin therefore kept a
    zero cost forever — entering the cost later did nothing, and "Recalculate"
    only re-read the same zeroes. This walks those items and prices them from the
    product's current cost, converted into the order's own currency, marking each
    one estimated so the report can say where the number came from.

    Only zero-cost items are touched: a cost captured at sale time is the truth
    for that sale and is never overwritten.
    """
    from ..domain_models.commerce import OrderItem

    items = queryset if queryset is not None else OrderItem.objects.all()
    items = items.filter(unit_cost_price__lte=0).select_related("product", "order")

    updated = 0
    still_missing = 0
    missing_products = {}

    for item in items.iterator(chunk_size=500):
        product = item.product
        if product is None:
            still_missing += 1
            continue

        order = item.order
        fx_rate = None
        if order is not None:
            fx_rate = order.fx_rate_snapshot
            if fx_rate is None:
                fx_rate = getattr(order.region, "fx_rate", None)

        snapshot = resolve_order_item_cost(
            product,
            quantity=item.quantity,
            variant_snapshot=item.price_snapshot.get("variant") if isinstance(item.price_snapshot, dict) else None,
            variant_id=item.sku,
            fx_rate=fx_rate,
        )

        if snapshot["unit_cost_price"] <= 0:
            still_missing += 1
            missing_products.setdefault(product.slug, product.name_en)
            continue

        updated += 1
        if dry_run:
            continue

        item.unit_cost_price = snapshot["unit_cost_price"]
        item.line_cost_total = snapshot["line_cost_total"]
        item.cost_is_estimated = True
        item.save(update_fields=["unit_cost_price", "line_cost_total", "cost_is_estimated"])

    return {
        "updated": updated,
        "still_missing": still_missing,
        "missing_products": missing_products,
        "dry_run": dry_run,
    }


def repair_foreign_currency_costs(*, queryset=None, dry_run=False):
    """Re-denominate costs that were captured in the base currency by mistake.

    Before costs were converted at capture time, an order priced in AED or SAR
    stored its cost in OMR. The figure understated itself by the FX rate and
    inflated the gross profit sitting next to it. The stored number is in the
    wrong unit and cannot be rescued by arithmetic alone — the product's current
    cost, converted properly, is the best available truth — so these lines are
    recomputed and marked estimated.

    Recomputing from the same source each time makes this safe to run twice.
    """
    from ..domain_models.commerce import OrderItem
    from ..domain_models.catalog import Region

    base_currency = "OMR"
    default_region = Region.objects.filter(is_default=True).first()
    if default_region:
        base_currency = (default_region.currency_code or base_currency).upper()

    items = queryset if queryset is not None else OrderItem.objects.all()
    items = items.exclude(order__currency_code=base_currency).select_related("product", "order")

    repaired = 0
    skipped = 0

    for item in items.iterator(chunk_size=500):
        product = item.product
        order = item.order
        if product is None or order is None:
            skipped += 1
            continue

        fx_rate = order.fx_rate_snapshot
        if fx_rate is None:
            fx_rate = getattr(order.region, "fx_rate", None)
        if resolve_fx_rate(fx_rate) == Decimal("1"):
            skipped += 1
            continue

        snapshot = resolve_order_item_cost(
            product,
            quantity=item.quantity,
            variant_snapshot=item.price_snapshot.get("variant") if isinstance(item.price_snapshot, dict) else None,
            variant_id=item.sku,
            fx_rate=fx_rate,
        )
        if snapshot["unit_cost_price"] <= 0:
            skipped += 1
            continue
        if item.unit_cost_price == snapshot["unit_cost_price"]:
            continue

        repaired += 1
        if dry_run:
            continue

        item.unit_cost_price = snapshot["unit_cost_price"]
        item.line_cost_total = snapshot["line_cost_total"]
        item.cost_is_estimated = True
        item.save(update_fields=["unit_cost_price", "line_cost_total", "cost_is_estimated"])

    return {"repaired": repaired, "skipped": skipped, "dry_run": dry_run}
