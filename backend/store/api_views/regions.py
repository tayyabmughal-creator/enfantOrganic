from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..serializers import RegionSerializer, normalize_locale
from ..services.region_detection import detect_region_for_request


class RegionDetectView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "region_detection"

    def get(self, request):
        region, source, country_code = detect_region_for_request(request)
        if region is None:
            return Response(
                {"detail": "No active regions configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        locale = normalize_locale(request.query_params.get("locale", "en"))
        payload = {
            "region_code": region.code,
            "source": source,
            "country_code": country_code if source == "ip" else "",
            "region": RegionSerializer(
                region,
                context={"locale": locale, "request": request},
            ).data,
        }
        return Response(payload, status=status.HTTP_200_OK)
