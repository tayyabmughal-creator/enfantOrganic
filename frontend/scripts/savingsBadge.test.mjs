import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The "Save 40%" badge sits inside .product-pricing, and so does the compare
 * price. The compare price is a bare <span> on a product card, so the rule that
 * strikes it through had to be written loosely — and it reached the badge too,
 * which is also a span. The badge came out struck through and greyed, i.e. the
 * one number the shopper should notice read as the cancelled one.
 *
 * These read the stylesheets rather than a browser, so they pin the selectors
 * themselves: a regression here is a one-character edit away.
 */
const home = readFileSync(new URL("../app/styles/home.css", import.meta.url), "utf8");
const premium = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");

/** Every selector that declares a strike-through, across both sheets. */
function strikeThroughSelectors(css) {
  const selectors = [];
  const blocks = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const [, selector, body] of blocks) {
    if (/text-decoration\s*:\s*line-through/.test(body)) {
      selectors.push(selector.trim().replace(/\s+/g, " "));
    }
  }
  return selectors;
}

test("nothing strikes through every span inside .product-pricing", () => {
  for (const css of [home, premium]) {
    for (const selector of strikeThroughSelectors(css)) {
      assert.ok(
        !/\.product-pricing\s+span\s*$/.test(selector),
        `"${selector}" strikes through the savings badge as well as the compare price`,
      );
    }
  }
});

test("the compare price on a product card is still struck through", () => {
  // It has no class of its own, so the loose selector has to survive — only
  // narrowed, never deleted.
  assert.match(home, /\.product-pricing span:not\(\.save-badge\)\s*\{/);
});

test("the savings badge cancels any inherited strike-through", () => {
  const badge = premium.match(/\.save-badge\s*\{([^}]*)\}/);
  assert.ok(badge, ".save-badge rule not found");
  assert.match(badge[1], /text-decoration\s*:\s*none/);
});

test("the savings badge is filled, not the palest thing in the price row", () => {
  const badge = premium.match(/\.save-badge\s*\{([^}]*)\}/)[1];
  assert.match(badge, /color\s*:\s*#fff\b/i, "badge text should be white on a solid fill");
  assert.ok(
    !/background:\s*linear-gradient\(\s*135deg,\s*#fef3e8/.test(badge),
    "badge should not be back on the pale cream gradient",
  );
});
