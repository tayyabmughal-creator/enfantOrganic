import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildStorePath,
  isRtl,
  normalizeLocale,
  normalizeRegion,
  parseLocaleRegion,
  replaceLocaleInPath,
  replaceRegionInPath,
} from "../lib/storefront-core/routing.js";
import { resolveLegacyShopifyPath } from "../lib/legacyRedirects.js";
import { buildOptimizedSrc, isOptimizable, resolveImageSrc } from "../lib/imageOptimizer.js";
import {
  isBrowserUnreachableApiBase,
  safeRedirectUrl,
  shouldPreferSameOriginApiBase,
} from "../lib/config.js";
import {
  buildPageViewTrackingKey,
  shouldTrackStorefrontPageView,
} from "../lib/eventTracking.js";

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

test("buildStorePath puts locale and region in one path segment", () => {
  assert.equal(buildStorePath("ar", "/checkout", "ae"), "/ar-ae/checkout");
  assert.equal(buildStorePath("en", "", "om"), "/en-om");
  assert.equal(buildStorePath("en", "/", "sa"), "/en-sa");
  // Region must not leak back into the query — that would give identical content
  // two addresses and split the canonical signal.
  assert.ok(!buildStorePath("ar", "/checkout", "ae").includes("region="));
});

test("normalizeLocale reads the combined segment", () => {
  assert.equal(normalizeLocale("ar-sa"), "ar");
  assert.equal(normalizeLocale("en-ae"), "en");
  assert.equal(normalizeLocale("nonsense"), "en");
});

test("normalizeRegion reads the combined segment", () => {
  assert.equal(normalizeRegion("ar-sa"), "sa");
  assert.equal(normalizeRegion("ae"), "ae");
});

test("parseLocaleRegion distinguishes canonical from legacy segments", () => {
  assert.deepEqual(parseLocaleRegion("en-ae"), { locale: "en", region: "ae", canonical: true });
  // Legacy bare locale still parses so middleware can 301 it, but is not canonical.
  assert.equal(parseLocaleRegion("en").canonical, false);
  assert.equal(parseLocaleRegion("collections"), null);
  assert.equal(parseLocaleRegion("en-us"), null);
});

test("replaceLocaleInPath keeps the region and vice versa", () => {
  assert.equal(replaceLocaleInPath("/en-ae/product/x", "ar"), "/ar-ae/product/x");
  assert.equal(replaceRegionInPath("/en-ae/product/x", "sa"), "/en-sa/product/x");
  assert.equal(replaceLocaleInPath("/en-om", "ar"), "/ar-om");
});

test("legacy Shopify paths map onto current URLs", () => {
  assert.equal(
    resolveLegacyShopifyPath("/en/products/baby-lotion", "ae"),
    "/en-ae/product/baby-lotion",
  );
  assert.equal(resolveLegacyShopifyPath("/products/baby-lotion", "om"), "/en-om/product/baby-lotion");
  assert.equal(resolveLegacyShopifyPath("/en/pages/about-us", "om"), "/en-om/about-us");
  assert.equal(resolveLegacyShopifyPath("/collections/all", "sa"), "/en-sa/collections");
  assert.equal(resolveLegacyShopifyPath("/ar/collections/wipes", "om"), "/ar-om/collections?category=wipes");
  // Current URLs must not be caught by the legacy rules.
  assert.equal(resolveLegacyShopifyPath("/en-om/product/baby-lotion", "om"), null);
  assert.equal(resolveLegacyShopifyPath("/en-om/collections", "om"), null);
});

test("loopback and internal API hosts are not browser reachable", () => {
  assert.equal(isBrowserUnreachableApiBase("http://127.0.0.1:8000/api"), true);
  assert.equal(isBrowserUnreachableApiBase("http://localhost:8000/api"), true);
  assert.equal(isBrowserUnreachableApiBase("http://backend:8000/api"), true);
  assert.equal(isBrowserUnreachableApiBase("https://shop.example.com/api"), false);
});

test("local browser origins keep explicit local API base", () => {
  assert.equal(
    shouldPreferSameOriginApiBase("http://127.0.0.1:8000/api", "127.0.0.1"),
    false,
  );
  assert.equal(
    shouldPreferSameOriginApiBase("http://localhost:8000/api", "localhost"),
    false,
  );
  assert.equal(
    shouldPreferSameOriginApiBase("http://127.0.0.1:8000/api", "shop.example.com"),
    true,
  );
});

