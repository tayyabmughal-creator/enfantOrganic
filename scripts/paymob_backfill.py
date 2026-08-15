"""
Backfill the orders Paymob says were paid but our records still call unpaid.

Every callback was rejected on HMAC (scripts/hmac_probe.py), so money arrived
that we never recorded. scripts/paymob_audit.py asks Paymob which orders those
are; this applies the outcome the rejected callback should have applied.

Deliberately re-uses the production side effects, all of which are idempotent:
inventory commit is guarded by ``price_snapshot["inventory_committed"]``, the
invoice helper is an ``ensure_``, and Meta CAPI dedupes on ``event_id`` and
skips anything past its 6-day window — so historic orders correct their records
without emitting stale conversions.

Dry run:  python paymob_backfill.py
Apply:    python paymob_backfill.py --apply
"""

import os
import sys
import time
from collections import defaultdict

import django
import requests

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "enfant_backend.settings")
django.setup()

from django.db import transaction as db_transaction  # noqa: E402

from store.models import Order, PaymentTransaction  # noqa: E402
from store.services.meta_capi import enqueue_purchase_event  # noqa: E402
from store.services.paymob import get_auth_token, get_paymob_config  # noqa: E402
from store.services.stock import commit_reserved_inventory_for_order  # noqa: E402

APPLY = "--apply" in sys.argv
TIMEOUT = 30
PAUSE_SECONDS = 0.3


def inquire(base_url, auth_token, paymob_order_id):
    response = requests.post(
        f"{base_url}/ecommerce/orders/transaction_inquiry",
        json={"auth_token": auth_token, "order_id": str(paymob_order_id)},
        timeout=TIMEOUT,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def is_paid(data):
    return (
        bool(data.get("success"))
        and not bool(data.get("pending"))
        and not bool(data.get("error_occured"))
    )


def collect():
    """Distinct Paymob order ids still sitting at pending, grouped by region."""
    rows = (
        PaymentTransaction.objects.filter(provider="paymob", status="pending")
        .select_related("order", "order__region")
        .order_by("created_at")
    )
    by_region = defaultdict(dict)
    for tx in rows:
        reference = str(tx.provider_reference or "").strip()
        if reference:
            region = getattr(getattr(tx.order, "region", None), "code", "") or ""
            by_region[region].setdefault(reference, tx)
    return by_region


def apply_paid(order, paymob_tx_id, payload):
    """Mirror what api_views.payments would have done had the HMAC verified."""
    with db_transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)

        PaymentTransaction.objects.update_or_create(
            order=order,
            provider="paymob",
            provider_reference=str(paymob_tx_id),
            defaults={
                "amount": order.grand_total,
                "currency_code": order.currency_code,
                "status": PaymentTransaction.STATUS_PAID,
                "raw_response": payload,
            },
        )

        note = "Backfilled from Paymob transaction inquiry (callback was rejected on HMAC)."
        if order.payment_status != Order.PAYMENT_PAID:
            order.payment_status = Order.PAYMENT_PAID
            order.save(update_fields=["payment_status", "updated_at"])
        if order.status in {Order.STATUS_PENDING, Order.STATUS_CONFIRMED, Order.STATUS_FAILED}:
            if order.can_transition_to(Order.STATUS_PAID):
                order.transition_to(Order.STATUS_PAID, note=note)

    commit_reserved_inventory_for_order(order)
    enqueue_purchase_event(order)
    return order


def main():
    print(f"mode: {'APPLY' if APPLY else 'DRY RUN'}\n")
    already_paid, to_fix, skipped = [], [], 0

    for region, references in sorted(collect().items()):
        cfg = get_paymob_config(region)
        token = get_auth_token(cfg)
        for reference, tx in references.items():
            try:
                data = inquire(cfg["base_url"], token, reference)
            finally:
                time.sleep(PAUSE_SECONDS)
            if not data or not is_paid(data):
                skipped += 1
                continue
            (already_paid if tx.order.payment_status == Order.PAYMENT_PAID else to_fix).append(
                (tx.order, str(data.get("id", "")), data)
            )

    print(f"orders Paymob confirms paid:            {len(to_fix) + len(already_paid)}")
    print(f"  already marked paid here (records only): {len(already_paid)}")
    print(f"  NOT marked paid here (money unrecorded): {len(to_fix)}")
    print(f"not paid at Paymob / no transaction:    {skipped}\n")

    total = defaultdict(float)
    for order, paymob_tx_id, _ in to_fix:
        total[order.currency_code] += float(order.grand_total)
        print(f"  {order.created_at.date()}  {order.order_number:20} "
              f"{order.grand_total:>9} {order.currency_code}  paymob_tx={paymob_tx_id}")
    print("\n  unrecorded total: " + ", ".join(f"{v:.2f} {k}" for k, v in total.items()))

    if not APPLY:
        print("\nDry run — nothing written. Re-run with --apply.")
        return

    print(f"\n{'=' * 70}\napplying...\n")
    for order, paymob_tx_id, payload in to_fix:
        updated = apply_paid(order, paymob_tx_id, payload)
        print(f"  {updated.order_number}: payment_status={updated.payment_status} status={updated.status}")

    for order, paymob_tx_id, payload in already_paid:
        PaymentTransaction.objects.update_or_create(
            order=order,
            provider="paymob",
            provider_reference=str(paymob_tx_id),
            defaults={
                "amount": order.grand_total,
                "currency_code": order.currency_code,
                "status": PaymentTransaction.STATUS_PAID,
                "raw_response": payload,
            },
        )
        print(f"  {order.order_number}: transaction record corrected (order already paid)")

    print("\ndone.")


if __name__ == "__main__":
    main()
