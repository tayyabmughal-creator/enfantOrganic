"""
Centralized payment gateway configuration loader.

Reads credentials from SiteSettings (DB) first, falls back to Django settings
(environment variables). This lets admins update payment credentials from the
admin panel without a redeploy. Existing env-var setups continue to work.
"""
import logging

from django.conf import settings as django_settings

logger = logging.getLogger(__name__)


def _site_settings():
    """Return the SiteSettings singleton, or None on any failure."""
    try:
        from ..models import SiteSettings
        return SiteSettings.objects.first()
    except Exception:
        return None


def _get(db_obj, db_field, settings_key, default=""):
    """Return DB value if non-empty, else fall back to Django settings."""
    if db_obj is not None:
        db_val = str(getattr(db_obj, db_field, "") or "").strip()
        if db_val:
            return db_val
    return str(getattr(django_settings, settings_key, default) or default).strip()


# ── Paymob ────────────────────────────────────────────────────────────────────

def get_paymob_config():
    db = _site_settings()
    return {
        "api_key":                   _get(db, "paymob_api_key",                   "PAYMOB_API_KEY"),
        "integration_id":            _get(db, "paymob_integration_id",            "PAYMOB_INTEGRATION_ID"),
        "iframe_id":                 _get(db, "paymob_iframe_id",                 "PAYMOB_IFRAME_ID"),
        "hmac_secret":               _get(db, "paymob_hmac_secret",               "PAYMOB_HMAC_SECRET"),
        "currency":                  _get(db, "paymob_currency",                  "PAYMOB_CURRENCY",   "EGP"),
        "base_url":                  _get(db, "",                                 "PAYMOB_BASE_URL",   "https://accept.paymob.com/api"),
        "apple_pay_integration_id":  _get(db, "paymob_apple_pay_integration_id",  "PAYMOB_APPLE_PAY_INTEGRATION_ID"),
        "apple_pay_iframe_id":       _get(db, "paymob_apple_pay_iframe_id",       "PAYMOB_APPLE_PAY_IFRAME_ID"),
    }


# ── PayTabs ───────────────────────────────────────────────────────────────────

def get_paytabs_config(region_code=""):
    db = _site_settings()
    from store.services.paytabs import _region_settings_suffix  # local import avoids circular
    suffix = _region_settings_suffix(region_code) if region_code else ""

    # Per-region env vars take priority; then DB global; then global env
    profile_id = (
        str(getattr(django_settings, f"PAYTABS_PROFILE_ID_{suffix}", "") or "").strip()
        or _get(db, "paytabs_profile_id", "PAYTABS_PROFILE_ID")
    )
    server_key = (
        str(getattr(django_settings, f"PAYTABS_SERVER_KEY_{suffix}", "") or "").strip()
        or _get(db, "paytabs_server_key", "PAYTABS_SERVER_KEY")
    )
    region_setting = (
        str(getattr(django_settings, f"PAYTABS_REGION_{suffix}", "") or "").strip()
        or _get(db, "paytabs_region", "PAYTABS_BASE_URL", "SA")
    )
    return {
        "profile_id":    profile_id,
        "server_key":    server_key,
        "region":        region_setting,
        "return_base":   str(getattr(django_settings, "PAYTABS_RETURN_BASE_URL",   "") or "").rstrip("/"),
        "callback_base": str(getattr(django_settings, "PAYTABS_CALLBACK_BASE_URL", "") or "").rstrip("/"),
        "client_key":    str(getattr(django_settings, "PAYTABS_CLIENT_KEY",        "") or "").strip(),
    }


# ── HyperPay ──────────────────────────────────────────────────────────────────

def get_hyperpay_config():
    db = _site_settings()
    return {
        "entity_id":     _get(db, "hyperpay_entity_id",    "HYPERPAY_ENTITY_ID"),
        "access_token":  _get(db, "hyperpay_access_token", "HYPERPAY_ACCESS_TOKEN"),
        "base_url":      _get(db, "",                      "HYPERPAY_BASE_URL", "https://eu-prod.oppwa.com"),
    }


# ── Telr ──────────────────────────────────────────────────────────────────────

def get_telr_config():
    db = _site_settings()
    return {
        "store_id":  _get(db, "telr_store_id",  "TELR_STORE_ID"),
        "auth_key":  _get(db, "telr_auth_key",  "TELR_AUTH_KEY"),
        "base_url":  _get(db, "",               "TELR_BASE_URL", "https://secure.telr.com"),
    }


# ── Thawani ───────────────────────────────────────────────────────────────────

def get_thawani_config():
    db = _site_settings()
    enable_real_api = str(
        getattr(django_settings, "THAWANI_ENABLE_REAL_API", "0")
    ).lower() in {"1", "true", "yes", "on"}
    return {
        "publishable_key":    _get(db, "thawani_publishable_key",  "THAWANI_PUBLISHABLE_KEY"),
        "secret_key":         _get(db, "thawani_secret_key",       "THAWANI_SECRET_KEY"),
        "base_url":           _get(db, "thawani_base_url",         "THAWANI_BASE_URL", "https://uatcheckout.thawani.om"),
        "webhook_secret":     _get(db, "thawani_webhook_secret",   "THAWANI_WEBHOOK_SECRET"),
        "enable_real_api":    enable_real_api,
        "create_session_path": str(
            getattr(django_settings, "THAWANI_CREATE_SESSION_PATH", "/api/v1/checkout/session") or "/api/v1/checkout/session"
        ),
    }


# ── OmanNet ───────────────────────────────────────────────────────────────────

def get_omannet_config():
    db = _site_settings()
    return {
        "merchant_id":    _get(db, "omannet_merchant_id",    "OMANNET_MERCHANT_ID"),
        "access_code":    _get(db, "omannet_access_code",    "OMANNET_ACCESS_CODE"),
        "sha_request":    _get(db, "omannet_sha_request",    "OMANNET_SHA_REQUEST"),
        "sha_response":   _get(db, "omannet_sha_response",   "OMANNET_SHA_RESPONSE"),
        "webhook_secret": _get(db, "omannet_webhook_secret", "OMANNET_WEBHOOK_SECRET"),
        "base_url":       _get(db, "",                       "OMANNET_BASE_URL", "https://www.omannet.om"),
    }
