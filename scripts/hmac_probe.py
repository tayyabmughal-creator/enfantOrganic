"""
Read-only probe: does the Oman HMAC secret we hold actually verify a real
Paymob callback, and is our boolean coercion the reason it fails?

Uses the transaction Paymob returned for EO-20260814-0002 (Apple Pay, 45.60 OMR,
AUTHORIZED/Approved) as captured verbatim in the nginx access log, including the
hmac Paymob itself computed. Prints only booleans and hash prefixes — never the
secret.

Run:  docker exec enfhantorganic-backend-1 python /app/scripts/hmac_probe.py
"""

import hashlib
import hmac as _hmac
import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "enfant_backend.settings")
django.setup()

from store.services.paymob import _HMAC_FIELDS, _get, get_paymob_config  # noqa: E402

RECEIVED_HMAC = (
    "b4c6adfc6bd20a3b20bbaed7d076f257f6c540430758a7be69df5311c55da540"
    "9b70594b5b48e1ce85383be4463302289989190af5e5dc1e3b87b742ad6e83b3"
)

# The callback exactly as Paymob sends it over the wire: JSON booleans, which
# arrive in the webhook body as Python bools.
PAYLOAD = {
    "amount_cents": 45600,
    "created_at": "2026-08-14T21:43:44.686978+04:00",
    "currency": "OMR",
    "error_occured": False,
    "has_parent_transaction": False,
    "id": 2607168,
    "integration_id": 70096,
    "is_3d_secure": False,
    "is_auth": False,
    "is_capture": False,
    "is_refunded": False,
    "is_standalone_payment": True,
    "is_voided": False,
    "order": {"id": 3397215, "merchant_order_id": "EO-20260814-0002"},
    "owner": 64437,
    "pending": False,
    "source_data": {"pan": "5282", "sub_type": "APPLE_PAY", "type": "apple pay"},
    "success": True,
}


def _get_lowercase_bools(data, dotted_key):
    """
    What Paymob signs, implemented independently of the code under test:
    JSON scalars, so booleans render 'true'/'false' and nested objects
    contribute the named leaf rather than their dict repr.
    """
    keys = dotted_key.split(".", 1)
    value = data.get(keys[0], "")
    if len(keys) == 2:
        value = value.get(keys[1], "") if isinstance(value, dict) else value
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


FIELDS_WITH_ORDER_ID = ["order.id" if f == "order" else f for f in _HMAC_FIELDS]


def sign(concat, secret):
    return _hmac.new(secret.encode("utf-8"), concat.encode("utf-8"), hashlib.sha512).hexdigest()


def main():
    secret = get_paymob_config("om")["hmac_secret"]
    print(f"om hmac secret configured: {bool(secret)} (length {len(secret)})")
    if not secret:
        return

    # PAYLOAD is the exact wire shape: JSON booleans, nested 'order' object.
    deployed = "".join(_get(PAYLOAD, f) for f in _HMAC_FIELDS)
    correct = "".join(_get_lowercase_bools(PAYLOAD, f) for f in FIELDS_WITH_ORDER_ID)

    print()
    print("A) code as deployed on this container")
    print(f"   concat starts: {deployed[:90]}")
    print(f"   matches Paymob: {_hmac.compare_digest(sign(deployed, secret), RECEIVED_HMAC)}")
    print()
    print("B) lowercase booleans + order.id")
    print(f"   concat starts: {correct[:90]}")
    print(f"   matches Paymob: {_hmac.compare_digest(sign(correct, secret), RECEIVED_HMAC)}")


if __name__ == "__main__":
    main()
