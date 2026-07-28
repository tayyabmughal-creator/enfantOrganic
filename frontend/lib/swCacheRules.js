/**
 * Service-worker cache-eligibility rules.
 *
 * next-pwa stringifies `urlPattern` predicates into sw.js, so the copy in
 * next.config.mjs cannot import from here — a closure reference would become a
 * ReferenceError inside the service worker and take the whole worker down.
 * The regex is therefore duplicated by necessity, and swCacheRules.test.mjs
 * asserts the two copies stay identical.
 */

/**
 * Paths that must never be served from any cache: the admin panel, the
 * checkout/payment/account pages, and the customer-specific or transactional
 * API endpoints behind them.
 *
 * Deliberately matched on pathname alone, with no origin test. The browser
 * calls the API on a different host from the page it is rendering
 * (NEXT_PUBLIC_API_BASE_URL points at app.enfantorganic.com while pages come
 * from om|ae|sa.enfantorganic.com), so a sameOrigin guard never matched a
 * single API request.
 */
export const SENSITIVE_PATH_RE =
  /^\/(?:admin(?:\/|$)|(?:en|ar)\/(?:checkout|payment|account)(?:\/|$)|api\/(?:checkout|payments|auth|admin|account|orders|analytics)(?:\/|$))/i;

/**
 * True when a request must bypass the service-worker cache entirely.
 *
 * @param {{ url: URL }} req - the shape workbox passes to a urlPattern predicate
 */
export function isSensitiveRequest({ url }) {
  return SENSITIVE_PATH_RE.test(url.pathname);
}
