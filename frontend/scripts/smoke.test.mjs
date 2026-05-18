import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStorePath,
  isRtl,
  normalizeLocale,
  normalizeRegion,
} from "../lib/storefront-core/routing.js";
import { isBrowserUnreachableApiBase } from "../lib/config.js";

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
