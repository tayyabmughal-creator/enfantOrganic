import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The category circles came out blurry because the image declared a 120px slot
 * while the CSS laid it out at up to 200px — so the browser was told to fetch a
 * 128w variant and then stretched it, doubly so on a retina screen.
 *
 * `sizes` and `grid-auto-columns` live in different files and nothing links
 * them, so this pins them together: shrink the declared size below the real
 * column width again and the test says so.
 */
const carousel = readFileSync(
  new URL("../components/store/CategoryCarousel.jsx", import.meta.url),
  "utf8",
);
const home = readFileSync(new URL("../app/styles/home.css", import.meta.url), "utf8");

/** The rail's column width: clamp(<min>, <fluid>, <max>). */
function railColumns() {
  const rule = home.match(/\.category-carousel-rail\s*\{[^}]*grid-auto-columns:\s*([^;]+);/);
  assert.ok(rule, "grid-auto-columns not found on .category-carousel-rail");
  const clamp = rule[1].match(/clamp\(\s*(\d+)px\s*,\s*[^,]+,\s*(\d+)px\s*\)/);
  assert.ok(clamp, `expected a clamp() column width, got "${rule[1].trim()}"`);
  return { min: Number(clamp[1]), max: Number(clamp[2]) };
}

function declaredSizes() {
  const match = carousel.match(/sizes=\{?["']([^"']+)["']\}?/);
  assert.ok(match, "CategoryCarousel declares no sizes");
  return match[1];
}

test("the carousel does not declare a single fixed slot width", () => {
  // A bare "120px" is what caused this: one number for a slot that is fluid.
  assert.ok(
    !/^\s*\d+px\s*$/.test(declaredSizes()),
    "sizes must vary with the breakpoint, like the CSS column does",
  );
});

test("the widest declared size matches the widest column the CSS can produce", () => {
  const { max } = railColumns();
  const widths = [...declaredSizes().matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(widths.length, "sizes should name pixel widths");
  assert.ok(
    Math.max(...widths) >= max,
    `sizes tops out at ${Math.max(...widths)}px but the column reaches ${max}px, so the image will be upscaled`,
  );
});

test("the mobile size is not smaller than the mobile column", () => {
  const { min } = railColumns();
  const mobile = declaredSizes().match(/\(max-width:\s*\d+px\)\s*(\d+)px/);
  assert.ok(mobile, "sizes should state a width for the mobile breakpoint");
  assert.ok(
    Number(mobile[1]) >= min,
    `mobile declares ${mobile[1]}px for a ${min}px column`,
  );
});
