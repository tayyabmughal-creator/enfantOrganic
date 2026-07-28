import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SENSITIVE_PATH_RE, isSensitiveRequest } from "../lib/swCacheRules.js";

const PAGE_ORIGIN = "https://om.enfantorganic.com";
const API_ORIGIN = "https://app.enfantorganic.com";

/** Build the shape workbox hands to a urlPattern predicate. */
function req(href) {
  const url = new URL(href);
  return { url, sameOrigin: url.origin === PAGE_ORIGIN };
}

// ─── the regression this rule exists for ─────────────────────────────────────
// The API is served from a different origin than the page. The original rule
// was gated on sameOrigin, so it never matched any API request and customer
// responses were retained by the cross-origin NetworkFirst handler for an hour.

for (const path of [
  "/api/orders/",
  "/api/orders/EO-20260727-0001/",
  "/api/account/",
  "/api/auth/login/",
  "/api/checkout/",
  "/api/payments/webhook/",
  "/api/admin/dashboard/",
  "/api/analytics/event/",
]) {
  test(`cross-origin ${path} is never cached`, () => {
    assert.equal(isSensitiveRequest(req(API_ORIGIN + path)), true);
  });
}

// ─── same-origin behaviour must be unchanged ─────────────────────────────────

for (const path of [
  "/admin",
  "/admin/products",
  "/en/checkout",
  "/ar/checkout/",
  "/en/payment",
  "/ar/account",
  "/api/orders/",
  "/api/payments/",
]) {
  test(`same-origin ${path} is never cached`, () => {
    assert.equal(isSensitiveRequest(req(PAGE_ORIGIN + path)), true);
  });
}

// ─── public content must stay cacheable ──────────────────────────────────────

for (const path of [
  "/en",
  "/ar",
  "/en/collections",
  "/en/product/some-slug",
  "/en/blog",
  "/api/products/",
  "/api/navigation/",
  "/api/regions/",
]) {
  test(`public ${path} remains cacheable`, () => {
    assert.equal(isSensitiveRequest(req(PAGE_ORIGIN + path)), false);
    assert.equal(isSensitiveRequest(req(API_ORIGIN + path)), false);
  });
}

// ─── path matching precision ─────────────────────────────────────────────────

test("sensitive prefixes do not match unrelated look-alike paths", () => {
  assert.equal(SENSITIVE_PATH_RE.test("/en/checkout-guide"), false);
  assert.equal(SENSITIVE_PATH_RE.test("/api/accounts-summary/"), false);
  assert.equal(SENSITIVE_PATH_RE.test("/administrator"), false);
});

test("sensitive prefixes match with and without a trailing slash", () => {
  for (const p of ["/admin", "/admin/", "/en/checkout", "/en/checkout/"]) {
    assert.equal(SENSITIVE_PATH_RE.test(p), true, p);
  }
});

test("matching is case-insensitive", () => {
  assert.equal(SENSITIVE_PATH_RE.test("/EN/Checkout"), true);
  assert.equal(SENSITIVE_PATH_RE.test("/API/Orders/"), true);
});

// ─── drift guard ─────────────────────────────────────────────────────────────
// next-pwa stringifies the predicate into sw.js, so next.config.mjs must inline
// the regex rather than import it. These two assertions are what stop the
// duplicated copy from silently diverging.

test("next.config.mjs inlines the identical sensitive-path regex", () => {
  const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.ok(
    config.includes(SENSITIVE_PATH_RE.source),
    "next.config.mjs no longer contains SENSITIVE_PATH_RE.source — the copies have drifted",
  );
});

test("the sensitive-path predicate in next.config.mjs stays self-contained", () => {
  const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  const rule = config.slice(
    config.indexOf("urlPattern: ({ url }) =>"),
    config.indexOf('cacheName: "sensitive-network-only"'),
  );
  assert.ok(rule.length > 0, "sensitive-network-only rule not found");
  // A closure reference here compiles fine but throws ReferenceError inside the
  // service worker, disabling caching rules entirely.
  for (const forbidden of ["isSensitiveRequest", "API_ORIGIN", "SENSITIVE_PATH_RE"]) {
    assert.ok(
      !rule.includes(forbidden),
      `predicate references ${forbidden}, which does not exist in the service-worker scope`,
    );
  }
});
