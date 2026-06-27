/**
 * Storefront analytics event tracking.
 *
 * Writes real funnel events to the backend (POST /api/analytics/event/) so the
 * admin dashboard can show honest conversion data instead of fabricated proxies.
 *
 * Design goals:
 * - Fire-and-forget: every call is silent. Errors are swallowed so a tracking
 *   failure NEVER interrupts the user experience.
 * - Works for anonymous visitors: identifies sessions via a UUID stored in
 *   localStorage under SESSION_KEY.
 * - SSR-safe: all localStorage/fetch calls are guarded with typeof window checks.
 */

import { API_BASE_URL } from "./config.js";
import { readStoredRegion, regionFromSearchParams } from "./regionResolver.js";

const SESSION_KEY = "enfant-session-id";
const ATTRIBUTION_KEY = "enfant-attribution";
const LOCALIZED_STOREFRONT_PATH = /^\/(en|ar)(?=\/|$)/i;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function inferSource({ utmSource = "", referrer = "" } = {}) {
  const raw = String(utmSource || "").trim().toLowerCase();
  const ref = String(referrer || "").trim().toLowerCase();
  const value = raw || ref;
  if (!value) return "Direct";
  if (value.includes("instagram") || value === "ig") return "Instagram";
  if (value.includes("facebook") || value === "fb") return "Facebook";
  if (value.includes("tiktok")) return "TikTok";
  if (value.includes("snapchat")) return "Snapchat";
  if (value.includes("google")) return "Google";
  if (value.includes("whatsapp")) return "WhatsApp";
  if (raw) return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "Referral";
  }
}

function isExternalReferrer(referrer = "") {
  if (typeof window === "undefined" || !referrer) return false;
  try {
    const referrerUrl = new URL(referrer);
    return referrerUrl.hostname !== window.location.hostname;
  } catch {
    return false;
  }
}

function buildAttributionSnapshot({ sessionKey, regionCode = "" } = {}) {
  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer || "";
  return {
    session_key: sessionKey,
    source: inferSource({ utmSource: params.get("utm_source") || "", referrer }),
    medium: params.get("utm_medium") || "",
    campaign: params.get("utm_campaign") || "",
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || "",
    utm_term: params.get("utm_term") || "",
    referrer,
    landing_page: window.location.href,
    current_page: window.location.href,
    region_code: regionCode,
  };
}

function hasFreshAttribution() {
  const params = new URLSearchParams(window.location.search);
  return UTM_KEYS.some((key) => params.get(key)) || isExternalReferrer(document.referrer || "");
}

/**
 * Returns the persisted anonymous session ID, creating and storing a new UUID
 * if none exists yet.
 *
 * @returns {string} A 36-character UUID v4 string, or "" when localStorage is
 *   unavailable (e.g. private-browsing with storage blocked).
 */
export function getOrCreateSessionKey() {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function getAttributionSnapshot(extras = {}) {
  if (typeof window === "undefined") return {};

  const sessionKey = getOrCreateSessionKey();
  if (!sessionKey) return {};

  try {
    const existing = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed?.session_key === sessionKey) {
        const freshAttribution = hasFreshAttribution()
          ? buildAttributionSnapshot({ sessionKey, regionCode: extras.regionCode || parsed.region_code || "" })
          : null;
        const shouldResetLandingPage = Boolean(
          freshAttribution
          && (
            freshAttribution.utm_source
            || freshAttribution.referrer !== parsed.referrer
            || freshAttribution.source !== parsed.source
          ),
        );
        const snapshot = freshAttribution
          ? {
              ...parsed,
              ...freshAttribution,
              landing_page: shouldResetLandingPage
                ? freshAttribution.landing_page
                : parsed.landing_page || freshAttribution.landing_page,
            }
          : {
              ...parsed,
              current_page: window.location.href,
              region_code: extras.regionCode || parsed.region_code || "",
            };
        window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(snapshot));
        return snapshot;
      }
    }
  } catch {
    // Fall through and rebuild attribution below.
  }

  const snapshot = buildAttributionSnapshot({ sessionKey, regionCode: extras.regionCode || "" });

  try {
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(snapshot));
  } catch {
    // Attribution is helpful context, not required for checkout.
  }
  return snapshot;
}

export function shouldTrackStorefrontPageView(pathname = "") {
  return LOCALIZED_STOREFRONT_PATH.test(String(pathname || ""));
}

export function buildPageViewTrackingKey(pathname = "", searchParamsLike = "") {
  const params = new URLSearchParams(
    typeof searchParamsLike === "string"
      ? searchParamsLike
      : typeof searchParamsLike?.toString === "function"
        ? searchParamsLike.toString()
        : "",
  );
  params.delete("region");
  const query = params.toString();
  return `${pathname || ""}?${query}`;
}

export function resolveTrackingRegionCode(searchParams) {
  return regionFromSearchParams(searchParams) || readStoredRegion() || "om";
}

/**
 * Records a storefront analytics event.
 *
 * @param {string} eventType - One of "page_view" | "product_view" |
 *   "add_to_cart" | "checkout_initiated"
 * @param {{ productSlug?: string, regionCode?: string }} [extras]
 */
export function trackEvent(eventType, extras = {}) {
  if (typeof window === "undefined") return;

  const attribution = getAttributionSnapshot(extras);
  const sessionKey = attribution.session_key || getOrCreateSessionKey();
  if (!sessionKey) return;

  const body = {
    event_type: eventType,
    session_key: sessionKey,
    product_slug: extras.productSlug || undefined,
    region_code: extras.regionCode || undefined,
    metadata: attribution,
  };

  // Fire-and-forget — intentionally no await, no error surfacing.
  fetch(`${API_BASE_URL}/analytics/event/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // keepalive allows the request to outlive the current page navigation,
    // important for checkout_initiated which fires just before page changes.
    keepalive: true,
  }).catch(() => {
    // Silently ignore — tracking must never affect the user experience.
  });
}
