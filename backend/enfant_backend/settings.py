import os
import sys
from datetime import timedelta
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    with open(env_path) as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET_KEY environment variable is required")

DEBUG = env_bool("DJANGO_DEBUG", False)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver")

CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001",
)
# Never allow all origins in production — even if CORS_ALLOWED_ORIGINS is misconfigured to be empty,
# we refuse to fall back to wildcard CORS unless DEBUG is on AND the operator explicitly opts in.
CORS_ALLOW_ALL_ORIGINS = DEBUG and env_bool("DJANGO_CORS_ALLOW_ALL_DEV", False)
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    os.getenv(
        "DJANGO_CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:3000,http://localhost:3000",
    ),
)
# Public storefront URL used in transactional emails (password reset, order tracking)
FRONTEND_PUBLIC_URL = os.getenv("FRONTEND_PUBLIC_URL", "http://127.0.0.1:3000").rstrip("/")
# Used to build absolute media URLs in API responses. SSR requests arrive via
# the internal Docker network (Host: backend:8000) so build_absolute_uri()
# produces the wrong host; NEXT_PUBLIC_APP_URL always holds the real public domain.
MEDIA_HOST_URL = os.getenv("NEXT_PUBLIC_APP_URL", "").rstrip("/")

INSTALLED_APPS = [
    "corsheaders",
    "whitenoise.runserver_nostatic",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "store",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "enfant_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "enfant_backend.wsgi.application"
ASGI_APPLICATION = "enfant_backend.asgi.application"

if os.getenv("POSTGRES_DB") or os.getenv("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", "enfantorganic"),
            "USER": os.getenv("POSTGRES_USER", "postgres"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", ""),
            "HOST": os.getenv("POSTGRES_HOST", "127.0.0.1"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": int(os.getenv("POSTGRES_CONN_MAX_AGE", "60")),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        *(
            ["rest_framework.authentication.SessionAuthentication"]
            if DEBUG
            else []
        ),
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_RENDERER_CLASSES": (
        [
            "rest_framework.renderers.JSONRenderer",
            "rest_framework.renderers.BrowsableAPIRenderer",
        ]
        if DEBUG
        else ["rest_framework.renderers.JSONRenderer"]
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("DRF_ANON_RATE", "60/min"),
        "user": os.getenv("DRF_USER_RATE", "600/min"),
        "auth": os.getenv("DRF_AUTH_RATE", "5/min"),
        "password_reset": os.getenv("DRF_PASSWORD_RESET_RATE", "3/hour"),
        "checkout": os.getenv("DRF_CHECKOUT_RATE", "30/hour"),
        "payment": os.getenv("DRF_PAYMENT_RATE", "30/hour"),
        "region_detection": os.getenv("DRF_REGION_DETECTION_RATE", "120/hour"),
        "order_lookup": os.getenv("DRF_ORDER_LOOKUP_RATE", "5/hour"),
        "webhook": os.getenv("DRF_WEBHOOK_RATE", "120/min"),
        # Storefront analytics ingest fires on every page_view/product_view/
        # add_to_cart/checkout_initiated. Without this scope rate the view's
        # throttle_scope="analytics" raised ImproperlyConfigured -> HTTP 500 on
        # every event, so the admin "Conversion Breakdown" funnel never populated.
        "analytics": os.getenv("DRF_ANALYTICS_RATE", "1000/min"),
    },
}

# Admin CSV export cap — prevent mass data exfiltration in one request.
ADMIN_CSV_MAX_ROWS = int(os.getenv("ADMIN_CSV_MAX_ROWS", "10000"))

if "test" in sys.argv:
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["order_lookup"] = "10000/hour"
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["auth"] = "10000/min"
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["password_reset"] = "10000/hour"
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["payment"] = "10000/hour"
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["region_detection"] = "10000/hour"
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["webhook"] = "10000/min"
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["analytics"] = "100000/min"
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

# Disable throttling entirely in local dev so iterating on checkout/payment
# flows doesn't lock the developer out. Production (DEBUG=0) keeps full
# protection.
if DEBUG:
    REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []

# Custom pagination with configurable page_size query param
from rest_framework.pagination import PageNumberPagination as _PageNumberPagination


