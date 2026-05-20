import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStorePath,
  isRtl,
  normalizeLocale,
  normalizeRegion,
} from "../lib/storefront-core/routing.js";
import { isBrowserUnreachableApiBase, safeRedirectUrl } from "../lib/config.js";

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
