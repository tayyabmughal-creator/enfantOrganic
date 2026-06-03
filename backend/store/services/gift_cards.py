from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from ..models import GiftCard, GiftCardRedemption

MONEY_QUANTIZER = Decimal("0.01")


def _quantize_money(value):
    return Decimal(value).quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)


class GiftCardRedemptionError(Exception):
    pass


@transaction.atomic
def finalize_online_gift_card_redemption(order):
    redemption = (
        GiftCardRedemption.objects.select_for_update()
        .select_related("gift_card")
        .filter(order=order)
        .first()
    )
    if not redemption:
        return False
    if redemption.status != GiftCardRedemption.STATUS_PENDING:
        return False

    gift_card = GiftCard.objects.select_for_update().get(pk=redemption.gift_card_id)
    amount = _quantize_money(redemption.requested_amount or Decimal("0.00"))
    if amount <= 0:
        redemption.status = GiftCardRedemption.STATUS_RELEASED
        redemption.released_at = timezone.now()
        redemption.save(update_fields=["status", "released_at", "updated_at"])
        return False

    remaining = _quantize_money(gift_card.remaining_balance or Decimal("0.00"))
    if remaining < amount:
        raise GiftCardRedemptionError(
            f"Gift card {gift_card.code} has insufficient balance to finalize redemption."
        )

    gift_card.remaining_balance = _quantize_money(remaining - amount)
    update_fields = ["remaining_balance", "updated_at"]
    if gift_card.remaining_balance <= 0:
        gift_card.status = GiftCard.STATUS_REDEEMED
        gift_card.redeemed_at = timezone.now()
        gift_card.redeemed_by = order.user if getattr(order, "user_id", None) else None
        update_fields.extend(["status", "redeemed_at", "redeemed_by"])
    gift_card.save(update_fields=update_fields)

    redemption.status = GiftCardRedemption.STATUS_APPLIED
    redemption.applied_amount = amount
    redemption.applied_at = timezone.now()
    redemption.save(update_fields=["status", "applied_amount", "applied_at", "updated_at"])

    changed = False
    if str(order.gift_card_code or "").strip().upper() != str(gift_card.code or "").strip().upper():
        order.gift_card_code = gift_card.code
        changed = True
    if _quantize_money(order.gift_card_amount or Decimal("0.00")) != amount:
        order.gift_card_amount = amount
        changed = True
    if changed:
        order.save(update_fields=["gift_card_code", "gift_card_amount", "updated_at"])
    return True


@transaction.atomic
def release_pending_gift_card_redemption(order, *, reason=""):
    redemption = (
        GiftCardRedemption.objects.select_for_update()
        .filter(order=order, status=GiftCardRedemption.STATUS_PENDING)
        .first()
    )
    if not redemption:
        return False

    redemption.status = GiftCardRedemption.STATUS_RELEASED
    redemption.released_at = timezone.now()
    redemption.save(update_fields=["status", "released_at", "updated_at"])
    return True


@transaction.atomic
def reopen_released_gift_card_redemption(order):
    redemption = (
        GiftCardRedemption.objects.select_for_update()
        .filter(order=order, status=GiftCardRedemption.STATUS_RELEASED)
        .first()
    )
    if not redemption:
        return False

    redemption.status = GiftCardRedemption.STATUS_PENDING
    redemption.released_at = None
    redemption.save(update_fields=["status", "released_at", "updated_at"])
    return True