class _EnfantPagination(_PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


REST_FRAMEWORK["DEFAULT_PAGINATION_CLASS"] = f"{_EnfantPagination.__module__}.{_EnfantPagination.__qualname__}"

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "EnfhantOrganic API",
    "DESCRIPTION": "Regional bilingual e-commerce API for storefront, checkout, admin, and mobile operations.",
    "VERSION": os.getenv("API_VERSION", "1.0.0"),
    "SERVE_INCLUDE_SCHEMA": False,
}

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@example.com")

EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)

EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True") == "True"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Upload caps — reject oversized requests/files at the framework boundary so a
# single multipart POST can't blow up memory.
# (Defaults: 2.5 MiB in-memory, no hard request-body cap.)
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("DJANGO_DATA_UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))  # 10 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("DJANGO_FILE_UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))  # 10 MB
DATA_UPLOAD_MAX_NUMBER_FIELDS = int(os.getenv("DJANGO_DATA_UPLOAD_MAX_FIELDS", "1500"))

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", not DEBUG)
SESSION_COOKIE_SECURE = env_bool("DJANGO_SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = env_bool("DJANGO_CSRF_COOKIE_SECURE", not DEBUG)
SESSION_COOKIE_HTTPONLY = env_bool("DJANGO_SESSION_COOKIE_HTTPONLY", True)
CSRF_COOKIE_HTTPONLY = env_bool("DJANGO_CSRF_COOKIE_HTTPONLY", True)
SESSION_COOKIE_SAMESITE = os.getenv("DJANGO_SESSION_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_SAMESITE = os.getenv("DJANGO_CSRF_COOKIE_SAMESITE", "Lax")
SECURE_CONTENT_TYPE_NOSNIFF = env_bool("DJANGO_SECURE_CONTENT_TYPE_NOSNIFF", True)
SECURE_REFERRER_POLICY = os.getenv("DJANGO_SECURE_REFERRER_POLICY", "strict-origin-when-cross-origin")
X_FRAME_OPTIONS = os.getenv("DJANGO_X_FRAME_OPTIONS", "DENY")
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "0" if DEBUG else "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", not DEBUG)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", not DEBUG)

EXPO_PUSH_ENDPOINT = os.getenv("EXPO_PUSH_ENDPOINT", "https://exp.host/--/api/v2/push/send")

# ── Paymob payment gateway ──────────────────────────────────────────────────
# Obtain these from your Paymob dashboard at https://accept.paymob.com
PAYMOB_API_KEY = os.getenv("PAYMOB_API_KEY", "")
PAYMOB_INTEGRATION_ID = os.getenv("PAYMOB_INTEGRATION_ID", "")
PAYMOB_IFRAME_ID = os.getenv("PAYMOB_IFRAME_ID", "")
PAYMOB_HMAC_SECRET = os.getenv("PAYMOB_HMAC_SECRET", "")
PAYMOB_CURRENCY = os.getenv("PAYMOB_CURRENCY", "EGP")
PAYMOB_BASE_URL = os.getenv("PAYMOB_BASE_URL", "https://accept.paymob.com/api")
PAYMOB_APPLE_PAY_INTEGRATION_ID = os.getenv("PAYMOB_APPLE_PAY_INTEGRATION_ID", "")
PAYMOB_APPLE_PAY_IFRAME_ID = os.getenv("PAYMOB_APPLE_PAY_IFRAME_ID", "")

# Paymob Unified Checkout (Intention API). Uses account-level secret/public keys
# (omn_sk_live_… / omn_pk_live_…). When enabled AND both keys are present, the
# payment flow creates a payment "intention" and redirects the customer to
# Paymob's hosted Unified Checkout page (works with hosted/MIGS integrations that
# do NOT support the legacy embeddable iframe). Switch off once an iframe/Accept-
# compatible card integration is available for an embedded on-site form.
PAYMOB_SECRET_KEY = os.getenv("PAYMOB_SECRET_KEY", "")
PAYMOB_PUBLIC_KEY = os.getenv("PAYMOB_PUBLIC_KEY", "")
PAYMOB_USE_UNIFIED_CHECKOUT = os.getenv("PAYMOB_USE_UNIFIED_CHECKOUT", "1")
# Public site base URL used to build Paymob notification/redirection callbacks.
PAYMOB_PUBLIC_BASE_URL = (
    os.getenv("PAYMOB_PUBLIC_BASE_URL")
    or os.getenv("NEXT_PUBLIC_APP_URL")
    or os.getenv("FRONTEND_PUBLIC_URL")
    or ""
).rstrip("/")

# Region-scoped Paymob credentials (OM/SA/AE). Mirrors the PayTabs per-region
# pattern below. The global PAYMOB_* vars above are treated as the Oman/default
# config; a region's integration_id/iframe_id/hmac_secret MUST be set per region
# before Paymob is offered there — they never fall back to another region's
# integration (so SAR/AED orders are never sent through the OMR integration).
# api_key is account-level and may be shared, so it falls back to the global key.
# base_url/currency have safe per-region defaults (not secrets).
PAYMOB_API_KEY_OM = os.getenv("PAYMOB_API_KEY_OM", "")
PAYMOB_INTEGRATION_ID_OM = os.getenv("PAYMOB_INTEGRATION_ID_OM", "")
PAYMOB_IFRAME_ID_OM = os.getenv("PAYMOB_IFRAME_ID_OM", "")
PAYMOB_HMAC_SECRET_OM = os.getenv("PAYMOB_HMAC_SECRET_OM", "")
PAYMOB_BASE_URL_OM = os.getenv("PAYMOB_BASE_URL_OM", "https://oman.paymob.com/api")
PAYMOB_CURRENCY_OM = os.getenv("PAYMOB_CURRENCY_OM", "OMR")

PAYMOB_API_KEY_SA = os.getenv("PAYMOB_API_KEY_SA", "")
PAYMOB_INTEGRATION_ID_SA = os.getenv("PAYMOB_INTEGRATION_ID_SA", "")
PAYMOB_IFRAME_ID_SA = os.getenv("PAYMOB_IFRAME_ID_SA", "")
PAYMOB_HMAC_SECRET_SA = os.getenv("PAYMOB_HMAC_SECRET_SA", "")
PAYMOB_BASE_URL_SA = os.getenv("PAYMOB_BASE_URL_SA", "https://ksa.paymob.com/api")
PAYMOB_CURRENCY_SA = os.getenv("PAYMOB_CURRENCY_SA", "SAR")

PAYMOB_API_KEY_AE = os.getenv("PAYMOB_API_KEY_AE", "")
PAYMOB_INTEGRATION_ID_AE = os.getenv("PAYMOB_INTEGRATION_ID_AE", "")
PAYMOB_IFRAME_ID_AE = os.getenv("PAYMOB_IFRAME_ID_AE", "")
PAYMOB_HMAC_SECRET_AE = os.getenv("PAYMOB_HMAC_SECRET_AE", "")
PAYMOB_BASE_URL_AE = os.getenv("PAYMOB_BASE_URL_AE", "https://uae.paymob.com/api")
PAYMOB_CURRENCY_AE = os.getenv("PAYMOB_CURRENCY_AE", "AED")

# Shared-account mode: the merchant has a single Paymob integration (Oman / OMR)
# and wants every region (OM/SA/AE) to charge through it. When enabled, any region
# without its own Paymob integration credentials borrows the global Oman ones, and
# the order total is converted into the integration's currency (OMR) at charge
# time using the region's fx_rate. Set to "0" once real per-region integrations
# (e.g. a dedicated AED/SAR integration) are configured.
PAYMOB_SHARED_ACCOUNT = os.getenv("PAYMOB_SHARED_ACCOUNT", "1")

# ── Provider placeholders for GCC payment routing ──────────────────────────
PAYTABS_PROFILE_ID = os.getenv("PAYTABS_PROFILE_ID", "")
PAYTABS_SERVER_KEY = os.getenv("PAYTABS_SERVER_KEY", "")
PAYTABS_CLIENT_KEY = os.getenv("PAYTABS_CLIENT_KEY", "")
PAYTABS_BASE_URL = os.getenv("PAYTABS_BASE_URL", "https://secure.paytabs.sa")
PAYTABS_RETURN_BASE_URL = os.getenv("PAYTABS_RETURN_BASE_URL", "")
PAYTABS_CALLBACK_BASE_URL = os.getenv("PAYTABS_CALLBACK_BASE_URL", "")

# Region-scoped PayTabs credentials (OM/AE/SA)
PAYTABS_PROFILE_ID_OM = os.getenv("PAYTABS_PROFILE_ID_OM", "")
PAYTABS_SERVER_KEY_OM = os.getenv("PAYTABS_SERVER_KEY_OM", "")
PAYTABS_REGION_OM = os.getenv("PAYTABS_REGION_OM", "https://secure-oman.paytabs.com")

PAYTABS_PROFILE_ID_AE = os.getenv("PAYTABS_PROFILE_ID_AE", "")
PAYTABS_SERVER_KEY_AE = os.getenv("PAYTABS_SERVER_KEY_AE", "")
PAYTABS_REGION_AE = os.getenv("PAYTABS_REGION_AE", "https://secure.paytabs.com")

PAYTABS_PROFILE_ID_SA = os.getenv("PAYTABS_PROFILE_ID_SA", "")
PAYTABS_SERVER_KEY_SA = os.getenv("PAYTABS_SERVER_KEY_SA", "")
PAYTABS_REGION_SA = os.getenv("PAYTABS_REGION_SA", "https://secure.paytabs.sa")

HYPERPAY_ENTITY_ID = os.getenv("HYPERPAY_ENTITY_ID", "")
HYPERPAY_ACCESS_TOKEN = os.getenv("HYPERPAY_ACCESS_TOKEN", "")
HYPERPAY_BASE_URL = os.getenv("HYPERPAY_BASE_URL", "https://eu-prod.oppwa.com")

TELR_STORE_ID = os.getenv("TELR_STORE_ID", "")
TELR_AUTH_KEY = os.getenv("TELR_AUTH_KEY", "")
TELR_BASE_URL = os.getenv("TELR_BASE_URL", "https://secure.telr.com")

THAWANI_PUBLISHABLE_KEY = os.getenv("THAWANI_PUBLISHABLE_KEY", "")
THAWANI_SECRET_KEY = os.getenv("THAWANI_SECRET_KEY", "")
THAWANI_BASE_URL = os.getenv("THAWANI_BASE_URL", "https://uatcheckout.thawani.om")
THAWANI_WEBHOOK_SECRET = os.getenv("THAWANI_WEBHOOK_SECRET", "")
THAWANI_ENABLE_REAL_API = os.getenv("THAWANI_ENABLE_REAL_API", "0")
THAWANI_CREATE_SESSION_PATH = os.getenv("THAWANI_CREATE_SESSION_PATH", "/api/v1/checkout/session")

OMANNET_MERCHANT_ID = os.getenv("OMANNET_MERCHANT_ID", "")
OMANNET_ACCESS_CODE = os.getenv("OMANNET_ACCESS_CODE", "")
OMANNET_SHA_REQUEST = os.getenv("OMANNET_SHA_REQUEST", "")
OMANNET_SHA_RESPONSE = os.getenv("OMANNET_SHA_RESPONSE", "")
OMANNET_BASE_URL = os.getenv("OMANNET_BASE_URL", "https://omanet.om")
OMANNET_WEBHOOK_SECRET = os.getenv("OMANNET_WEBHOOK_SECRET", "")

# ── Carrier provider placeholders (shipping) ───────────────────────────────
ARAMEX_USERNAME = os.getenv("ARAMEX_USERNAME", "")
ARAMEX_PASSWORD = os.getenv("ARAMEX_PASSWORD", "")
ARAMEX_ACCOUNT_NUMBER = os.getenv("ARAMEX_ACCOUNT_NUMBER", "")
ARAMEX_ACCOUNT_PIN = os.getenv("ARAMEX_ACCOUNT_PIN", "")
ARAMEX_ACCOUNT_ENTITY = os.getenv("ARAMEX_ACCOUNT_ENTITY", "")
ARAMEX_ACCOUNT_COUNTRY_CODE = os.getenv("ARAMEX_ACCOUNT_COUNTRY_CODE", "")
ARAMEX_BASE_URL = os.getenv("ARAMEX_BASE_URL", "https://ws.aramex.net")
ARAMEX_ENABLE_REAL_API = os.getenv("ARAMEX_ENABLE_REAL_API", "0")
ARAMEX_TRACKING_BASE_URL = os.getenv("ARAMEX_TRACKING_BASE_URL", "https://www.aramex.com/us/en/track/results")

SMSA_API_KEY = os.getenv("SMSA_API_KEY", "")
SMSA_ACCOUNT_NUMBER = os.getenv("SMSA_ACCOUNT_NUMBER", "")
SMSA_BASE_URL = os.getenv("SMSA_BASE_URL", "https://api.smsaexpress.com")
SMSA_ENABLE_REAL_API = os.getenv("SMSA_ENABLE_REAL_API", "0")
SMSA_TRACKING_BASE_URL = os.getenv("SMSA_TRACKING_BASE_URL", "https://www.smsaexpress.com/trackingdetails")

FETCHR_API_KEY = os.getenv("FETCHR_API_KEY", "")
FETCHR_BASE_URL = os.getenv("FETCHR_BASE_URL", "https://api.fetchr.us")

# ── SMS providers (Unifonic/Twilio + mock fallback) ────────────────────────
SMS_DEFAULT_PROVIDER = os.getenv("SMS_DEFAULT_PROVIDER", "unifonic").strip().lower()
SMS_ENABLE_MOCK = env_bool("SMS_ENABLE_MOCK", DEBUG)
SMS_REQUEST_TIMEOUT = int(os.getenv("SMS_REQUEST_TIMEOUT", "15"))

UNIFONIC_BASE_URL = os.getenv("UNIFONIC_BASE_URL", "https://el.cloud.unifonic.com/rest/SMS/messages")
UNIFONIC_APP_SID = os.getenv("UNIFONIC_APP_SID", "")
UNIFONIC_SENDER_ID = os.getenv("UNIFONIC_SENDER_ID", "")
UNIFONIC_AUTH_TOKEN = os.getenv("UNIFONIC_AUTH_TOKEN", "")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
TWILIO_MESSAGING_SERVICE_SID = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "")
TWILIO_BASE_URL = os.getenv("TWILIO_BASE_URL", "https://api.twilio.com")

