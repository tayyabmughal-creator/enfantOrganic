from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Avg, Count

from ..models import Product, Review


def recalculate_product_review_aggregates(product_or_id):
    """Recalculate approved-review count/rating for one product."""
    product_id = getattr(product_or_id, "pk", product_or_id)
    if not product_id:
        return {"product_id": product_id, "review_count": 0, "rating": Decimal("5.0")}

    aggregate = Review.objects.filter(product_id=product_id, is_approved=True).aggregate(
        review_count=Count("id"),
        average_rating=Avg("rating"),
    )
    review_count = int(aggregate.get("review_count") or 0)
    average = aggregate.get("average_rating")
    rating = Decimal("5.0")
    if average is not None:
        rating = Decimal(str(average)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)

    Product.objects.filter(pk=product_id).update(review_count=review_count, rating=rating)
    return {"product_id": product_id, "review_count": review_count, "rating": rating}


def recalculate_all_product_review_aggregates(queryset=None):
    queryset = queryset or Product.objects.all()
    results = []
    for product_id in queryset.values_list("id", flat=True).iterator():
        results.append(recalculate_product_review_aggregates(product_id))
    return results
