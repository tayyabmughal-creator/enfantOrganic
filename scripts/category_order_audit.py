"""
Read-only: what order does the storefront actually put categories in, and what
sort_order does each one carry?

The client sets a number per category in the admin and reports that "Shop by
Category" ignores it. This prints the stored numbers beside the order the
homepage queryset really produces, so we can tell a data problem (numbers never
saved / all zero) from a query problem (something overriding Meta.ordering).

Writes nothing.

Run:  docker cp scripts/category_order_audit.py <backend>:/app/ \
      && docker exec -w /app <backend> python category_order_audit.py
"""

import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "enfant_backend.settings")
django.setup()

from django.db.models import Count  # noqa: E402

from store.models import Category  # noqa: E402


def show(label, queryset):
    print(f"\n--- {label} ---")
    print(f"{'#':>3}  {'sort':>5}  {'id':>4}  {'cnt':>4}  name")
    for index, category in enumerate(queryset):
        count = getattr(category, "product_count", "")
        print(
            f"{index:>3}  {category.sort_order:>5}  {category.pk:>4}  "
            f"{str(count):>4}  {category.name_en}"
        )


def main():
    total = Category.objects.count()
    distinct = Category.objects.values("sort_order").distinct().count()
    zeroes = Category.objects.filter(sort_order=0).count()
    print(f"{total} categories · {distinct} distinct sort_order values · {zeroes} still at 0")

    # Exactly what the homepage builds.
    show(
        "homepage: Category.objects.annotate(product_count=Count('category_products'))",
        Category.objects.annotate(product_count=Count("category_products")),
    )

    # Exactly what the header dropdown builds.
    show(
        "nav menu: .annotate(...).order_by('-product_count', 'name_en')",
        Category.objects
        .annotate(product_count=Count("category_products"))
        .order_by("-product_count", "name_en"),
    )

    # The order the client is asking for.
    show("expected: .order_by('sort_order', 'id')", Category.objects.order_by("sort_order", "id"))


if __name__ == "__main__":
    main()
