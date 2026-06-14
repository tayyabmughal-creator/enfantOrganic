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

# Supported per-region Paymob configs. Each region needs its own
# Paymob-supported integration; credentials never cross regions.
PAYMOB_REGIONS = ("OM", "SA", "AE")
PAYMOB_DEFAULT_CURRENCY = {"OM": "OMR", "SA": "SAR", "AE": "AED"}


def _paymob_region_suffix(region_code):
    """Map a region code to its Paymob settings suffix (OM/SA/AE), or "" for the
    global/default (Oman) config when the region is unknown/unset."""
    normalized = str(region_code or "").strip().lower()
    if normalized == "uae":
        normalized = "ae"
    return {"om": "OM", "sa": "SA", "ae": "AE"}.get(normalized, "")


def _setting(name, default=""):
    return str(getattr(django_settings, name, "") or "").strip() or default


def _paymob_shared_account():
    """True when the merchant runs a single Paymob integration (Oman/OMR) for all
    regions. Non-default regions then borrow the global Oman credentials when they
    have none of their own, and the order total is converted to the integration's
    currency at charge time (see paymob._charge_amount_and_currency)."""
    return str(getattr(django_settings, "PAYMOB_SHARED_ACCOUNT", "") or "").strip().lower() in {
        "1", "true", "yes", "on",
    }


def _paymob_region_row(suffix):
    """Return the PaymobRegionConfig row for a region suffix, or None.

    Resolves to None on any failure (missing table during early migrations,
    unknown suffix) so env-based config keeps working.
    """
    if not suffix:
        return None
    try:
        from ..models import PaymobRegionConfig
        return PaymobRegionConfig.objects.filter(region_code=suffix).first()
    except Exception:
        return None


def _row_value(row, field):
    if row is None:
        return ""
    return str(getattr(row, field, "") or "").strip()


def get_paymob_config(region_code=""):
    """Resolve Paymob credentials for a given region.

    Resolution priority, per field (first non-empty wins):
      1. Region-specific admin/DB value  (PaymobRegionConfig row)
      2. Region-specific env value        (PAYMOB_*_OM / _SA / _AE)
      3. Global env / SiteSettings DB      — **Oman / default region only**
      4. Safe non-secret default           (base_url / currency)

    For Saudi (SA) and UAE (AE), integration_id/iframe_id/hmac_secret NEVER fall
    back to another region, so an OMR integration is never used for a SAR/AED
    order. When those regions have no admin/DB or per-region env credentials they
    resolve empty → the provider reports as disabled/setup-pending. The
    account-level api_key may fall back to the global key (same Paymob account).

    Blank admin/DB fields simply fall through to env — saving a blank value in
    the admin panel never overwrites or disables a working env-based config.
    """
    db = _site_settings()
    suffix = _paymob_region_suffix(region_code)
    base_is_default = suffix in ("", "OM")
    row_suffix = suffix or "OM"
    row = _paymob_region_row(row_suffix)

    def region_env(base):
        return _setting(f"{base}_{suffix}") if suffix else ""

    # Shared-account mode: a non-default region "borrows" the global Oman
    # integration ONLY when it has no integration of its own (admin/DB row or
    # per-region env). Regions that DO have their own real credentials keep them.
    own_integration = bool(
        _row_value(row, "integration_id") or region_env("PAYMOB_INTEGRATION_ID")
    )
    borrow_global = (not base_is_default) and _paymob_shared_account() and (not own_integration)
    is_default_region = base_is_default or borrow_global

    # api_key is account-level (one Paymob account, many per-region
    # integrations), so it may fall back to the global key for any region:
    # row → region env → global env/DB. This never makes a region "active" on
    # its own — integration_id/iframe_id/hmac_secret below still gate it.
    api_key = (
        _row_value(row, "api_key")
        or region_env("PAYMOB_API_KEY")
        or _get(db, "paymob_api_key", "PAYMOB_API_KEY")
    )

    def credential(row_field, env_base, db_field):
        value = _row_value(row, row_field) or region_env(env_base)
        if value:
            return value
        # Only the default (Oman) config inherits the global env/DB credential.
        return _get(db, db_field, env_base) if is_default_region else ""

    integration_id = credential("integration_id", "PAYMOB_INTEGRATION_ID", "paymob_integration_id")
    iframe_id      = credential("iframe_id",      "PAYMOB_IFRAME_ID",      "paymob_iframe_id")
    hmac_secret    = credential("hmac_secret",    "PAYMOB_HMAC_SECRET",    "paymob_hmac_secret")

    # base_url / currency are non-secret and always have a safe default.
    default_currency = PAYMOB_DEFAULT_CURRENCY.get(row_suffix, "OMR")
    if borrow_global:
        # Borrowing the Oman integration: force ITS endpoint + currency and ignore
        # the per-region uae.paymob.com / AED defaults, which point at the wrong
        # (non-existent) account. The amount is converted to this currency at
        # charge time.
        base_url = _get(db, "", "PAYMOB_BASE_URL", "https://accept.paymob.com/api")
        currency = _get(db, "paymob_currency", "PAYMOB_CURRENCY", "OMR")
    else:
        base_url = (
            _row_value(row, "base_url")
            or region_env("PAYMOB_BASE_URL")
            or (
                _get(db, "", "PAYMOB_BASE_URL", "https://accept.paymob.com/api")
                if is_default_region
                else _setting(f"PAYMOB_BASE_URL_{suffix}", "https://accept.paymob.com/api")
            )
        )
        currency = (
            _row_value(row, "currency")
            or region_env("PAYMOB_CURRENCY")
            or (
                _get(db, "paymob_currency", "PAYMOB_CURRENCY", default_currency)
                if is_default_region
                else _setting(f"PAYMOB_CURRENCY_{suffix}", default_currency)
            )
        )

    # An explicit admin row may switch a region off; absence of a row means the
    # region is implicitly enabled (env-driven), preserving existing behavior.
    enabled = bool(row.enabled) if row is not None else True

    # Unified Checkout keys are account-level (one Paymob account), so they always
    # resolve from the global env/DB regardless of region.
    secret_key = _get(db, "paymob_secret_key", "PAYMOB_SECRET_KEY")
    public_key = _get(db, "paymob_public_key", "PAYMOB_PUBLIC_KEY")

    return {
        "api_key":                   api_key,
        "integration_id":            integration_id,
        "iframe_id":                 iframe_id,
        "hmac_secret":               hmac_secret,
        "secret_key":                secret_key,
        "public_key":                public_key,
        "currency":                  currency,
        "base_url":                  base_url,
        "enabled":                   enabled,
        "apple_pay_integration_id":  _get(db, "paymob_apple_pay_integration_id",  "PAYMOB_APPLE_PAY_INTEGRATION_ID"),
        "apple_pay_iframe_id":       _get(db, "paymob_apple_pay_iframe_id",       "PAYMOB_APPLE_PAY_IFRAME_ID"),
        "region_code":               (suffix or "").lower(),
    }


def paymob_config_is_complete(cfg):
    """True when a resolved Paymob config has all credentials AND is enabled."""
    return bool(
        cfg.get("enabled")
        and cfg.get("api_key")
        and cfg.get("integration_id")
        and cfg.get("iframe_id")
        and cfg.get("hmac_secret")
    )


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
