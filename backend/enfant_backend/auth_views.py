from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView, TokenRefreshView


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class ThrottledTokenBlacklistView(TokenBlacklistView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"
