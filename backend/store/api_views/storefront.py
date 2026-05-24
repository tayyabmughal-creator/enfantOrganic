from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import (
    BlogPost,
    Category,
    HeroPromoCard,
    InstagramPost,
    Region,
    Tag,
    Testimonial,
)
from ..serializers import (
    BlogPostDetailSerializer,
    BlogPostSerializer,
    CategorySerializer,
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
                "product_categories": CategorySerializer(Category.objects.all(), many=True, context=ctx).data,
                "why_choose_us": serialized_settings["why_choose_links"],
                "static_links": serialized_settings["static_links"],
            },
            "contact": {
                "phone": region.contact_phone,
                "email": region.contact_email,
            },
        }
        return Response(payload)


class HomePageView(StorefrontContextMixin, APIView):
    serializer_class = ProductCardSerializer

    def get(self, request):
        locale = self.get_locale()
        context = self.get_serializer_context()
        settings = self.get_settings()
        serialized_settings = serialize_site_settings(settings, locale)
        qs = product_queryset()

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
            "testimonials": TestimonialSerializer(Testimonial.objects.all(), many=True, context=context).data,
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
        payload = {
            "hero": {
                "title": "All Products" if locale == "en" else "جميع المنتجات",
                "subtitle": "Browse the Enfant Organic catalog by category, region, and price." if locale == "en" else "تصفح كتالوج إنفانت أورجانيك حسب الفئة والمنطقة والسعر.",
            },
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
        product = product_queryset().filter(slug=slug).first()
        if not product:
            return Response({"detail": "Not found"}, status=404)

        related = product_queryset().filter(category=product.category).exclude(pk=product.pk)[:4]

        payload = {
            "breadcrumbs": [
                {"label": "Home" if locale == "en" else "الرئيسية", "href": f"/{locale}"},
                {"label": CategorySerializer(product.category, context=context).data["name"], "href": f"/{locale}/collections"},
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

        suggestions = []
        for item in ProductCardSerializer(matches, many=True, context=context).data:
            pricing = item.get("pricing") or {}
            suggestions.append(
                {
                    "type": "product",
                    "slug": item["slug"],
                    "name": item["name"],
                    "category": item["category"]["name"],
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


def apply_catalog_filters(queryset, request, region):
    search = request.query_params.get("search", "").strip()
    category = request.query_params.get("category", "").strip()
    brand = request.query_params.get("brand", "").strip()
    tag = request.query_params.get("tag", "").strip()
    min_price = request.query_params.get("min_price", "").strip()
    max_price = request.query_params.get("max_price", "").strip()
    ordering = request.query_params.get("ordering", "").strip()

    if search:
        queryset = apply_ranked_product_search(queryset, search)
    if category:
        queryset = queryset.filter(category__slug=category)
    if brand:
        queryset = queryset.filter(brand__iexact=brand)
    if tag:
        queryset = queryset.filter(tags__slug=tag)
    if min_price:
        queryset = queryset.filter(prices__region=region, prices__price__gte=min_price)
    if max_price:
        queryset = queryset.filter(prices__region=region, prices__price__lte=max_price)

    queryset = filter_products_fulfillable_for_region(queryset, region)

    if ordering == "price_asc":
        queryset = queryset.order_by("prices__price")
    elif ordering == "price_desc":
        queryset = queryset.order_by("-prices__price")
    elif ordering == "newest":
        queryset = queryset.order_by("-id")

    return queryset.distinct()
