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

test("product gallery uses a compact preview and line indicators on mobile, vertical thumb strip on desktop", () => {
  const productDetail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const premiumStyles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");
  const catalogStyles = readFileSync(new URL("../app/styles/catalog-product.css", import.meta.url), "utf8");

  // Mobile: dot indicators and corner preview still render in JSX
  assert.match(productDetail, /className="gallery-next-preview"/);
  assert.match(productDetail, /className=\{`gallery-image-indicator/);
  // Desktop: vertical thumb strip is rendered; hidden on mobile via CSS
  assert.match(productDetail, /className="thumb-list"/);
  assert.match(productDetail, /className=\{`thumb-button/);
  // Desktop: indicators and preview hidden via CSS breakpoint
  assert.match(premiumStyles, /\.gallery-image-indicators\s*\{[\s\S]*?display:\s*none/);
  assert.match(premiumStyles, /\.gallery-next-preview\s*\{[\s\S]*?display:\s*none/);
  // Desktop: gallery grid puts thumb strip on the left
  assert.match(catalogStyles, /\.gallery-layout\s*\{[\s\S]*?grid-template-columns:\s*84px 1fr/);
  assert.match(premiumStyles, /\.main-product-image-shell\s*\{[^}]*500px/);
  assert.match(premiumStyles, /\.gallery-image-indicator\s*\{[^}]*height:\s*3px/);
});

test("on phones the gallery starts under the header and peeks the next photo", () => {
  const productDetail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const premiumStyles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");
  const phone = premiumStyles.slice(premiumStyles.lastIndexOf("@media (max-width: 640px)"));

  assert.match(productDetail, /slideImages\.map\(/);
  assert.match(phone, /\.product-breadcrumbs\s*\{\s*display:\s*none/);
  assert.match(phone, /\.gallery-track\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
  assert.match(phone, /flex:\s*0 0 88%/);
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

test("product pages show percentage savings and prominent Add to Cart + Buy Now buttons", () => {
  const productDetail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const premiumStyles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");
  const catalogStyles = readFileSync(new URL("../app/styles/catalog-product.css", import.meta.url), "utf8");

  // Discount badge uses discountPercent variable
  assert.match(productDetail, /\$\{discountPercent\}% off/);
  // Sticky bar has price-main wrapper with discount badge
  assert.match(productDetail, /mobile-sticky-price-main[\s\S]*?product-discount-badge/);
  // Add to Cart label shown in button
  assert.match(productDetail, /<span>\{t\.addToCart\}<\/span>/);
  // Buy Now button with buyCurrentProduct handler
  assert.match(productDetail, /className="product-buy-action" onClick=\{.*buyCurrentProduct/);
  // Mobile sticky has actions wrapper
  assert.match(productDetail, /className="mobile-sticky-actions"/);
  // Desktop CTA: 2-column grid (1fr 1fr)
  assert.match(premiumStyles, /\.product-cta-stack\s*\{[\s\S]*?grid-template-columns:\s*1fr 1fr/);
  // Quantity block aligns to start (in catalog-product.css desktop breakpoint)
  assert.match(catalogStyles, /\.product-quantity-block\s*\{[\s\S]*?align-self:\s*flex-start/);
});

test("product option labels sit close to their size values", () => {
  const premiumStyles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");

  // flex column with tight gap overrides the parent grid
  assert.match(premiumStyles, /\.product-option-block\s*\{[\s\S]*?gap:\s*4px/);
  assert.match(premiumStyles, /\.product-option-block h4\s*\{[\s\S]*?margin:\s*0/);
});

test("product detail accordion has plus icons and description, how it works, ingredients, shipping sections", () => {
  const productDetail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const premiumStyles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");

  assert.match(productDetail, /function AccordionPlus\(\)/);
  assert.doesNotMatch(productDetail, /detail-accordion-chevron/);
  assert.match(productDetail, /product\.usage_instructions/);
  assert.match(productDetail, /"How it works"/);
  assert.match(productDetail, /product\.ingredients/);
  assert.match(productDetail, /"Shipping & Delivery"/);
  assert.match(productDetail, /accordionSections\.map\(/);
  assert.match(premiumStyles, /\.detail-accordion-item\.is-open \.detail-accordion-icon-v\s*\{[^}]*scaleY\(0\)/);
});

test("product page sections (features, how it works, comparison) are wired end to end", () => {
  const productDetail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const sections = readFileSync(new URL("../components/store/product/ProductPageSections.jsx", import.meta.url), "utf8");
  const productPage = readFileSync(new URL("../app/[locale]/product/[slug]/page.jsx", import.meta.url), "utf8");
  const adminPanel = readFileSync(new URL("../components/admin/AdminPanelClient.jsx", import.meta.url), "utf8");
  const adminForm = readFileSync(new URL("../components/admin/CrudViews.jsx", import.meta.url), "utf8");
  const premiumStyles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");

  assert.match(productPage, /socialProofItems=\{navigation\?\.settings\?\.social_proof_items\}/);
  assert.match(productDetail, /product\.page_sections\?\.features/);
  assert.match(productDetail, /<ProductHowItWorksSection[\s\S]*?proofItems=\{socialProofItems\}/);
  assert.match(productDetail, /<ProductComparisonSection/);
  assert.match(sections, /export function ProductFeaturesSection/);
  assert.match(sections, /product-proof-track/);
  assert.match(sections, /\[0, 1\]\.map/);
  assert.match(adminPanel, /\["page_sections","Product page sections","page-sections"\]/);
  assert.match(adminPanel, /\["social_proof_items"/);
  assert.match(adminPanel, /\["fbt_slugs"/);
  assert.match(adminForm, /type === "page-sections"/);
  assert.match(premiumStyles, /\.product-proof-track\s*\{[^}]*animation:\s*product-proof-scroll/);
  assert.match(premiumStyles, /\[dir="rtl"\] \.product-proof-track\s*\{[^}]*product-proof-scroll-rtl/);
  assert.match(premiumStyles, /\.product-hiw-rail\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
});

test("reviews: showcase strip, full review section, all-reviews page and urgency banner", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const detail = read("../components/store/product/ProductDetailClient.jsx");
  const reviews = read("../components/store/product/ProductReviewsSection.jsx");
  const showcase = read("../components/store/product/ProductReviewShowcase.jsx");
  const reviewsPage = read("../app/[locale]/reviews/page.jsx");
  const productPage = read("../app/[locale]/product/[slug]/page.jsx");
  const admin = read("../components/admin/AdminPanelClient.jsx");
  const styles = read("../app/styles/product-premium.css");

  assert.match(productPage, /reviewsShowcase=\{navigation\?\.settings\?\.reviews_showcase\}/);
  assert.match(detail, /<ProductReviewShowcase[\s\S]*?readMoreHref=\{buildStorePath\(locale, "\/reviews", region\)\}/);
  assert.match(detail, /<ProductReviewsSection/);
  assert.doesNotMatch(detail, /openAccordion === "reviews"/);
  assert.match(reviews, /Would recommend|would recommend this product/);
  assert.match(reviews, /Read All Reviews/);
  assert.match(reviews, /NEXT_BATCH = 20/);
  assert.match(reviews, /reviews-photo-rail/);
  assert.match(showcase, /Read more reviews/);
  assert.match(reviewsPage, /getAllReviews/);
  assert.match(admin, /"reviews-showcase"/);
  assert.match(styles, /\[dir="rtl"\] \.review-marquee-track\s*\{[^}]*review-marquee-left-rtl/);
  assert.match(styles, /\.review-marquee\.is-reverse \.review-marquee-track\s*\{[^}]*review-marquee-right/);
  // urgency banner sits right after the price, before the short copy
  assert.match(detail, /product-pricing large product-pricing--premium[\s\S]*?<UrgencyStrip[\s\S]*?product-short-copy/);
  assert.match(styles, /\.product-urgency-strip\s*\{[^}]*background:\s*linear-gradient\(90deg,\s*#161a12/);
});

test("checkout: only a discount code (no gift card), field above the totals, and Add discount at the end", () => {
  const checkout = readFileSync(new URL("../components/store/checkout/CheckoutClient.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/styles/checkout-order.css", import.meta.url), "utf8");

  assert.doesNotMatch(checkout, /checkout-discount-switcher|checkout-discount-tab|gift_card_code_aside/);
  // the discount field sits between the item list and the subtotal row
  assert.match(checkout, /className="summary-lines"[\s\S]*?checkout-aside-coupon--top[\s\S]*?<span>\{t\.subtotal\}<\/span>/);
  // Enter inside the form must apply the code, not place the order
  assert.match(checkout, /const submitCouponOnEnter[\s\S]*?event\.preventDefault\(\);[\s\S]*?validateCouponCode\(\)/);
  assert.match(checkout, /className="checkout-end-summary"/);
  assert.match(checkout, /className="checkout-add-discount"/);
  assert.match(checkout, /id="coupon_code_end"/);
  assert.match(checkout, /cartItemCount/);
  // the end-of-form block is a phone-only addition
  assert.match(styles, /\.checkout-end-summary\s*\{\s*display:\s*none/);
  assert.match(styles, /@media \(max-width: 860px\)\s*\{\s*\.checkout-end-summary\s*\{\s*display:\s*grid/);
});

test("write-a-review accepts photos and the reviews section has filters, sort and photo cards", () => {
  const detail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  const section = readFileSync(new URL("../components/store/product/ProductReviewsSection.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/styles/product-premium.css", import.meta.url), "utf8");

  assert.match(detail, /REVIEW_MAX_PHOTOS = 4/);
  assert.match(detail, /body\.append\("images", photo\.file\)/);
  assert.match(detail, /className="review-photo-add"/);
  // JSON path is kept when no photo is chosen
  assert.match(detail, /"Content-Type": "application\/json"/);
  assert.match(section, /reviews-filter-btn/);
  assert.match(section, /className="reviews-sort"/);
  assert.match(section, /With photos only/);
  assert.match(section, /ReviewPhotoLightbox/);
  // phone order: score, bars, recommend line, then photos (recommend sits above the photos)
  assert.match(styles, /grid-template-areas:\s*"score"\s*"bars"\s*"recommend"\s*"gallery"/);
  assert.match(styles, /\.reviews-photo-tile\s*\{[^}]*flex:\s*0 0 132px/);
  assert.match(styles, /\.review-lightbox-dialog\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.6fr\)/);
  const lightbox = readFileSync(new URL("../components/store/product/ReviewPhotoLightbox.jsx", import.meta.url), "utf8");
  assert.match(lightbox, /review-lightbox-counter/);
  assert.match(lightbox, /REVIEWING/);
  assert.match(lightbox, /Verified Buyer/);
  assert.match(detail, /productName=\{product\.name\}/);
  assert.match(section, /Read more/);
  assert.match(styles, /\.review-card\s*\{[^}]*grid-template-columns:\s*44px/);
});

test("product page: features and how-it-works use the full width like the reference", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const sections = read("../components/store/product/ProductPageSections.jsx");
  const rail = read("../components/store/product/ProductHowItWorksRail.jsx");
  const styles = read("../app/styles/product-premium.css");

  assert.match(sections, /export function MarkedTitle/);
  assert.match(sections, /product-features-title/);
  assert.match(sections, /<ProductHowItWorksRail/);
  assert.match(rail, /product-hiw-num/);
  assert.match(rail, /product-hiw-caption/);
  assert.match(rail, /scrollBy/);
  // two columns on desktop: title + features on one side, the picture on the other
  assert.match(styles, /\.product-features-section\.has-media\s*\{[^}]*grid-template-areas:\s*"title media"\s*"grid media"/);
  // no narrow centred column any more
  assert.doesNotMatch(styles, /\.product-hiw-frame\s*\{[^}]*max-width:\s*720px/);
  assert.doesNotMatch(styles, /\.product-features-grid\s*\{[^}]*max-width:\s*720px/);
  // 3.3 cards across on desktop, so the next card peeks in
  assert.match(styles, /\.product-hiw-slide\s*\{[^}]*flex-basis:\s*calc\(\(100% - 28px - 40px\) \/ 3\.3\)/);
});

test("product page: stat band ticker, roomy section gaps and a comparison table with lines in every column", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const sections = read("../components/store/product/ProductPageSections.jsx");
  const styles = read("../app/styles/product-premium.css");

  assert.match(sections, /<strong>\{item\.value \|\| item\.text\}<\/strong>/);
  assert.match(sections, /product-compare-heading/);
  assert.match(styles, /\.product-proof-item\s*\{[^}]*flex-direction:\s*column/);
  assert.match(styles, /\.product-proof-item span\s*\{[^}]*text-transform:\s*uppercase/);
  assert.match(styles, /\.product-extra-sections\s*\{[^}]*gap:\s*clamp\(64px, 8vw, 112px\)/);
  // the row line sits on each cell so the highlighted "Us" column keeps its lines
  assert.match(styles, /\.product-compare-row \+ \.product-compare-row \.product-compare-cell\s*\{[^}]*border-top:/);
  assert.match(styles, /\.product-compare-heading\s*\{[^}]*margin-bottom:\s*30px/);
});

test("discount popup is one centred column: wide picture, brand, message, form", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const popup = read("../components/store/DiscountPopup.jsx");
  const styles = read("../app/styles/overlays.css");

  // picture first, then the brand, then the message and the form
  assert.match(popup, /discount-popup-media[\s\S]*?discount-popup-brand[\s\S]*?<p>\{text\}<\/p>[\s\S]*?discount-popup-form/);
  assert.match(styles, /\.discount-popup\s*\{[^}]*flex-direction:\s*column/);
  assert.match(styles, /\.discount-popup\s*\{[^}]*text-align:\s*center/);
  assert.match(styles, /\.discount-popup-media\s*\{[^}]*aspect-ratio:\s*16 \/ 9/);
  // the box follows the uploaded picture's shape (square to 16:9) and the picture fills it
  assert.match(styles, /\.discount-popup-media img\s*\{[^}]*object-fit:\s*cover/);
  assert.doesNotMatch(styles, /discount-popup-media-blur|filter:\s*blur/);
  assert.match(popup, /Math\.min\(16 \/ 9, Math\.max\(1,/);
});

test("reviews showcase: full width, big uncropped cards and a small button", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const showcase = read("../components/store/product/ProductReviewShowcase.jsx");
  const styles = read("../app/styles/product-premium.css");

  assert.match(showcase, /review-showcase-head[\s\S]*?<ReviewMarquee[\s\S]*?review-showcase-cta/);
  assert.doesNotMatch(styles, /\.review-showcase\s*\{[^}]*max-width:\s*720px/);
  // cards grow with the screen so the text inside the review pictures can be read
  assert.match(styles, /\.review-marquee--card \.review-marquee-item\s*\{[^}]*width:\s*240px/);
  assert.match(styles, /\.review-marquee--card \.review-marquee-item\s*\{[^}]*width:\s*304px/);
  // the picture is shown whole, not cropped to a fixed ratio
  assert.doesNotMatch(styles, /\.review-marquee--card \.review-marquee-item img\s*\{[^}]*aspect-ratio/);
  assert.match(styles, /\.review-showcase-btn\s*\{[^}]*padding:\s*8px 18px/);
});

test("product page: sale bar has no badge, and the photo strip uses only this product's own review photos", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const detail = read("../components/store/product/ProductDetailClient.jsx");
  const reviews = read("../components/store/product/ProductReviewsSection.jsx");
  const admin = read("../components/admin/ReviewsShowcaseField.jsx");
  const styles = read("../app/styles/product-premium.css");

  // the % badge sits next to the price; the dark sale bar keeps only text + countdown
  assert.doesNotMatch(detail, /product-urgency-badge/);
  assert.doesNotMatch(styles, /product-urgency-badge/);
  assert.match(detail, /<UrgencyStrip urgency=\{urgency\} \/>/);
  // one shared strip of photos on every product is gone
  assert.doesNotMatch(detail, /reviewsShowcase\?\.photos/);
  assert.doesNotMatch(reviews, /reviewsShowcase|photos\?\.length/);
  assert.match(reviews, /sortReviews\(reviews, "recent"\)\.forEach/);
  assert.doesNotMatch(admin, /Customer photo strip/);
});

test("sale countdown reads the clock only after mount (no server/client hydration mismatch)", () => {
  const detail = readFileSync(new URL("../components/store/product/ProductDetailClient.jsx", import.meta.url), "utf8");
  assert.match(detail, /const \[remaining, setRemaining\] = useState\(null\)/);
  assert.doesNotMatch(detail, /useState\(\(\) => \(hasDeadline \? endsAt - Date\.now\(\)/);
  assert.match(detail, /hasDeadline && remaining !== null/);
});

test("site font is Outfit (like polynae.com), the old stacks are kept, admin keeps its old font, weights are lighter", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const layout = read("../app/layout.jsx");
  const tokens = read("../app/styles/tokens.css");
  const admin = read("../app/styles/admin-panel.css");
  const globals = read("../app/globals.css");
  const typography = read("../app/styles/typography.css");
  const home = read("../app/styles/home.css");

  assert.match(layout, /Outfit\(\{[\s\S]*?variable: "--font-outfit"/);
  assert.match(layout, /\$\{outfit\.variable\} \$\{notoArabic\.variable\}/);
  // new storefront stack, with the previous stacks still defined for a quick way back
  assert.match(tokens, /--font-sans:\s*var\(--font-outfit\), "Outfit", var\(--font-sans-legacy\)/);
  assert.match(tokens, /--font-sans-legacy:\s*-apple-system/);
  assert.match(tokens, /--font-serif-legacy:/);
  // Arabic: Latin letters stay in Outfit, Arabic letters come from Noto Sans Arabic
  assert.match(tokens, /\[dir="rtl"\] \{\s*font-family:\s*var\(--font-outfit\),\s*var\(--font-arabic\)/);
  assert.match(tokens, /strong,\s*b\s*\{\s*font-weight:\s*600/);
  // the staff admin panel is untouched
  assert.match(admin, /--font-sans:\s*var\(--font-sans-legacy\)/);
  // nothing on the storefront is heavier than 700 any more
  for (const file of ["header", "home", "catalog-product", "product-premium", "overlays", "checkout-order", "account"]) {
    const css = read(`../app/styles/${file}.css`);
    assert.doesNotMatch(css, /font-weight:\s*(750|780|800|850|900)/, `${file}.css still has a heavy weight`);
  }
  // loaded after every other stylesheet so it wins over the per-component sizes
  assert.ok(globals.indexOf("typography.css") > globals.indexOf("analytics.css"));
  assert.match(typography, /\.section-heading h3[\s\S]*?clamp\(1\.75rem, 3\.5vw, 2\.375rem\)/);
  assert.match(typography, /\.page-hero h1[\s\S]*?clamp\(2rem, 4\.2vw, 2\.875rem\)/);
  // the old Instagram block that overrode the new design is gone
  assert.equal((home.match(/^\.instagram-header \{/gm) || []).length, 1);
});

test("every storefront text size is one of Polynae's steps, and each module has Polynae's headline values", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const steps = new Set([0.5625, 0.6875, 0.75, 0.8125, 0.875, 0.9375, 1, 1.125, 1.25, 1.5]);
  for (const file of ["header", "home", "catalog-product", "product-premium", "overlays", "checkout-order", "account", "analytics"]) {
    const css = read(`../app/styles/${file}.css`);
    for (const match of css.matchAll(/font-size:\s*([\d.]+)rem/g)) {
      const value = Number(match[1]);
      assert.ok(value > 1.5 || steps.has(value), `${file}.css has an off-scale size ${value}rem`);
    }
  }
  const typography = read("../app/styles/typography.css");
  assert.match(typography, /\.nav-trigger,\s*\.nav-link\s*\{[^}]*font-size:\s*0\.875rem[^}]*font-weight:\s*500/);
  assert.match(typography, /\.product-card-body h4[\s\S]*?font-size:\s*1rem[\s\S]*?font-weight:\s*600/);
  assert.match(typography, /\.product-pricing\.product-pricing--premium strong\s*\{[^}]*clamp\(1\.75rem, 3vw, 2\.5rem\)/);
  assert.match(typography, /\.detail-accordion-header\s*\{[^}]*font-size:\s*1\.125rem/);
  assert.match(typography, /\.cart-drawer-header h3\s*\{[^}]*font-size:\s*1\.25rem/);
  assert.match(typography, /\.footer-column h5\s*\{[^}]*font-size:\s*0\.75rem/);
});

test("home product rail fills the container: equal cards per screen, arrows on the edges, shadow room", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const rail = read("../components/store/ProductRail.jsx");
  const styles = read("../app/styles/home.css");

  assert.match(rail, /product-rail-btn is-prev/);
  assert.match(rail, /product-rail-btn is-next/);
  // cards share the row equally instead of a fixed 286px width
  assert.doesNotMatch(styles, /grid-auto-columns:\s*clamp\(240px, 22vw, 286px\)/);
  assert.match(styles, /grid-auto-columns:\s*calc\(\(100% - \(var\(--rail-cards\) - 1\) \* var\(--rail-gap\)\) \/ var\(--rail-cards\)\)/);
  assert.match(styles, /--rail-cards:\s*4;/);
  assert.match(styles, /@media \(max-width: 1099px\)\s*\{\s*\.product-rail\s*\{\s*--rail-cards:\s*3;/);
  assert.match(styles, /@media \(max-width: 819px\)\s*\{\s*\.product-rail\s*\{\s*--rail-cards:\s*2\.3;/);
  // arrows no longer take room beside the row
  assert.match(styles, /\.product-rail-btn\s*\{[^}]*position:\s*absolute/);
  assert.match(styles, /\.product-rail-btn\.is-prev\s*\{\s*inset-inline-start:\s*-20px/);
  // shadow room so the row does not show a boxed edge
  assert.match(styles, /padding:\s*8px 20px 56px;\s*margin:\s*-8px -20px -44px/);
});

test("home: Instagram section is a swipeable row of big rounded posts", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const page = read("../app/[locale]/page.jsx");
  const feed = read("../components/store/home/InstagramFeed.jsx");
  const styles = read("../app/styles/home.css");

  assert.match(page, /<InstagramFeed posts=\{instagramPosts\}/);
  assert.doesNotMatch(page, /className="instagram-grid"/);
  assert.match(feed, /className="instagram-rail"/);
  assert.match(feed, /scrollBy/);
  assert.match(styles, /\.instagram-header h3\s*\{[^}]*text-transform:\s*uppercase/);
  assert.match(styles, /\.instagram-rail\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
  // four posts across on desktop, about a post and a half on a phone
  assert.match(styles, /\.instagram-tile\s*\{[^}]*flex:\s*0 0 calc\(\(100% - 32px - 78px\) \/ 4\)/);
  assert.match(styles, /\.instagram-tile\s*\{[^}]*flex-basis:\s*62vw/);
  assert.match(styles, /\[dir="rtl"\] \.instagram-header h3\s*\{\s*letter-spacing:\s*0/);
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
