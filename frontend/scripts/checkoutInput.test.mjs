import assert from "node:assert/strict";
import test from "node:test";

import {
  apiErrorMessage,
  normalizeCodeInput,
  normalizePhoneInput,
  PHONE_PATTERN,
  toAsciiDigits,
} from "../lib/checkoutInput.js";

test("Arabic-Indic, Persian and full-width digits become 0-9", () => {
  assert.equal(toAsciiDigits("٩١٢٣"), "9123");
  assert.equal(toAsciiDigits("۰۳۰۰"), "0300");
  assert.equal(toAsciiDigits("９１"), "91");
});

test("phone input drops bidi marks and non-ASCII separators", () => {
  assert.equal(normalizePhoneInput("+٩٦٨ ٩١٢٣"), "+968 9123");
  assert.equal(normalizePhoneInput("‪+968 9123‑4567‬"), "+968 9123-4567");
});

test("phone pattern compiles under the v flag the browser uses", () => {
  const re = new RegExp(`^(?:${PHONE_PATTERN})$`, "v");
  assert.ok(re.test("+968 9123 4567"));
  assert.ok(re.test("(050) 123-4567"));
  assert.ok(!re.test("abc"));
});

test("coupon codes normalise digits and full-width letters", () => {
  assert.equal(normalizeCodeInput("SAVE١٠"), "SAVE10");
  assert.equal(normalizeCodeInput("ＳＡＶＥ"), "SAVE");
});

test("nested DRF errors produce a readable, localised message", () => {
  const data = { customer: { phone: ["Enter a valid phone number (digits, optional +, 8–15 digits)."] } };
  assert.match(apiErrorMessage(data), /^Enter a valid phone number/);
  assert.match(apiErrorMessage(data, { isAr: true }), /رقم هاتف صحيح/);
  assert.equal(
    apiErrorMessage({ customer: { city: ["This field may not be blank."] } }, { isAr: true }),
    "المدينة: هذا الحقل مطلوب.",
  );
  assert.equal(apiErrorMessage({ detail: "Request was throttled." }), "Request was throttled.");
  assert.equal(apiErrorMessage({}, { fallback: "x" }), "x");
});
