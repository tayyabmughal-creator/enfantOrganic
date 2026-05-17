// Centralized configuration for client-side fetches and storage keys.
//
// Single source of truth so we don't drift across components — and so any HTTP
// fallback in dev is at least consistent (production builds MUST set
// NEXT_PUBLIC_API_BASE_URL explicitly).

export const API_BASE_URL =
  (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_API_BASE_URL) ||
  "http://127.0.0.1:8000/api";

// localStorage keys. Two distinct realms (admin vs customer) to avoid one
// flow's token bleeding into the other.
//
// SECURITY NOTE: storing JWTs in localStorage is vulnerable to token theft via
// XSS. Migration to httpOnly Secure SameSite=Lax cookies requires (a) a
// /api/auth/login/ endpoint that issues Set-Cookie instead of returning the
// token, (b) a CookieJWTAuthentication class on the backend, (c) CSRF
// double-submit cookies on state-changing endpoints, and (d) replacing every
// `Authorization: Bearer ...` header in this codebase with
// `credentials: "include"`. Tracked as a follow-up — partial mitigations in
// place are short access TTL (15 min) + refresh rotation + CSP at the edge.
//
// NOTE on spelling: customer keys use "enfant-*" (French spelling) while admin
// keys use the project's brand name "enfhant-*". Existing admin sessions in
// the wild rely on the brand spelling — changing it would invalidate every
// active admin login. Standardize the imports but preserve the values.
export const CUSTOMER_TOKEN_KEY = "enfant-auth-token";
export const CUSTOMER_REFRESH_KEY = "enfant-auth-refresh";
export const ADMIN_TOKEN_KEY = "enfhant-admin-token";
export const ADMIN_REFRESH_KEY = "enfhant-admin-refresh";

// Allowed payment-redirect origins. Any window.location.href we set from API
// data MUST resolve to one of these. Override via
// NEXT_PUBLIC_PAYMENT_REDIRECT_ORIGINS as a comma-separated list.
const DEFAULT_REDIRECT_ORIGINS = [
  // Storefront origin (frontend self-redirects to /payment/success etc.)
  typeof window !== "undefined" ? window.location.origin : "",
  // Paymob
  "https://accept.paymob.com",
  "https://accept.paymobsolutions.com",
  // PayTabs
  "https://secure.paytabs.com",
  "https://secure.paytabs.sa",
  "https://secure-oman.paytabs.com",
  // Thawani
  "https://uatcheckout.thawani.om",
  "https://checkout.thawani.om",
  // OmanNet
  "https://omanet.om",
].filter(Boolean);

function envOrigins() {
  const raw =
    (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_PAYMENT_REDIRECT_ORIGINS) || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getAllowedPaymentOrigins() {
  return [...DEFAULT_REDIRECT_ORIGINS, ...envOrigins()];
}

/**
 * Returns the URL if it parses cleanly and its origin is on the allowlist
 * (or is a same-origin relative path). Returns "" otherwise — callers MUST
 * treat an empty result as untrusted and refuse to redirect.
 */
export function safeRedirectUrl(candidate) {
  if (!candidate || typeof candidate !== "string") return "";
  const trimmed = candidate.trim();
  if (!trimmed) return "";

  // Block protocol-relative ("//foo") and dangerous protocols outright.
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    return "";
  }
  if (trimmed.startsWith("//")) return "";

  // Same-origin relative paths are allowed.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";

  const allowed = getAllowedPaymentOrigins();
  return allowed.includes(parsed.origin) ? parsed.toString() : "";
}
