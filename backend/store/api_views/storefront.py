from django.db.models import Count, DecimalField, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import (
    BlogPost,
    CmsPage,
    Category,
    HeroPromoCard,
    InstagramPost,
    Order,
    OrderItem,
    Region,
    Review,
    Tag,
    Testimonial,
)
from ..serializers import (
    BlogPostDetailSerializer,
    BlogPostSerializer,
    CategorySerializer,
    CmsPageSerializer,
    HeroPromoCardSerializer,
    InstagramPostSerializer,
    ProductCardSerializer,
    ProductDetailSerializer,
    RegionSerializer,
    TagSerializer,
    TestimonialSerializer,
    serialize_site_settings,
)
from ..services.search import apply_ranked_product_search
from ..services.stock import filter_products_fulfillable_for_region
from .context import StorefrontContextMixin, product_queryset


def _homepage_testimonials(locale):
    """Return Testimonial records; fallback to top customer Reviews when table is empty."""
    testimonials = Testimonial.objects.all()
    if testimonials.exists():
        return TestimonialSerializer(testimonials, many=True, context={"locale": locale}).data

    # Pull top 8 approved reviews ordered by helpful_count desc, then rating desc.
    reviews = (
        Review.objects.filter(is_approved=True, comment__regex=r'\S{10}')
        .order_by("-rating", "-created_at")[:8]
    )
    return [
        {
            "name": r.customer_name,
            "location": "",
            "quote": r.comment,
            "rating": r.rating,
        }
        for r in reviews
    ]


def products_available_for_region(queryset, region):
    if not region:
        return queryset.none()
    queryset = queryset.filter(prices__region=region)
    return filter_products_fulfillable_for_region(queryset, region).distinct()


BEST_SELLER_EXCLUDED_STATUSES = (
    Order.STATUS_CANCELLED,
    Order.STATUS_FAILED,
    Order.STATUS_REFUNDED,
)


def apply_best_seller_ranking(queryset):
    paid_items = (
        OrderItem.objects.filter(
            product_id=OuterRef("pk"),
            order__payment_status=Order.PAYMENT_PAID,
        )
        .exclude(order__status__in=BEST_SELLER_EXCLUDED_STATUSES)
        .values("product_id")
    )
    units_subquery = paid_items.annotate(total_units=Coalesce(Sum("quantity"), 0)).values("total_units")[:1]
    revenue_subquery = paid_items.annotate(
        total_revenue=Coalesce(
            Sum("line_total"),
            Value(0, output_field=DecimalField(max_digits=12, decimal_places=2)),
        )
    ).values("total_revenue")[:1]
    return queryset.annotate(
        best_seller_units=Coalesce(Subquery(units_subquery, output_field=IntegerField()), Value(0)),
        best_seller_revenue=Coalesce(
            Subquery(revenue_subquery, output_field=DecimalField(max_digits=12, decimal_places=2)),
            Value(0, output_field=DecimalField(max_digits=12, decimal_places=2)),
        ),
    )


@method_decorator(cache_page(60 * 3), name="dispatch")
class NavigationView(StorefrontContextMixin, APIView):
    serializer_class = RegionSerializer

    def get(self, request):
        locale = self.get_locale()
        region = self.get_region()
        settings = self.get_settings()

        ctx = {"locale": locale, "request": request}
        serialized_settings = serialize_site_settings(settings, locale)

        payload = {
            "locale": locale,
            "direction": "rtl" if locale == "ar" else "ltr",
            "current_region": RegionSerializer(region, context=ctx).data,
            "regions": RegionSerializer(Region.objects.filter(is_active=True), many=True, context=ctx).data,
            "settings": serialized_settings,
            "menus": {
                "product_categories": CategorySerializer(
                    Category.objects.annotate(product_count=Count("category_products")).order_by("-product_count", "name_en"),
                    many=True,
                    context=ctx,
                ).data,
                "why_choose_us": serialized_settings["why_choose_links"],
                "static_links": serialized_settings["static_links"],
            },
            "contact": {
                "phone": region.contact_phone,
                "email": region.contact_email,
            },
        }
        return Response(payload)