# ── WhatsApp Cloud API (Business templates + webhook) ───────────────────────
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "")
WHATSAPP_BUSINESS_ACCOUNT_ID = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", "")
WHATSAPP_GRAPH_API_BASE_URL = os.getenv("WHATSAPP_GRAPH_API_BASE_URL", "https://graph.facebook.com/v21.0")
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "")
WHATSAPP_REQUEST_TIMEOUT = int(os.getenv("WHATSAPP_REQUEST_TIMEOUT", "20"))

WHATSAPP_TEMPLATE_ORDER_CONFIRMED = os.getenv("WHATSAPP_TEMPLATE_ORDER_CONFIRMED", "")
WHATSAPP_TEMPLATE_ORDER_SHIPPED = os.getenv("WHATSAPP_TEMPLATE_ORDER_SHIPPED", "")
WHATSAPP_TEMPLATE_ORDER_DELIVERED = os.getenv("WHATSAPP_TEMPLATE_ORDER_DELIVERED", "")
WHATSAPP_TEMPLATE_REFUND_PROCESSED = os.getenv("WHATSAPP_TEMPLATE_REFUND_PROCESSED", "")

# ── Celery Configuration ───────────────────────────────────────────────────
def _redis_url(db: int) -> str:
    host = os.getenv("REDIS_HOST", "127.0.0.1")
    port = os.getenv("REDIS_PORT", "6379")
    password = os.getenv("REDIS_PASSWORD", "")
    auth = f":{password}@" if password else ""
    return f"redis://{auth}{host}:{port}/{db}"


CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", _redis_url(0))
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", _redis_url(1))
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    "clear_expired_sessions_daily": {
        "task": "store.tasks.clear_expired_sessions",
        "schedule": crontab(hour=0, minute=0),
    },
    "send_inventory_health_email_daily": {
        "task": "store.tasks.send_daily_inventory_health_email",
        "schedule": crontab(hour=9, minute=0),
    },
}

def _require_paymob_config():
    """Call this inside views that need Paymob — raises ImproperlyConfigured if env keys are missing."""
    from django.core.exceptions import ImproperlyConfigured
    missing = [
        name for name in ("PAYMOB_API_KEY", "PAYMOB_INTEGRATION_ID", "PAYMOB_IFRAME_ID", "PAYMOB_HMAC_SECRET")
        if not globals()[name]
    ]
    if missing:
        raise ImproperlyConfigured(
            f"Paymob is not configured. Set these environment variables: {', '.join(missing)}"
        )
