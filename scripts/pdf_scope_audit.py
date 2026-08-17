"""
Read-only: the production data behind the client's "Website Updates" PDF.

Several PDF items were shipped as *settings* rather than as code, so whether
they are "done" depends on what is in the database, not on what is in the repo.
This prints those values in one pass so the scope report can cite them.

Writes nothing.

Run:  docker cp scripts/pdf_scope_audit.py <backend>:/app/ \
      && docker exec -w /app <backend> python pdf_scope_audit.py
"""

import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "enfant_backend.settings")
django.setup()

from django.db.models import Count, Q  # noqa: E402

from store.models import CmsPage, Order, Product, Region, Review, SiteSettings  # noqa: E402


def main():
    print("=== PDF #20 invoice email + #7(msg) address, per region ===")
    for region in Region.objects.order_by("code"):
        print(
            f"  {region.code}: seller_email={region.seller_email or '(blank)'!r} "
            f"contact_email={region.contact_email!r}"
        )
        print(f"       seller_address_en={region.seller_address_en or '(blank)'!r}")

    print("\n=== PDF #11 delivery promise (blank = nothing renders) ===")
    for region in Region.objects.order_by("code"):
        print(f"  {region.code}: {region.delivery_eta_min_days} – {region.delivery_eta_max_days} days")

    print("\n=== PDF #13 urgency strip (blank text hides it) ===")
    for settings_row in SiteSettings.objects.all():
        print(f"  en={settings_row.urgency_text_en!r}")
        print(f"  ar={settings_row.urgency_text_ar!r}")
        print(f"  ends_at={settings_row.urgency_ends_at}")

    print("\n=== PDF #2 / #4 reviews coverage ===")
    published = Product.objects.filter(is_published=True)
    annotated = published.annotate(
        approved=Count("customer_reviews", filter=Q(customer_reviews__is_approved=True))
    )
    without = annotated.filter(approved=0).count()
    print(f"  {published.count()} published products · {without} with no approved review")
    ratings = sorted({str(value) for value in published.values_list("rating", flat=True)})
    print(f"  distinct ratings in use: {', '.join(ratings)}")
    print(f"  approved reviews total: {Review.objects.filter(is_approved=True).count()}")
    print(f"  awaiting moderation:    {Review.objects.filter(is_approved=False).count()}")

    print("\n=== Admin #2 cost price coverage ===")
    missing = published.filter(Q(cost_price__isnull=True) | Q(cost_price=0)).count()
    print(f"  {missing} of {published.count()} published products have no cost price")

    print("\n=== Header #1 / #2 CMS pages ===")
    for page in CmsPage.objects.order_by("slug"):
        print(f"  {page.slug:16} published={page.is_published}")

    print("\n=== Pending #1 order confirmation reach ===")
    total = Order.objects.count()
    with_email = Order.objects.exclude(customer_email="").count()
    print(f"  {with_email} of {total} orders carry a customer email")


if __name__ == "__main__":
    main()