test("safeRedirectUrl allows the Oman Paymob iframe origin", () => {
  // Regression guard: the backend's PAYMOB_BASE_URL is https://oman.paymob.com,
  // so the iframe redirect MUST be accepted or online checkout breaks.
  const omanIframe =
    "https://oman.paymob.com/api/acceptance/iframes/60088?payment_token=abc123";
  assert.equal(safeRedirectUrl(omanIframe), omanIframe);
  // Egypt host stays allowed for other deployments.
  assert.equal(
    safeRedirectUrl("https://accept.paymob.com/api/acceptance/iframes/1?payment_token=x"),
    "https://accept.paymob.com/api/acceptance/iframes/1?payment_token=x",
  );
  // A non-allowlisted origin is still rejected.
  assert.equal(safeRedirectUrl("https://evil.example.com/steal"), "");
});

test("page view tracking only runs on localized storefront routes", () => {
  // Current URL shape — these are what every real pageview looks like now.
  assert.equal(shouldTrackStorefrontPageView("/en-om"), true);
  assert.equal(shouldTrackStorefrontPageView("/ar-sa/product/baby-oil"), true);
  assert.equal(shouldTrackStorefrontPageView("/en-ae/collections"), true);
  // Legacy shape still matches so redirected traffic is not dropped.
  assert.equal(shouldTrackStorefrontPageView("/en"), true);
  assert.equal(shouldTrackStorefrontPageView("/ar/products/baby-oil"), true);
  assert.equal(shouldTrackStorefrontPageView("/admin"), false);
  assert.equal(shouldTrackStorefrontPageView("/offline"), false);
});

test("page view dedupe key ignores region-only query churn", () => {
  assert.equal(
    buildPageViewTrackingKey("/en/products", "region=om&utm_source=instagram"),
    "/en/products?utm_source=instagram",
  );
  assert.equal(
    buildPageViewTrackingKey("/en/products", new URLSearchParams("utm_source=instagram&region=ae")),
    "/en/products?utm_source=instagram",
  );
});