@method_decorator(cache_page(60 * 3), name="dispatch")
class HomePageView(StorefrontContextMixin, APIView):
    serializer_class = ProductCardSerializer

    def get(self, request):
        locale = self.get_locale()
        context = self.get_serializer_context()
        region = context["region"]
        settings = self.get_settings()
        serialized_settings = serialize_site_settings(settings, locale)
        qs = products_available_for_region(product_queryset(), region)

        sections = [
            {
                "key": "new-arrivals",
                "title": "New Arrivals" if locale == "en" else "وصل حديثًا",
                "subtitle": "Just Landed in Store" if locale == "en" else "وصلت للتو إلى المتجر",
                "products": ProductCardSerializer(qs.filter(show_in_new_arrivals=True)[:8], many=True, context=context).data,
            },
            {
                "key": "baby-sets",
                "title": "Baby Sets" if locale == "en" else "مجموعات الأطفال",
                "subtitle": "" if locale == "en" else "",
                "products": ProductCardSerializer(qs.filter(show_in_baby_sets=True)[:8], many=True, context=context).data,
            },
            {
                "key": "top-choices",
                "title": "Parents Top Choices" if locale == "en" else "الأكثر اختيارًا من الآباء",
                "subtitle": "" if locale == "en" else "",
                "products": ProductCardSerializer(qs.filter(show_in_top_choices=True)[:8], many=True, context=context).data,
            },
        ]

        payload = {
            "hero_cards": HeroPromoCardSerializer(
                HeroPromoCard.objects.filter(is_visible=True),
                many=True,
                context=context,
            ).data,
            "categories_heading": {
                "title": "Shop by Category" if locale == "en" else "تسوق حسب الفئة",
                "subtitle": "Discover our Premium collections" if locale == "en" else "اكتشف مجموعاتنا المميزة",
                "cta": "View All Categories" if locale == "en" else "عرض جميع الفئات",
            },
            "categories": CategorySerializer(Category.objects.all(), many=True, context=context).data,
            "sections": sections,
            "reviews_heading": "ENFANT Reviews" if locale == "en" else "آراء عملاء إنفانت",
            "testimonials": _homepage_testimonials(locale),
            "instagram": {
                "title": serialized_settings["instagram_title"],
                "cta": serialized_settings["instagram_cta"],
                "posts": InstagramPostSerializer(InstagramPost.objects.all(), many=True, context=context).data,
            },
            "blog": {
                "title": serialized_settings["blog_title"],
                "cta": "View all" if locale == "en" else "عرض الكل",
                "posts": BlogPostSerializer(BlogPost.objects.all()[:4], many=True, context=context).data,
            },
            "newsletter": {
                "title": serialized_settings["newsletter_title"],
                "subtitle": serialized_settings["newsletter_subtitle"],
                "placeholder": "Email address" if locale == "en" else "البريد الإلكتروني",
                "cta": "Subscribe to newsletter" if locale == "en" else "اشترك في النشرة البريدية",
            },
        }
        return Response(payload)


