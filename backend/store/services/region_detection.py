import ipaddress

from django.conf import settings

from ..models import Region


COUNTRY_TO_REGION = {
    "OM": "om",
    "AE": "ae",
    "SA": "sa",
}

COUNTRY_HEADER_NAMES = (
    "HTTP_CF_IPCOUNTRY",
    "HTTP_CLOUDFRONT_VIEWER_COUNTRY",
    "HTTP_X_VERCEL_IP_COUNTRY",
    "HTTP_X_COUNTRY_CODE",
    "HTTP_X_GEO_COUNTRY",
    "HTTP_X_APPENGINE_COUNTRY",
)


def get_default_region():
    return (
        Region.objects.filter(is_default=True, is_active=True).first()
        or Region.objects.filter(is_active=True).order_by("sort_order", "id").first()
    )


def _parse_ip(value):
    candidate = str(value or "").strip()
    if not candidate:
        return None
    if candidate.startswith("[") and "]" in candidate:
        candidate = candidate[1 : candidate.index("]")]
    elif candidate.count(":") == 1 and "." in candidate:
        candidate = candidate.rsplit(":", 1)[0]
    try:
        return ipaddress.ip_address(candidate)
    except ValueError:
        return None


def _forwarded_for_candidates(value):
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def extract_client_ip(request):
    """Return a validated client IP from proxy headers without exposing it."""
    forwarded = [_parse_ip(item) for item in _forwarded_for_candidates(request.META.get("HTTP_X_FORWARDED_FOR"))]
    forwarded = [item for item in forwarded if item is not None]
    if forwarded:
        global_forwarded = next((item for item in forwarded if item.is_global), None)
        return str(global_forwarded or forwarded[0])

    for key in ("HTTP_X_REAL_IP", "REMOTE_ADDR"):
        parsed = _parse_ip(request.META.get(key))
        if parsed is not None:
            return str(parsed)
    return ""


def _clean_country_code(value):
    code = str(value or "").strip().upper()
    if len(code) != 2 or not code.isalpha() or code == "XX":
        return ""
    return code


def _settings_ip_country_overrides():
    raw = getattr(settings, "REGION_DETECTION_IP_COUNTRY_OVERRIDES", {})
    if isinstance(raw, dict):
        return {str(key).strip(): _clean_country_code(value) for key, value in raw.items()}
    overrides = {}
    for item in str(raw or "").split(","):
        ip_value, separator, country_code = item.partition("=")
        if separator:
            overrides[ip_value.strip()] = _clean_country_code(country_code)
    return overrides


def detect_country_code(request, client_ip=""):
    for header in COUNTRY_HEADER_NAMES:
        code = _clean_country_code(request.META.get(header))
        if code:
            return code

    overrides = _settings_ip_country_overrides()
    override = overrides.get(str(client_ip or "").strip())
    if override:
        return override

    if not client_ip:
        return ""

    parsed = _parse_ip(client_ip)
    if parsed is None or not parsed.is_global:
        return ""

    try:
        from django.contrib.gis.geoip2 import GeoIP2

        country = GeoIP2().country(str(parsed))
        return _clean_country_code(country.get("country_code"))
    except Exception:
        return ""


def get_region_for_country_code(country_code):
    region_code = COUNTRY_TO_REGION.get(_clean_country_code(country_code))
    if not region_code:
        return None
    return Region.objects.filter(code=region_code, is_active=True).first()


def detect_region_for_request(request):
    client_ip = extract_client_ip(request)
    country_code = detect_country_code(request, client_ip)
    region = get_region_for_country_code(country_code)
    if region is not None:
        return region, "ip", country_code
    return get_default_region(), "default", country_code
