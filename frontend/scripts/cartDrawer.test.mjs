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
const provider = readFileSync(
  new URL("../components/store/cart/StoreProvider.jsx", import.meta.url),
  "utf8",
);
const home = readFileSync(new URL("../app/styles/home.css", import.meta.url), "utf8");
const categoryCarousel = readFileSync(
  new URL("../components/store/CategoryCarousel.jsx", import.meta.url),
  "utf8",
);

/** Every rule whose selector list contains `selector`, media queries included. */
function allRuleBodies(css, selector) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const bodies = [];
  for (const [, selectors, body] of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const names = selectors.split(",").map((name) => name.trim());
    if (names.includes(selector)) bodies.push(body);
  }
  return bodies;
}

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
    /cartSavings\(pricedItems,\s*\{\s*discountAmount:\s*reward\.discount/,
    "the drawer is back to quoting product savings only",
  );
});

/**
 * A line the shopper added in one store and carried into another keeps that
 * store's currency until it is repriced. When a request for one product got
 * dropped, the drawer showed OMR on one line and AED on the next and totalled
 * them together — "OMR 119.220" for a basket that was mostly dirhams.
 */
test("the subtotal only counts lines priced for the active store", () => {
  assert.match(
    provider,
    /const isPricedHere\s*=\s*\(item\)\s*=>\s*\n?\s*!activeRegion \|\| item\.pricing\?\.region_code === activeRegion/,
    "the subtotal no longer filters by the region the cart is priced for",
  );
  assert.match(
    provider,
    /\.filter\(isPricedHere\)\s*\n?\s*\.reduce\(/,
    "the subtotal sums every line again, mixing currencies",
  );
});

test("a dropped pricing request is retried before the line is left behind", () => {
  assert.match(
    provider,
    /const failed = uniqueSlugs\.filter/,
    "the single retry that recovers a transient failure is gone",
  );
});

test("the drawer flags lines it could not price for this store", () => {
  assert.match(drawer, /cart-line-item\$\{strandedHere \? " is-unavailable" : ""\}/);
  assert.match(drawer, /outOfRegionItems\.length/);
});

/**
 * What the cart shows about money: the figure being weighed up and one line
 * naming the saving. Subtotal, shipping, VAT and the reward breakdown belong to
 * the order summary; repeated here they were deep enough to push the basket off
 * a phone screen. Per-line "Save X" pills went the same way — the saving is
 * stated once, at the bottom, for the whole order.
 */
test("the cart states the total and the saving, not a summary", () => {
  assert.match(drawer, /className="cart-total-row"/);
  assert.match(drawer, /className="cart-saved-line"/);
  for (const gone of ["cart-summary-total", "cart-summary-pending", "cart-line-save"]) {
    assert.doesNotMatch(drawer, new RegExp(gone), `${gone} is back in the drawer`);
  }
});

test("suggestions are pinned in the footer, one slide at a time", () => {
  const footer = drawer.slice(drawer.indexOf('className="cart-drawer-footer"'));
  assert.match(footer, /<CartRecommendations/, "suggestions are back below the basket");

  const rail = ruleBody(overlays, ".cart-recommendations-rail");
  assert.ok(rail, ".cart-recommendations-rail has no rule");
  assert.match(rail, /grid-auto-columns:\s*100%/, "more than one suggestion per view");
  assert.match(rail, /scroll-snap-type:\s*x mandatory/);
});

/**
 * Chrome drops smooth programmatic scrolls on a scroll-snap rail, in the call
 * and through CSS alike, and the rail simply does not move — which is why the
 * category arrows never worked either.
 */
test("snap rails are scrolled by assignment, never smoothly", () => {
  for (const source of [drawer, categoryCarousel]) {
    // The comments name scrollTo({behavior:"smooth"}) as the thing not to do,
    // so this looks for the calls themselves rather than the words.
    assert.doesNotMatch(source, /rail\.scroll(To|By)\(/);
  }
  for (const [css, selector] of [
    [overlays, ".cart-recommendations-rail"],
    [home, ".category-carousel-rail"],
  ]) {
    const body = ruleBody(css, selector);
    assert.ok(body, `${selector} has no rule`);
    assert.match(body, /scroll-snap-type/, `${selector} is no longer a snap rail`);
    assert.doesNotMatch(
      body,
      /scroll-behavior:\s*smooth/,
      `${selector} smooth-scrolls, which cancels the scroll on a snap rail`,
    );
  }
});

test("a tapped dot lights up without waiting for the scroll to settle", () => {
  assert.match(
    drawer,
    /glideToSlide\(railRef\.current, index, glideRef, \{ instant: true \}\);\s*\n(\s*\/\/[^\n]*\n)*\s*setSlide\(index\);/,
  );
  assert.match(categoryCarousel, /rail\.scrollLeft = \(isRtl \? -1 : 1\) \* index \* rail\.clientWidth;\s*\n(\s*\/\/[^\n]*\n)*\s*setPage\(index\);/);
});

/**
 * The suggestions rotate on their own every 7 seconds. Sitting above the
 * checkout button, where the shopper is reading totals rather than looking for
 * something to swipe, the rail otherwise only ever showed its first card.
 */
test("the suggestions rail advances on a 7s timer and wraps", () => {
  assert.match(drawer, /const AUTOPLAY_MS = 7000;/, "the rotation is no longer 7 seconds");
  assert.match(
    drawer,
    /setInterval\(\(\) => \{[\s\S]*?\}, AUTOPLAY_MS\)/,
    "nothing drives the rotation",
  );
  assert.match(
    drawer,
    /const next = \(current \+ 1\) % products\.length;/,
    "the rail stops at the last suggestion instead of wrapping",
  );
});

test("the rotation yields to the shopper's own finger", () => {
  assert.match(
    drawer,
    /if \(!drawerOpen \|\| held \|\| products\.length < 2 \|\| !rail\) return undefined;/,
    "the timer runs while a finger is on the rail, or while the drawer is shut",
  );
  assert.match(drawer, /onPointerDown=\{\(\) => setHeld\(true\)\}/);
  for (const release of ["onPointerUp", "onPointerCancel", "onPointerLeave"]) {
    assert.match(drawer, new RegExp(`${release}=\\{\\(\\) => setHeld\\(false\\)\\}`),
      `${release} does not release the hold — the rotation would never resume`);
  }
  assert.match(
    drawer,
    /\}, \[drawerOpen, held, nudge, products\.length\]\);/,
    "a tapped dot no longer restarts the timer, so the chosen card can slide straight off",
  );
});

