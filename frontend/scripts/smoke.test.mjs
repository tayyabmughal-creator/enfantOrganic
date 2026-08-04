import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStorePath,
  isRtl,
  normalizeLocale,
  normalizeRegion,
  parseLocaleRegion,
  replaceLocaleInPath,
  replaceRegionInPath,
} from "../lib/storefront-core/routing.js";
import { resolveLegacyShopifyPath } from "../lib/legacyRedirects.js";
import {
  isBrowserUnreachableApiBase,
  safeRedirectUrl,
  shouldPreferSameOriginApiBase,
} from "../lib/config.js";
import {
  buildPageViewTrackingKey,
  shouldTrackStorefrontPageView,
} from "../lib/eventTracking.js";

test("normalizeLocale defaults to en", () => {
  assert.equal(normalizeLocale(""), "en");
  assert.equal(normalizeLocale("ar"), "ar");
});

test("normalizeRegion defaults to om", () => {
  assert.equal(normalizeRegion(""), "om");
  assert.equal(normalizeRegion("sa"), "sa");
});

test("isRtl is true for Arabic", () => {
  assert.equal(isRtl("ar"), true);
  assert.equal(isRtl("en"), false);
});

test("buildStorePath puts locale and region in one path segment", () => {
  assert.equal(buildStorePath("ar", "/checkout", "ae"), "/ar-ae/checkout");
  assert.equal(buildStorePath("en", "", "om"), "/en-om");
  assert.equal(buildStorePath("en", "/", "sa"), "/en-sa");
  // Region must not leak back into the query — that would give identical content
  // two addresses and split the canonical signal.
  assert.ok(!buildStorePath("ar", "/checkout", "ae").includes("region="));
});

test("normalizeLocale reads the combined segment", () => {
  assert.equal(normalizeLocale("ar-sa"), "ar");
  assert.equal(normalizeLocale("en-ae"), "en");
  assert.equal(normalizeLocale("nonsense"), "en");
});

test("normalizeRegion reads the combined segment", () => {
  assert.equal(normalizeRegion("ar-sa"), "sa");
  assert.equal(normalizeRegion("ae"), "ae");
});

test("parseLocaleRegion distinguishes canonical from legacy segments", () => {
  assert.deepEqual(parseLocaleRegion("en-ae"), { locale: "en", region: "ae", canonical: true });
  // Legacy bare locale still parses so middleware can 301 it, but is not canonical.
  assert.equal(parseLocaleRegion("en").canonical, false);
  assert.equal(parseLocaleRegion("collections"), null);
  assert.equal(parseLocaleRegion("en-us"), null);
});

test("replaceLocaleInPath keeps the region and vice versa", () => {
  assert.equal(replaceLocaleInPath("/en-ae/product/x", "ar"), "/ar-ae/product/x");
  assert.equal(replaceRegionInPath("/en-ae/product/x", "sa"), "/en-sa/product/x");
  assert.equal(replaceLocaleInPath("/en-om", "ar"), "/ar-om");
});

test("legacy Shopify paths map onto current URLs", () => {
  assert.equal(
    resolveLegacyShopifyPath("/en/products/baby-lotion", "ae"),
    "/en-ae/product/baby-lotion",
  );
  assert.equal(resolveLegacyShopifyPath("/products/baby-lotion", "om"), "/en-om/product/baby-lotion");
  assert.equal(resolveLegacyShopifyPath("/en/pages/about-us", "om"), "/en-om/about-us");
  assert.equal(resolveLegacyShopifyPath("/collections/all", "sa"), "/en-sa/collections");
  assert.equal(resolveLegacyShopifyPath("/ar/collections/wipes", "om"), "/ar-om/collections?category=wipes");
  // Current URLs must not be caught by the legacy rules.
  assert.equal(resolveLegacyShopifyPath("/en-om/product/baby-lotion", "om"), null);
  assert.equal(resolveLegacyShopifyPath("/en-om/collections", "om"), null);
});

test("loopback and internal API hosts are not browser reachable", () => {
  assert.equal(isBrowserUnreachableApiBase("http://127.0.0.1:8000/api"), true);
  assert.equal(isBrowserUnreachableApiBase("http://localhost:8000/api"), true);
  assert.equal(isBrowserUnreachableApiBase("http://backend:8000/api"), true);
  assert.equal(isBrowserUnreachableApiBase("https://shop.example.com/api"), false);
});

test("local browser origins keep explicit local API base", () => {
  assert.equal(
    shouldPreferSameOriginApiBase("http://127.0.0.1:8000/api", "127.0.0.1"),
    false,
  );
  assert.equal(
    shouldPreferSameOriginApiBase("http://localhost:8000/api", "localhost"),
    false,
  );
  assert.equal(
    shouldPreferSameOriginApiBase("http://127.0.0.1:8000/api", "shop.example.com"),
    true,
  );
});

test("safeRedirectUrl allows the Oman Paymob iframe origin", () => {
  // Regression guard: the backend's PAYMOB_BASE_URL is https://oman.paymob.com,
  // so the iframe redirect MUST be accepted or online checkout breaks.
  const omanIframe =
    "https://oman.paymob.com/api/acceptance/iframes/60088?payment_token=abc123";
  assert.equal(safeRedirectUrl(omanIframe), omanIframe);
  // Egypt host stays allowed for other deployments.
  assert.equal(
    safeRedirectUrl("https://accept.paymob.com/api/acceptance/iframes/1?payment_token=x"),
    "https://accept.paymob.com/api/acceptance/iframes/1?payment_token=x",
  );
  // A non-allowlisted origin is still rejected.
  assert.equal(safeRedirectUrl("https://evil.example.com/steal"), "");
});

test("page view tracking only runs on localized storefront routes", () => {
  assert.equal(shouldTrackStorefrontPageView("/en"), true);
  assert.equal(shouldTrackStorefrontPageView("/ar/products/baby-oil"), true);
  assert.equal(shouldTrackStorefrontPageView("/admin"), false);
  assert.equal(shouldTrackStorefrontPageView("/offline"), false);
});

test("page view dedupe key ignores region-only query churn", () => {
  assert.equal(
    buildPageViewTrackingKey("/en/products", "region=om&utm_source=instagram"),
    "/en/products?utm_source=instagram",
  );
  assert.equal(
    buildPageViewTrackingKey("/en/products", new URLSearchParams("utm_source=instagram&region=ae")),
    "/en/products?utm_source=instagram",
  );
});
