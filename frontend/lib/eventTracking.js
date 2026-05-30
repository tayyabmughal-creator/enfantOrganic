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

import { API_BASE_URL } from "@/lib/config";

const SESSION_KEY = "enfant-session-id";

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

/**
 * Records a storefront analytics event.
 *
 * @param {string} eventType - One of "page_view" | "product_view" |
 *   "add_to_cart" | "checkout_initiated"
 * @param {{ productSlug?: string, regionCode?: string }} [extras]
 */
export function trackEvent(eventType, extras = {}) {
  if (typeof window === "undefined") return;

  const sessionKey = getOrCreateSessionKey();
  if (!sessionKey) return;

  const body = {
    event_type: eventType,
    session_key: sessionKey,
    product_slug: extras.productSlug || undefined,
    region_code: extras.regionCode || undefined,
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
