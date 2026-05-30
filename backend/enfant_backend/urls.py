from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny, IsAdminUser

from .auth_views import (
    ThrottledTokenBlacklistView,
    ThrottledTokenObtainPairView,
    ThrottledTokenRefreshView,
)

from django.conf import settings
from django.conf.urls.static import static

DOCS_PERMISSION_CLASSES = [AllowAny] if settings.DEBUG else [IsAdminUser]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(permission_classes=DOCS_PERMISSION_CLASSES), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema", permission_classes=DOCS_PERMISSION_CLASSES),
        name="swagger-ui",
    ),
    path("api/auth/token/", ThrottledTokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("api/auth/token/refresh/", ThrottledTokenRefreshView.as_view(), name="token-refresh"),
    path("api/auth/token/logout/", ThrottledTokenBlacklistView.as_view(), name="token-blacklist"),
    path("api/", include("store.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
