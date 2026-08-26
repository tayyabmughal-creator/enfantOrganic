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

/** The phone override: four cards per screen, `calc((100% - <gaps>) / 4)`. */
function mobileColumn() {
  const rules = [...home.matchAll(/\.category-carousel-rail\s*\{([^}]*)\}/g)];
  const override = rules
    .map((rule) => rule[1].match(/grid-auto-columns:\s*calc\(\(100%\s*-\s*(\d+)px\)\s*\/\s*(\d+)\)/))
    .find(Boolean);
  assert.ok(override, "the mobile rail should size its columns from the rail width");
  return { gaps: Number(override[1]), perView: Number(override[2]) };
}

test("the mobile size is not smaller than the mobile column", () => {
  const { gaps, perView } = mobileColumn();
  const declared = declaredSizes().match(/\(max-width:\s*(\d+)px\)\s*(\d+)vw/);
  assert.ok(declared, "sizes should state a viewport-relative width for the mobile breakpoint");
  const breakpoint = Number(declared[1]);
  const vwShare = Number(declared[2]) / 100;

  // The rail is narrower than the viewport (the container pads it), so 100vw is
  // the widest the column can ever be — check the whole phone range, since a vw
  // and a calc() cross over rather than staying in a fixed ratio.
  for (let viewport = 320; viewport <= breakpoint; viewport += 20) {
    const column = (viewport - gaps) / perView;
    assert.ok(
      vwShare * viewport >= column,
      `at ${viewport}px wide the column is ${column.toFixed(1)}px but sizes declares ${(vwShare * viewport).toFixed(1)}px`,
    );
  }
});