class CatalogPageView(StorefrontContextMixin, APIView):
    serializer_class = ProductDetailSerializer

    def get(self, request):
        locale = self.get_locale()
        context = self.get_serializer_context()
        products = apply_catalog_filters(product_queryset(), request, context["region"])

        category_slug = request.query_params.get("category", "").strip()
        hero_title = "All Products" if locale == "en" else "جميع المنتجات"
        hero_subtitle = (
            "Pure, gentle, organic essentials — thoughtfully crafted for your little one."
            if locale == "en"
            else "منتجات عضوية نقية ولطيفة — مصمّمة بعناية لطفلك الصغير."
        )
        if category_slug:
            try:
                cat = Category.objects.get(slug=category_slug)
                hero_title = cat.name_ar if locale == "ar" and cat.name_ar else cat.name_en
                if locale == "en" and cat.description_en:
                    hero_subtitle = cat.description_en
                elif locale == "ar" and cat.description_ar:
                    hero_subtitle = cat.description_ar
            except Category.DoesNotExist:
                pass

        payload = {
            "hero": {"title": hero_title, "subtitle": hero_subtitle},
            "categories": CategorySerializer(Category.objects.all(), many=True, context=context).data,
            "tags": TagSerializer(Tag.objects.all(), many=True, context=context).data,
            "products": ProductDetailSerializer(products, many=True, context=context).data,
        }
        return Response(payload)


class ProductListView(StorefrontContextMixin, APIView):
    serializer_class = ProductCardSerializer

    def get(self, request):
        context = self.get_serializer_context()
        serializer = ProductCardSerializer(
            apply_catalog_filters(product_queryset(), request, context["region"]),
            many=True,
            context=context,
        )
        return Response(serializer.data)


class ProductDetailView(StorefrontContextMixin, APIView):
    serializer_class = ProductDetailSerializer

    def get(self, request, slug):
        locale = self.get_locale()
        context = self.get_serializer_context()
        region = context["region"]
        product = products_available_for_region(
            product_queryset().filter(slug=slug),
            region,
        ).first()
        if not product:
            return Response({"detail": "Not found"}, status=404)

        primary_category = product.categories.first()
        related_qs = product_queryset().exclude(pk=product.pk)
        if primary_category:
            related_qs = related_qs.filter(categories=primary_category)
        related = products_available_for_region(related_qs, region)[:4]

        category_name = CategorySerializer(primary_category, context=context).data["name"] if primary_category else ""
        payload = {
            "breadcrumbs": [
                {"label": "Home" if locale == "en" else "الرئيسية", "href": f"/{locale}"},
                {"label": category_name, "href": f"/{locale}/collections"},
                {"label": ProductDetailSerializer(product, context=context).data["name"], "href": f"/{locale}/product/{product.slug}"},
            ],
            "product": ProductDetailSerializer(product, context=context).data,
            "related_products": ProductCardSerializer(related, many=True, context=context).data,
        }
        return Response(payload)


class SearchSuggestionsView(StorefrontContextMixin, APIView):
    serializer_class = ProductCardSerializer

    def get(self, request):
        locale = self.get_locale()
        context = self.get_serializer_context()
        query = str(
            request.query_params.get("q")
            or request.query_params.get("search")
            or ""
        ).strip()

        if not query:
            return Response(
                {
                    "query": "",
                    "locale": locale,
                    "suggestions": [],
                }
            )

        region = context["region"]
        matches = apply_ranked_product_search(product_queryset(), query)
        matches = filter_products_fulfillable_for_region(matches, region).distinct()[:8]

        seen_slugs = set()
        suggestions = []
        for item in ProductCardSerializer(matches, many=True, context=context).data:
            slug = item["slug"]
            if slug in seen_slugs:
                continue
            seen_slugs.add(slug)
            pricing = item.get("pricing") or {}
            suggestions.append(
                {
                    "type": "product",
                    "slug": slug,
                    "name": item["name"],
                    "category": (item["category"] or {}).get("name", ""),
                    "image": item.get("image", ""),
                    "currency_code": pricing.get("currency_code"),
                    "price": pricing.get("amount"),
                }
            )

        return Response(
            {
                "query": query,
                "locale": locale,
                "suggestions": suggestions,
            }
        )


class BlogListView(StorefrontContextMixin, APIView):
    serializer_class = BlogPostSerializer

    def get(self, request):
        context = self.get_serializer_context()
        posts = BlogPost.objects.all()
        return Response(BlogPostSerializer(posts, many=True, context=context).data)


