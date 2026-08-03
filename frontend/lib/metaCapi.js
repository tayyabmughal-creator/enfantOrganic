/**
 * Meta Conversions API — browser side.
 *
 * Every funnel event is sent twice: once by the Pixel and once by our server,
 * both carrying the same `event_id` so Meta collapses them into one conversion.
 * The server copy is the one that survives ad blockers and iOS tracking
 * prevention, which is why Events Manager reported zero CAPI coverage for this
 * dataset while the Pixel looked healthy.
 *
 * This module never sends the event itself — it posts to our own backend, which
 * attaches the visitor's IP and user agent (those must come from the request,
 * not from here) and hashes the identity fields before they reach Meta. Raw
 * email and phone leave the browser over our own HTTPS origin only.
 */

import { API_BASE_URL } from "./config.js";

// Purchase is absent on purpose: it is sent from the order record server-side,
// so a value cannot be forged by anyone posting to the open relay endpoint.
const RELAYABLE_EVENTS = new Set([
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AddPaymentInfo",
]);

export function isRelayableMetaEvent(eventName) {
  return RELAYABLE_EVENTS.has(eventName);
}

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * The Meta browser ID cookie, set by the Pixel on first load.
 *
 * Together with `_fbc` this is the strongest match signal available — it ties
 * the event to a visitor Meta already recognises — and costs nothing in
 * privacy terms beyond what the Pixel itself already set.
 */
export function getFbp() {
  return readCookie("_fbp");
}

/**
 * The Meta click ID cookie.
 *
 * The Pixel writes `_fbc` from the `fbclid` URL parameter, but only once it has
 * loaded. A visitor who lands from an ad and converts quickly — or who blocks
 * the Pixel outright — can lose it, so the fbclid in the current URL is used as
 * a fallback, formatted exactly as Meta specifies (`fb.1.<timestamp>.<fbclid>`).
 */
export function getFbc() {
  const cookie = readCookie("_fbc");
  if (cookie) return cookie;
  if (typeof window === "undefined") return "";
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    return fbclid ? `fb.1.${Date.now()}.${fbclid}` : "";
  } catch {
    return "";
  }
}

export function buildMetaEventId(eventName) {
  const random =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${eventName.toLowerCase()}-${random}`;
}

/**
 * Relay one event to our backend for server-side delivery.
 *
 * Fire-and-forget, like the rest of storefront tracking: an analytics failure
 * must never surface to the customer or block a checkout submit. `keepalive`
 * matters here because InitiateCheckout and AddPaymentInfo fire immediately
 * before a navigation that would otherwise cancel the request.
 */
export function relayMetaEvent(eventName, { eventId, customData = {}, userData = {}, regionCode = "" } = {}) {
  if (typeof window === "undefined") return;
  if (!isRelayableMetaEvent(eventName) || !eventId) return;

  const body = {
    event_name: eventName,
    event_id: eventId,
    // Passed verbatim: the storefront geo-redirects to om./ae./sa. subdomains,
    // so a canonicalised URL would no longer match what the Pixel reported and
    // would weaken Meta's confidence in the deduplication pair.
    event_source_url: window.location.href,
    fbp: getFbp(),
    fbc: getFbc(),
    region_code: regionCode,
    user_data: userData,
    custom_data: customData,
  };

  try {
    fetch(`${API_BASE_URL}/analytics/meta-event/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // Silent by design — tracking must never affect the user experience.
    });
  } catch {
    // Same.
  }
}

/**
 * Identity fields for a checkout in progress, in the shape the backend expects.
 *
 * Only non-empty values are included: Meta scores a present-but-empty field
 * against match quality, which is what drives the "Set up manual advanced
 * matching" warning in Events Manager.
 */
export function buildMetaUserData({ name = "", email = "", phone = "", city = "", postcode = "", country = "" } = {}) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const data = {
    email: String(email || "").trim(),
    phone: String(phone || "").trim(),
    first_name: parts[0] || "",
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
    city: String(city || "").trim(),
    postcode: String(postcode || "").trim(),
    country: String(country || "").trim(),
  };
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value));
}
