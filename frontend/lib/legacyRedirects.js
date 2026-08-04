// Relative, not aliased: this module is covered by the plain node test runner,
// which does not resolve the "@/" path alias.
import { buildStorePath } from "./storefront-core/routing.js";

/**
 * The storefront moved off Shopify, but Google still has the old Shopify URLs in
 * its index and they were all returning 404 — throwing away every bit of ranking
 * equity the brand had built. These rules 301 the old shapes onto their current
 * equivalents so that equity transfers instead of dying.
 *
 * Shopify shapes still seen in search results:
 *   /en/products/{slug}      /products/{slug}
 *   /en/pages/{slug}         /pages/{slug}
 *   /en/collections/{slug}   /collections/{slug}
 */
const SHOPIFY_PATH = new RegExp(
  "^" +
    "(?:/(?<locale>en|ar))?" + // optional Shopify locale prefix
    "/(?<kind>products|pages|collections)" +
    "(?:/(?<slug>[^/?#]+))?" +
    "/?$",
  "i",
);

export function resolveLegacyShopifyPath(pathname, region) {
  const match = String(pathname || "").match(SHOPIFY_PATH);
  if (!match?.groups) {
    return null;
  }

  const { kind, slug } = match.groups;
  const locale = (match.groups.locale || "en").toLowerCase();
  const decodedSlug = slug ? decodeURIComponent(slug) : "";

  if (kind.toLowerCase() === "products") {
    // A bare /products listing has no direct equivalent; send it to the catalogue.
    return decodedSlug
      ? buildStorePath(locale, `/product/${encodeURIComponent(decodedSlug)}`, region)
      : buildStorePath(locale, "/collections", region);
  }

  if (kind.toLowerCase() === "pages") {
    return decodedSlug
      ? buildStorePath(locale, `/${encodeURIComponent(decodedSlug)}`, region)
      : buildStorePath(locale, "/about", region);
  }

  // collections: Shopify's "all" pseudo-collection is just the full catalogue.
  const base = buildStorePath(locale, "/collections", region);
  if (!decodedSlug || decodedSlug.toLowerCase() === "all") {
    return base;
  }
  return `${base}?category=${encodeURIComponent(decodedSlug)}`;
}
