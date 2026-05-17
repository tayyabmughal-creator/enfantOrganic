import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStorePath,
  isRtl,
  normalizeLocale,
  normalizeRegion,
} from "../lib/storefront-core/routing.js";

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