/**
 * The glide eases scrollLeft by hand. scrollTo({behavior:"smooth"}) is dropped
 * on a snap rail (see the test above), so the settle timer is what guarantees
 * the rail lands on the slide even where requestAnimationFrame never runs.
 */
test("the glide lands on the slide even without animation frames", () => {
  assert.match(drawer, /settle: setTimeout\(finish, GLIDE_MS \+ \d+\)/);
  assert.match(
    drawer,
    /const finish = \(\) => \{\s*\n\s*rail\.scrollLeft = to;/,
    "the settle step no longer pins the rail to the exact slide",
  );
  assert.match(
    drawer,
    /rail\.style\.scrollSnapType = "none";/,
    "snap is left on during the glide, where it fights the easing",
  );
  assert.match(
    drawer,
    /rail\.style\.scrollSnapType = "";/,
    "snap is never restored, so a finger swipe stops snapping afterwards",
  );
});

test("repricing is not keyed on the cart array itself", () => {
  // refreshCartPricing replaces the array, so an effect depending on it would
  // reprice, re-render, and reprice again without end.
  assert.doesNotMatch(
    drawer,
    /\}, \[cartItems, locale, region, refreshCartPricing\]\)/,
    "the reprice effect depends on the cart array — that is an infinite loop",
  );
  assert.match(drawer, /\}, \[cartItems\.length, drawerOpen, locale, region, refreshCartPricing\]\)/);
});

/**
 * The line item's tile is square everywhere, so a square pack shot fills it.
 *
 * The base rule was squared off, but the two phone overrides kept an explicit
 * portrait height — and an explicit height beats aspect-ratio, so on a phone the
 * shot was still fitted to the narrower side and sat small in a box of empty
 * space. A phone is the only place those overrides apply, and the only place
 * anyone was looking.
 */
test("the cart line's image tile is square at every width", () => {
  const bodies = allRuleBodies(overlays, ".cart-line-media");
  assert.ok(bodies.length >= 2, "the phone overrides for .cart-line-media are gone");

  assert.match(bodies[0], /aspect-ratio:\s*1/, "the base tile is no longer square");
  for (const body of bodies.slice(1)) {
    assert.doesNotMatch(
      body,
      /(^|;)\s*height:\s*\d/,
      "an explicit height overrides aspect-ratio and makes the tile portrait again",
    );
  }
});

test("the line image is contained, never cropped", () => {
  const body = ruleBody(overlays, ".cart-line-item img");
  assert.ok(body, ".cart-line-item img has no rule");
  assert.match(body, /object-fit:\s*contain/, "cover crops the sides off a wide pack shot");
});
