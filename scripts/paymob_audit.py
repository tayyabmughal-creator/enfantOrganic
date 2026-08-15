"""
Read-only audit: which of our "pending" Paymob transactions did the customer
actually pay for?

Every callback was rejected on HMAC (see scripts/hmac_probe.py), so our own
records tell us nothing — the truth lives at Paymob. This asks Paymob directly,
per region, and prints what it finds. It writes nothing: deciding which orders
to mark paid is a money decision, made after reading this.

Run:  docker cp scripts/paymob_audit.py <backend>:/app/ && docker exec -w /app <backend> python paymob_audit.py
"""

import os
import time
from collections import defaultdict

import django
import requests

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "enfant_backend.settings")
django.setup()

from store.models import PaymentTransaction  # noqa: E402
from store.services.paymob import get_auth_token, get_paymob_config  # noqa: E402

TIMEOUT = 30
PAUSE_SECONDS = 0.3


def inquire(base_url, auth_token, paymob_order_id):
    """Ask Paymob for the transaction registered against one of its order ids."""
    response = requests.post(
        f"{base_url}/ecommerce/orders/transaction_inquiry",
        json={"auth_token": auth_token, "order_id": str(paymob_order_id)},
        timeout=TIMEOUT,
    )
    if response.status_code == 404:
        return {"_missing": True}
    response.raise_for_status()
    return response.json()


def main():
    rows = (
        PaymentTransaction.objects.filter(provider="paymob", status="pending")
        .select_related("order", "order__region")
        .order_by("created_at")
    )

    # Two rows are written per attempt, and retries reuse the order; one lookup
    # per distinct Paymob order id is enough.
    by_region = defaultdict(dict)
    for tx in rows:
        reference = str(tx.provider_reference or "").strip()
        if not reference:
            continue
        region = getattr(getattr(tx.order, "region", None), "code", "") or ""
        by_region[region].setdefault(reference, tx)

    print(f"{sum(len(v) for v in by_region.values())} distinct Paymob orders to check\n")

    paid, unpaid, missing, errors = [], [], [], []

    for region, references in sorted(by_region.items()):
        cfg = get_paymob_config(region)
        token = get_auth_token(cfg)
        print(f"--- region {region or '(default)'}: {len(references)} orders ---")

        for reference, tx in references.items():
            order = tx.order
            try:
                data = inquire(cfg["base_url"], token, reference)
            except Exception as exc:  # network/API problems are data, not a crash
                errors.append((order.order_number, reference, str(exc)[:120]))
                continue
            finally:
                time.sleep(PAUSE_SECONDS)

            if data.get("_missing"):
                missing.append((order.order_number, reference))
                continue

            success = bool(data.get("success"))
            pending = bool(data.get("pending"))
            errored = bool(data.get("error_occured"))
            record = (
                order.order_number,
                reference,
                str(data.get("id", "")),
                f"{order.grand_total} {order.currency_code}",
                order.payment_status,
                order.created_at.date().isoformat(),
            )
            if success and not pending and not errored:
                paid.append(record)
            else:
                unpaid.append(record)

    print(f"\n{'=' * 78}")
    print(f"PAID AT PAYMOB BUT NOT MARKED PAID HERE: {len(paid)}")
    print(f"{'=' * 78}")
    for order_number, reference, tx_id, amount, status, day in paid:
        print(f"  {day}  {order_number:20} {amount:>14}  our_status={status:8} paymob_tx={tx_id}")

    print(f"\ngenuinely not paid at Paymob: {len(unpaid)}")
    print(f"no transaction registered:    {len(missing)}")
    print(f"lookup errors:                {len(errors)}")
    for order_number, reference, message in errors[:10]:
        print(f"  {order_number} ({reference}): {message}")


if __name__ == "__main__":
    main()
