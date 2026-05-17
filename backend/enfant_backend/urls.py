from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .auth_views import (
    ThrottledTokenBlacklistView,
    ThrottledTokenObtainPairView,
    ThrottledTokenRefreshView,
)

from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/auth/token/", ThrottledTokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("api/auth/token/refresh/", ThrottledTokenRefreshView.as_view(), name="token-refresh"),
    path("api/auth/token/logout/", ThrottledTokenBlacklistView.as_view(), name="token-blacklist"),
    path("api/", include("store.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
