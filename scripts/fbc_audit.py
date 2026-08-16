"""
Read-only: are the fbc values we send Meta well-formed, and when did the bad
ones stop?

Meta's "server sending modified fbclid value in fbc parameter" diagnostic was
our own bug (fixed in 27d8245): getFbc() rebuilt `fb.1.<now>.<fbclid>` on every
page, so one click produced a different fbc at each funnel step. Purchase is one
of the affected events and it carries whatever was stored on the order at
checkout — so orders captured before the fix keep replaying the old value and
keep the warning alive after the code is correct.

This prints the shape of the stored fbc per day so we can see the cutover.
Writes nothing.

Run:  docker cp scripts/fbc_audit.py <backend>:/app/ \
      && docker exec -w /app <backend> python fbc_audit.py
"""

import os
import re
from collections import Counter, defaultdict

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "enfant_backend.settings")
django.setup()

from store.models import Order  # noqa: E402

# What Meta expects: fb.<subdomain-index>.<creation-time-ms>.<fbclid verbatim>
WELL_FORMED = re.compile(r"^fb\.\d+\.\d{13}\.[A-Za-z0-9_\-\.]+$")


def classify(fbc):
    if not fbc:
        return "empty"
    if not WELL_FORMED.match(fbc):
        return "malformed"
    return "ok"


def main():
    orders = (
        Order.objects
        .exclude(meta_fbc="")
        .exclude(meta_fbc=None)
        .order_by("created_at")
        .values_list("created_at", "order_number", "meta_fbc")
    )

    per_day = defaultdict(Counter)
    samples = {}
    for created_at, order_number, fbc in orders:
        kind = classify(fbc)
        day = created_at.date().isoformat()
        per_day[day][kind] += 1
        if kind == "malformed" and kind not in samples:
            samples[kind] = (order_number, fbc)

    total = sum(sum(c.values()) for c in per_day.values())
    print(f"{total} orders carry an fbc\n")
    print(f"{'day':>12}  {'ok':>4}  {'malformed':>9}")
    for day in sorted(per_day):
        counts = per_day[day]
        print(f"{day:>12}  {counts['ok']:>4}  {counts['malformed']:>9}")

    if "malformed" in samples:
        order_number, fbc = samples["malformed"]
        print(f"\nexample malformed: {order_number} -> {fbc!r}")

    # The fbclid must survive verbatim; a lowercased one is the specific thing
    # Meta calls out. Flag any tail that is all-lowercase but long enough that a
    # real fbclid would almost certainly have mixed case.
    suspicious = [
        (number, fbc)
        for _, number, fbc in orders
        if classify(fbc) == "ok"
        and len(fbc.split(".", 3)[-1]) > 20
        and fbc.split(".", 3)[-1].islower()
    ]
    print(f"\nall-lowercase fbclid tails (possible truncation/lowercasing): {len(suspicious)}")
    for number, fbc in suspicious[:5]:
        print(f"  {number} -> {fbc}")


if __name__ == "__main__":
    main()
