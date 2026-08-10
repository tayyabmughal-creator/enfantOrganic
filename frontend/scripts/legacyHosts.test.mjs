import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The legacy hosts kept their own search results long after every page on them
 * started redirecting, because they still answered 200 for their own
 * /robots.txt and /sitemap.xml — which is a live site as far as Google is
 * concerned. These assertions pin the two rules that fix that, and the one
 * exemption that must survive.
 *
 * The middleware itself imports next/server, so rather than execute it these
 * read the regexes and the matcher straight out of the source.
 */
const SOURCE = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");

function readRegex(name) {
  const match = SOURCE.match(new RegExp(`const ${name} = /(.+?)/(i?);`));
  assert.ok(match, `${name} not found in middleware.js`);
  return new RegExp(match[1].replaceAll("\\/", "/"), match[2] || "");
}

const PASSTHROUGH = readRegex("PASSTHROUGH");
const API_PASSTHROUGH = readRegex("API_PASSTHROUGH");
const NON_CANONICAL_HOSTS = readRegex("NON_CANONICAL_HOSTS");
const REGION_SUBDOMAIN = readRegex("REGION_SUBDOMAIN");

const matcher = SOURCE.match(/matcher: \[\s*(?:\/\/[^\n]*\n\s*)*"([^"]+)"/)?.[1];

test("the matcher lets robots.txt and sitemap.xml reach the middleware", () => {
  assert.ok(matcher, "matcher pattern not found");
  // Excluding them is the Next.js default and is exactly what kept the legacy
  // hosts serving their own copies.
  assert.ok(!matcher.includes("robots.txt"), "robots.txt must not be excluded from the matcher");
  assert.ok(!matcher.includes("sitemap.xml"), "sitemap.xml must not be excluded from the matcher");
});

test("real static assets stay excluded from the middleware", () => {
  assert.ok(matcher.includes("_next/static"));
  assert.ok(matcher.includes("_next/image"));
});

test("robots.txt and sitemap.xml are not exempt from host canonicalisation", () => {
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    assert.equal(API_PASSTHROUGH.test(path), false, `${path} must be redirected on a legacy host`);
  }
});

test("the API stays exempt, so a stale service worker keeps working", () => {
  // app.enfantorganic.com still answers these, and a 301 would drop a POST body.
  for (const path of ["/api/products/", "/api/checkout/", "/admin", "/_next/data/x.json"]) {
    assert.equal(API_PASSTHROUGH.test(path), true, `${path} must not be redirected`);
  }
});

test("robots.txt and sitemap.xml still reach their route on the canonical host", () => {
  // Not in PASSTHROUGH is fine — the middleware falls through to Next for any
  // path that is not a storefront path. What matters is that they are not
  // short-circuited into a redirect.
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    assert.equal(PASSTHROUGH.test(path), false);
  }
});

test("every legacy host is recognised", () => {
  for (const host of ["om.enfantorganic.com", "ae.enfantorganic.com", "sa.enfantorganic.com"]) {
    assert.equal(REGION_SUBDOMAIN.test(host), true, host);
  }
  for (const host of ["app.enfantorganic.com", "enfantorganic.com"]) {
    assert.equal(NON_CANONICAL_HOSTS.test(host), true, host);
  }
});

test("the canonical host is never redirected to itself", () => {
  assert.equal(NON_CANONICAL_HOSTS.test("www.enfantorganic.com"), false);
  assert.equal(REGION_SUBDOMAIN.test("www.enfantorganic.com"), false);
});

test("a lookalike host is not treated as ours", () => {
  assert.equal(NON_CANONICAL_HOSTS.test("notenfantorganic.com"), false);
  assert.equal(REGION_SUBDOMAIN.test("om.enfantorganic.com.evil.test"), false);
});

const SITE_LEVEL_FILE = readRegex("SITE_LEVEL_FILE");

test("site-level files are recognised", () => {
  for (const path of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/favicon.ico"]) {
    assert.equal(SITE_LEVEL_FILE.test(path), true, path);
  }
});

test("a storefront path is not mistaken for a site-level file", () => {
  // These must keep having the region folded into them on a legacy host.
  for (const path of ["/collections", "/en-om", "/product/x", "/en-om/robots.txt"]) {
    assert.equal(SITE_LEVEL_FILE.test(path), false, path);
  }
});
