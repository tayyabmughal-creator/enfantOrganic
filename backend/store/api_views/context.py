from ..models import Product, Region, SiteSettings
from ..serializers import normalize_locale
from ..services.region_detection import get_default_region


class StorefrontContextMixin:
    def get_locale(self):
        return normalize_locale(self.request.query_params.get("locale", "en"))

    def get_region(self):
        code = self.request.query_params.get("region")
        if code:
            region = Region.objects.filter(code=code, is_active=True).first()
            if region:
                return region
        return get_default_region()

    def get_settings(self):
        return SiteSettings.objects.first()

    def get_serializer_context(self):
        return {
            "locale": self.get_locale(),
            "region": self.get_region(),
            "request": self.request,
        }


def product_queryset():
    return (
        Product.objects.filter(is_published=True)
        .select_related("category")
        .prefetch_related("tags", "prices__region", "warehouse_stocks__warehouse")
    )
