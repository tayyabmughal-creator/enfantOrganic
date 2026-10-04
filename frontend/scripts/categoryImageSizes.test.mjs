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

test("above phones the declared size is never smaller than the column the CSS produces", () => {
  // The row spans the screen (container = 100% minus a 80-128px gutter) and is split
  // into --cat-cards equal columns separated by --cat-gap = clamp(16px, 2.4vw, 36px).
  assert.match(home, /--cat-cards:\s*6;/);
  assert.match(home, /grid-auto-columns:\s*calc\(\(100% - \(var\(--cat-cards\) - 1\) \* var\(--cat-gap\)\) \/ var\(--cat-cards\)\)/);
  const cardsAt = (vw) => (vw >= 1600 ? 7 : vw >= 1100 ? 6 : vw >= 820 ? 5 : 4);
  const sizes = declaredSizes();
  const vwFor = (vw) => {
    for (const m of sizes.matchAll(/\(max-width:\s*(\d+)px\)\s*(\d+)vw/g)) {
      if (vw <= Number(m[1])) return Number(m[2]);
    }
    return Number(sizes.match(/(\d+)vw\s*$/)[1]);
  };
  for (let vw = 660; vw <= 2560; vw += 20) {
    const gutter = vw < 1100 ? 48 : Math.min(128, Math.max(80, vw * 0.05));
    const gap = Math.min(36, Math.max(16, vw * 0.024));
    const n = cardsAt(vw);
    const column = (vw - gutter - (n - 1) * gap) / n;
    assert.ok((vwFor(vw) / 100) * vw >= column - 1, `at ${vw}px the column is ${column.toFixed(0)}px but sizes declares ${((vwFor(vw) / 100) * vw).toFixed(0)}px`);
  }
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