class BlogDetailView(StorefrontContextMixin, APIView):
    serializer_class = BlogPostDetailSerializer

    def get(self, request, slug):
        context = self.get_serializer_context()
        post = BlogPost.objects.filter(slug=slug).first()
        if not post:
            return Response({"detail": "Not found."}, status=404)
        return Response(BlogPostDetailSerializer(post, context=context).data)


class CmsPageDetailView(StorefrontContextMixin, APIView):
    serializer_class = CmsPageSerializer

    def get(self, request, slug):
        context = self.get_serializer_context()
        region = context["region"]
        page = (
            CmsPage.objects.filter(slug=slug, is_published=True, region=region)
            .select_related("region")
            .first()
        )
        if not page:
            page = (
                CmsPage.objects.filter(slug=slug, is_published=True, region__isnull=True)
                .select_related("region")
                .first()
            )
        if not page:
            return Response({"detail": "Not found."}, status=404)
        return Response(CmsPageSerializer(page, context=context).data)


def apply_catalog_filters(queryset, request, region):
    search = request.query_params.get("search", "").strip()
    category = request.query_params.get("category", "").strip()
    brand = request.query_params.get("brand", "").strip()
    tag = request.query_params.get("tag", "").strip()
    min_price = request.query_params.get("min_price", "").strip()
    max_price = request.query_params.get("max_price", "").strip()
    availability = request.query_params.get("availability", "").strip().lower()
    rating_min = request.query_params.get("rating_min", "").strip()
    ordering = request.query_params.get("ordering", "").strip()
    collection = request.query_params.get("collection", "").strip().lower().replace("-", "_")
    only_new_arrivals = request.query_params.get("new_arrivals", "").strip().lower() in {"1", "true", "yes"}
    only_best_sellers = request.query_params.get("best_sellers", "").strip().lower() in {"1", "true", "yes"}
    ordering_best_sellers = ordering in {"best_sellers", "best-sellers", "bestsellers"}
    use_best_seller_ranking = collection == "best_sellers" or only_best_sellers or ordering_best_sellers

    queryset = products_available_for_region(queryset, region)

    if search:
        queryset = apply_ranked_product_search(queryset, search)
    if category:
        queryset = queryset.filter(categories__slug=category)
    if brand:
        queryset = queryset.filter(brand__iexact=brand)
    if tag:
        queryset = queryset.filter(tags__slug=tag)
    if min_price:
        queryset = queryset.filter(prices__region=region, prices__price__gte=min_price)
    if max_price:
        queryset = queryset.filter(prices__region=region, prices__price__lte=max_price)
    if rating_min:
        try:
            queryset = queryset.filter(rating__gte=float(rating_min))
        except (TypeError, ValueError):
            pass
    if availability == "in_stock":
        queryset = queryset.filter(Q(track_inventory=False) | Q(stock_quantity__gt=0))
    elif availability == "out_of_stock":
        queryset = queryset.filter(track_inventory=True, stock_quantity__lte=0)
    if collection == "new_arrivals" or only_new_arrivals:
        queryset = queryset.filter(show_in_new_arrivals=True)
    if use_best_seller_ranking:
        queryset = apply_best_seller_ranking(queryset)
        if collection == "best_sellers" or only_best_sellers:
            queryset = queryset.filter(best_seller_units__gt=0)

    if ordering in {"price_asc", "price-asc", "price_low_to_high"}:
        queryset = queryset.order_by("prices__price")
    elif ordering in {"price_desc", "price-desc", "price_high_to_low"}:
        queryset = queryset.order_by("-prices__price")
    elif ordering in {"newest", "-id"}:
        queryset = queryset.order_by("-id")
    elif ordering in {"rating", "rating_desc", "-rating"}:
        queryset = queryset.order_by("-rating", "-review_count", "-id")
    elif use_best_seller_ranking:
        queryset = queryset.order_by("-best_seller_units", "-best_seller_revenue", "-id")

    return queryset.distinct()
