"""Regional price conversion.

Single source of truth for turning a base-region (OMR) ProductPrice into the
other regions' prices using each Region.fx_rate. Used by both the
`convert_regional_prices` management command and the admin "Apply conversion
rates" action so the two can never drift apart.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from store.models import ProductPrice, Region

CENTS = Decimal("0.01")


def get_base_region():
    """The region whose prices are authored by hand and converted FROM.

    Prefers the explicit default region, then 'om', then any region.
    """
    return (
        Region.objects.filter(is_default=True).first()
        or Region.objects.filter(code="om").first()
        or Region.objects.first()
    )


def _convert(amount, rate):
    if amount is None:
        return None
    return (Decimal(amount) * Decimal(rate)).quantize(CENTS, rounding=ROUND_HALF_UP)


@transaction.atomic
def apply_fx_conversion(dry_run=False):
    """Recompute every non-base region's ProductPrice from the base price × fx_rate.

    Returns a summary dict. The base region's prices are never touched.
    Idempotent: rows already at the converted value are left as-is.
    """
    base = get_base_region()
    if base is None:
        return {"ok": False, "error": "No regions configured.", "updated": 0, "created": 0, "unchanged": 0}

    base_prices = list(
        ProductPrice.objects.filter(region=base).only(
            "product_id", "price", "compare_at_price",
            "price_prefix_en", "price_prefix_ar",
            "unit_price_text_en", "unit_price_text_ar",
        )
    )
    targets = Region.objects.exclude(pk=base.pk)

    updated = created = unchanged = 0
    preview = []

    for region in targets:
        rate = Decimal(region.fx_rate or 1)
        existing_by_product = {
            pp.product_id: pp
            for pp in ProductPrice.objects.filter(region=region)
        }
        for bp in base_prices:
            new_price = _convert(bp.price, rate)
            new_compare = _convert(bp.compare_at_price, rate)
            existing = existing_by_product.get(bp.product_id)

            if dry_run:
                preview.append({
                    "region": region.code,
                    "product_id": bp.product_id,
                    "old": str(existing.price) if existing else None,
                    "new": str(new_price),
                })
                continue

            if existing is None:
                ProductPrice.objects.create(
                    product_id=bp.product_id,
                    region=region,
                    price=new_price,
                    compare_at_price=new_compare,
                    price_prefix_en=bp.price_prefix_en,
                    price_prefix_ar=bp.price_prefix_ar,
                    unit_price_text_en=bp.unit_price_text_en,
                    unit_price_text_ar=bp.unit_price_text_ar,
                )
                created += 1
            elif existing.price != new_price or existing.compare_at_price != new_compare:
                existing.price = new_price
                existing.compare_at_price = new_compare
                existing.save(update_fields=["price", "compare_at_price"])
                updated += 1
            else:
                unchanged += 1

    result = {
        "ok": True,
        "base_region": base.code,
        "base_currency": base.currency_code,
        "updated": updated,
        "created": created,
        "unchanged": unchanged,
        "dry_run": dry_run,
    }
    if dry_run:
        result["preview"] = preview
    return result
