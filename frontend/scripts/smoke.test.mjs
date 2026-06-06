import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStorePath,
  isRtl,
  normalizeLocale,
  normalizeRegion,
} from "../lib/storefront-core/routing.js";
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

test("buildStorePath includes locale and region", () => {
  const path = buildStorePath("ar", "/checkout", "ae");
  assert.match(path, /^\/ar\/checkout/);
  assert.match(path, /region=ae/);
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