test("generic brand/category labels are not shown in product detail or product cards", () => {
  const productDetail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const productCard = readFileSync(new URL("../components/cards/ProductCard.jsx", import.meta.url), "utf8");
  const quickView = readFileSync(new URL("../components/store/product/QuickViewModal.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(productDetail, /product\.badge\s*\|\|\s*product\.category\?\.name/);
  assert.doesNotMatch(productDetail, /summary-badge\}\>\{product\.badge \|\| product\.category\?\.name\}/);
  assert.doesNotMatch(productCard, /product\.badge\s*\|\|\s*product\.category\?\.name/);
  assert.doesNotMatch(quickView, /quickViewProduct\.badge \|\| quickViewProduct\.vendor/);
});

test("product gallery uses a compact preview and line indicators instead of thumbnail boxes", () => {
  const productDetail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const premiumStyles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");

  assert.match(productDetail, /className="gallery-next-preview"/);
  assert.match(productDetail, /className=\{`gallery-image-indicator/);
  assert.doesNotMatch(productDetail, /className=\{`thumb-button/);
  assert.match(premiumStyles, /\.main-product-image-shell\s*\{[^}]*500px/);
  assert.match(premiumStyles, /\.gallery-image-indicator\s*\{[^}]*height:\s*3px/);
});

test("the global video is admin-managed, dismissible, and stacks above WhatsApp", () => {
  const player = readFileSync(new URL("../components/layout/FloatingPromoVideo.jsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/layout/StorefrontShell.jsx", import.meta.url), "utf8");
  const overlays = readFileSync(new URL("../app/styles/overlays.css", import.meta.url), "utf8");
  const checkoutStyles = readFileSync(new URL("../app/styles/checkout-order.css", import.meta.url), "utf8");
  const adminPanel = readFileSync(new URL("../components/admin/AdminPanelClient.jsx", import.meta.url), "utf8");
  const adminForm = readFileSync(new URL("../components/admin/CrudViews.jsx", import.meta.url), "utf8");

  assert.match(shell, /<FloatingPromoVideo videoUrl=\{navigation\?\.settings\?\.floating_video_url\}\s*\/>/);
  assert.match(player, /if \(!videoUrl \|\| !visible\) return null/);
  assert.doesNotMatch(player, /reference-baby-skincare|Sample footage/);
  assert.match(player, /sessionStorage\.setItem\(DISMISS_KEY, "1"\)/);
  assert.match(player, /autoPlay[\s\S]*muted[\s\S]*playsInline/);
  assert.match(player, /aria-label="Close video"/);
  assert.match(adminPanel, /\["floating_video_url","Floating site video \(MP4\/WebM\)","video-upload"/);
  assert.match(adminForm, /accept="video\/mp4,\.mp4,video\/webm,\.webm"/);
  assert.match(adminForm, /objectPreviewUrl \|\| currentVideoUrl/);
  assert.match(adminForm, /Remove current video/);
  assert.match(overlays, /\.floating-promo-video\s*\{[^}]*z-index:\s*39/);
  assert.match(overlays, /\.floating-promo-video\s*\{[^}]*bottom:\s*calc\(148px/);
  assert.match(overlays, /\[dir="rtl"\] \.floating-promo-video/);
  assert.match(checkoutStyles, /body:has\(\.checkout-mobile-cta\) \.floating-promo-video/);
});

test("the product video panel is admin-configured, optional, and limited to three clips", () => {
  const productDetail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const productPage = readFileSync(new URL("../app/[locale]/product/[slug]/page.jsx", import.meta.url), "utf8");
  const adminPanel = readFileSync(new URL("../components/admin/AdminPanelClient.jsx", import.meta.url), "utf8");
  const adminForm = readFileSync(new URL("../components/admin/CrudViews.jsx", import.meta.url), "utf8");
  const premiumStyles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");

  assert.match(productPage, /productVideoPanel=\{navigation\?\.settings\?\.product_video_panel\}/);
  assert.match(productDetail, /productVideoPanel\?\.enabled && productVideoUrls\.length/);
  assert.match(productDetail, /\.slice\(0, 3\)/);
  assert.match(productDetail, /className="product-video-panel"/);
  assert.match(adminPanel, /product_video_panel_enabled/);
  assert.match(adminPanel, /product_video_3_url_file/);
  assert.match(adminPanel, /\["product_video_3_url","Product video 3 direct link \(MP4\/WebM\)","url"/);
  assert.match(adminForm, /const currentVideoUrl = linkedUrlField\s*\?\s*existingPreviewUrl/);
  assert.match(premiumStyles, /\.product-video-panel\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
});

test("no page compares the raw locale param against a normalized locale", async () => {
  // The route segment is now "en-om", while normalizeLocale() returns "en", so any
  // surviving `localeParam !== <normalized>` guard calls notFound() on every request.
  // Two of these were missed during the URL-scheme migration and took checkout and
  // track-order down in production, so the pattern is now banned outright — the
  // [locale] layout is what validates the segment.
  const { execFileSync } = await import("node:child_process");
  let hits = "";
  try {
    hits = execFileSync("grep", ["-rn", "localeParam !==", "app"], { encoding: "utf8" });
  } catch {
    hits = ""; // grep exits 1 when there are no matches
  }
  assert.equal(hits.trim(), "", `stale locale guard(s) found:\n${hits}`);
});

test("root-relative media paths are absolutised before the optimizer sees them", () => {
  // Product images arrive absolute from the API but variant images arrive
  // root-relative. /media is served by Django, not Next, so the optimizer cannot
  // resolve a relative path and answers 400 — which rendered variant products
  // with a broken main image.
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const variantPath = "/media/products/gallery/img-44.webp";

  if (base) {
    assert.equal(resolveImageSrc(variantPath), `${base.replace(/\/+$/, "")}${variantPath}`);
    assert.ok(buildOptimizedSrc(variantPath, 828).startsWith("/_next/image?url=http"));
  } else {
    // With no configured origin the path must stay relative so the browser can
    // resolve it as a plain <img> rather than 400 through the optimizer.
    assert.equal(resolveImageSrc(variantPath), variantPath);
    assert.equal(isOptimizable(variantPath), false);
  }

  // Next's own public assets must keep working relative.
  assert.equal(resolveImageSrc("/enfant/enfant-logo.png"), "/enfant/enfant-logo.png");
  assert.equal(isOptimizable("/enfant/enfant-logo.png"), true);
});
