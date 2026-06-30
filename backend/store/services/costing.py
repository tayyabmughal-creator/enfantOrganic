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


def resolve_order_item_cost(product, *, quantity=1, variant_snapshot=None, variant_id=""):
    raw_variant = _find_raw_variant(product, variant_snapshot=variant_snapshot, variant_id=variant_id)
    variant_unit_cost = _variant_cost(raw_variant)
    product_unit_cost = quantize_cost(getattr(product, "cost_price", 0))
    unit_cost = variant_unit_cost if variant_unit_cost is not None else product_unit_cost

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
