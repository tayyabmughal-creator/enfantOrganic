import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cartSavings, milestoneReward } from "../lib/storefront-core/money.js";

/**
 * Two things went wrong in the cart drawer and both are cheap to pin down here.
 *
 * The layout one: the drawer's item list was an unpinned grid, so its implicit
 * column took the max-content width of the suggestions rail inside it (~770px
 * against a 390px panel). Every line was stretched to that, putting the price,
 * the stepper and the remove button outside the drawer — the shopper had to
 * scroll sideways to reach them.
 *
 * The numbers one: the rewards bar announced an unlocked discount that no total
 * on the cart included, so the cart and the order summary disagreed about what
 * the basket saved.
 */

const overlays = readFileSync(new URL("../app/styles/overlays.css", import.meta.url), "utf8");
const drawer = readFileSync(
  new URL("../components/store/cart/CartDrawer.jsx", import.meta.url),
  "utf8",
);

/** The declarations of the first rule whose selector list contains `selector`. */
function ruleBody(css, selector) {
  // Comments are stripped first: a rule preceded by one would otherwise carry
  // the comment text into its selector list and never match.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selectors, body] of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const names = selectors.split(",").map((name) => name.trim());
    if (names.includes(selector)) return body;
  }
  return null;
}

test("the drawer's scroll region cannot scroll sideways", () => {
  const body = ruleBody(overlays, ".cart-drawer-scroll");
  assert.ok(body, ".cart-drawer-scroll has no rule");
  assert.match(
    body,
    /overflow-x\s*:\s*hidden/,
    "without this a wide child gives the whole drawer a horizontal scrollbar",
  );
});

test("grids holding cart lines pin their column to the panel width", () => {
  for (const selector of [".cart-drawer-scroll", ".cart-drawer-items"]) {
    const body = ruleBody(overlays, selector);
    assert.ok(body, `${selector} has no rule`);
    const isFlex = /display\s*:\s*flex/.test(body);
    const pinned = /grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)/.test(body);
    assert.ok(
      isFlex || pinned,
      `${selector} is a grid with an auto column — the suggestions rail will stretch it to max-content`,
    );
  }
});

test("the remove button is not a grid column of the line item", () => {
  const body = ruleBody(overlays, ".cart-line-item");
  assert.ok(body, ".cart-line-item has no rule");
  const columns = (body.match(/grid-template-columns\s*:([^;]+)/)?.[1] ?? "").trim();
  assert.match(
    columns,
    /^\d+px\s+minmax\(\s*0\s*,\s*1fr\s*\)$/,
    "a third column for the remove button costs the name and price ~40px on a phone",
  );
});

test("milestone rewards do not stack, and free shipping is independent", () => {
  const milestones = [
    { threshold: "20", reward_type: "free_shipping", discount_value: "0" },
    { threshold: "25", reward_type: "discount_percent", discount_value: "10" },
    { threshold: "30", reward_type: "discount_percent", discount_value: "15" },
  ];

  assert.deepEqual(milestoneReward(milestones, 10), {
    discountPct: 0,
    discount: 0,
    freeShipping: false,
  });
  assert.deepEqual(milestoneReward(milestones, 20), {
    discountPct: 0,
    discount: 0,
    freeShipping: true,
  });
  // 25 and 30 both reached: the larger percentage wins, they are not summed.
  const both = milestoneReward(milestones, 64.5);
  assert.equal(both.discountPct, 15);
  assert.equal(both.freeShipping, true);
  assert.equal(both.discount, 9.68, "rounded to two decimals half-up, as the server quantises");
});

test("an empty or unpriced basket claims no reward", () => {
  assert.deepEqual(milestoneReward([], 100), {
    discountPct: 0,
    discount: 0,
    freeShipping: false,
  });
  assert.deepEqual(milestoneReward(undefined, 100), {
    discountPct: 0,
    discount: 0,
    freeShipping: false,
  });
});

test("the cart's saving is the checkout's: compare-at prices plus the reward", () => {
  const items = [{ pricing: { amount: 23, compare_amount: 41 }, quantity: 2 }];
  // 2 x (41 - 23) = 36 of compare-at saving, plus the 15% cart reward on 64.5.
  assert.equal(cartSavings(items, { discountAmount: 9.68 }), 45.68);
});

test("the drawer feeds the milestone discount into the same savings helper", () => {
  assert.match(
    drawer,
    /cartSavings\(cartItems,\s*\{\s*discountAmount:\s*reward\.discount/,
    "the drawer is back to quoting product savings only",
  );
});
