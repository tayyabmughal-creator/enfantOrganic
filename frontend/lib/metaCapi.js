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
import { getOrCreateSessionKey } from "./eventTracking.js";

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

// Mirrors the Pixel's own `_fbc` cookie lifetime, so a stored click stops
// attributing conversions at the same point Meta would stop counting it.
const FBC_STORAGE_KEY = "enfant-meta-fbc";
const FBC_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The fbclid exactly as Facebook put it in the URL.
 *
 * Not `URLSearchParams`: it percent-decodes and turns "+" into a space. Meta
 * compares the fbclid inside `fbc` against the one it issued, and any such
 * rewrite is reported as a "modified fbclid value" against match quality.
 */
function readRawFbclid() {
  const match = String(window.location.search || "").match(/[?&]fbclid=([^&]*)/);
  return match ? match[1] : "";
}

function readStoredClick() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FBC_STORAGE_KEY) || "null");
    if (!parsed || !parsed.fbclid || !parsed.ts) return null;
    return Date.now() - parsed.ts > FBC_MAX_AGE_MS ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * The Meta click ID, in Meta's format: `fb.1.<click time>.<fbclid>`.
 *
 * The Pixel writes `_fbc` from the `fbclid` URL parameter, but only once it has
 * loaded — a visitor who converts quickly, or who blocks the Pixel outright,
 * never gets one. So the click is remembered here on first sight and replayed
 * for the rest of the funnel.
 *
 * Remembering it matters as much as capturing it. The fbclid only appears in
 * the URL of the landing page, and the timestamp belongs to the *click*, not to
 * the event being sent. Rebuilding from `Date.now()` on each event gave one
 * click several different `fbc` values — and gave the later funnel steps, whose
 * URL no longer carries the parameter, none at all. Meta reads both as a
 * modified click ID, which is what the AddToCart/InitiateCheckout/Purchase
 * diagnostic was reporting.
 */
export function getFbc() {
  const cookie = readCookie("_fbc");
  if (cookie) return cookie;
  if (typeof window === "undefined") return "";
  try {
    const fbclid = readRawFbclid();
    const stored = readStoredClick();

    if (fbclid && (!stored || stored.fbclid !== fbclid)) {
      // A new click wins over a remembered one — the visitor came back through
      // a different ad and that is the click this conversion belongs to.
      const click = { fbclid, ts: Date.now() };
      try {
        window.localStorage.setItem(FBC_STORAGE_KEY, JSON.stringify(click));
      } catch {
        // Storage can be blocked; the value below is still correct for this page.
      }
      return `fb.1.${click.ts}.${click.fbclid}`;
    }

    return stored ? `fb.1.${stored.ts}.${stored.fbclid}` : "";
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
    // Meta requires at least one *matching* key per event; client_ip_address and
    // client_user_agent do not count. On ViewContent/AddToCart there is no email
    // or phone yet, and `_fbp` only exists once the Pixel has run — so for anyone
    // blocking the Pixel (precisely the traffic CAPI exists to recover) the event
    // arrived with no identifier at all and Meta rejected it for attribution.
    // The storefront's own session id is a stable, first-party identifier and is
    // hashed server-side before it reaches Meta.
    external_id: getOrCreateSessionKey(),
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
