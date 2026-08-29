"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";

import Icon from "@/components/icons/Icon";
import SiteImage from "@/components/ui/SiteImage";
import CartApplePayButton from "@/components/store/cart/CartApplePayButton";
import { useStore } from "@/components/store/cart/StoreProvider";
import { useLocale } from "@/contexts/LocaleContext";
import { buildStorePath, cartSavings, formatAmount, formatMoney, milestoneReward, uiText } from "@/lib/storefront";
import { useRegionCode } from "@/lib/useRegionCode";
import { API_BASE_URL } from "@/lib/config";

function TruckIcon() {
  return (
    <svg viewBox="0 0 22 16" fill="none" aria-hidden="true">
      <rect x="1" y="1.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 4.5h4.5L21 8v4h-7V4.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="5.5" cy="13.5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.5" cy="13.5" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PercentIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="11.5" cy="11.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12.5" y1="3.5" x2="3.5" y2="12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MilestoneBar({ subtotal, milestones, currency, locale }) {
  if (!milestones.length) return null;

  const sorted = [...milestones].sort((a, b) => Number(a.threshold) - Number(b.threshold));
  const n = sorted.length;

  // Pins are EVENLY spaced visually regardless of threshold values
  // e.g. 3 pins → 33.3%, 66.7%, 100%
  const pinPcts = sorted.map((_, i) => ((i + 1) / n) * 100);

  // Fill interpolates between milestone segments so it always reaches the
  // correct pin when a milestone is exactly hit
  const calcFill = () => {
    for (let i = 0; i < n; i++) {
      const prevT = i === 0 ? 0 : Number(sorted[i - 1].threshold);
      const currT = Number(sorted[i].threshold);
      const prevPct = i === 0 ? 0 : pinPcts[i - 1];
      const currPct = pinPcts[i];
      if (subtotal >= currT) {
        if (i === n - 1) return 100;
        continue;
      }
      const seg = Math.max(0, (subtotal - prevT) / (currT - prevT));
      return prevPct + seg * (currPct - prevPct);
    }
    return 100;
  };

  const fillPct = calcFill();
  const isDone = subtotal >= Number(sorted[n - 1].threshold);
  const next = sorted.find((m) => subtotal < Number(m.threshold));

  const fmt = (val) => {
    const num = Number(val);
    const s = num % 1 === 0 ? num.toFixed(0) : parseFloat(num.toFixed(3)).toString();
    return `${currency} ${s}`;
  };

  return (
    <div className="ms-bar">
      <p className={`ms-msg${isDone ? " ms-done" : ""}`}>
        {isDone ? (
          locale === "ar"
            ? <><span aria-hidden="true">🎉</span> رائع! حصلت على جميع المكافآت!</>
            : <><span aria-hidden="true">🎉</span> Amazing! You&rsquo;ve unlocked all rewards!</>
        ) : next ? (
          locale === "ar"
            ? <>أضف <strong>{fmt(Number(next.threshold) - subtotal)}</strong> للحصول على <strong>{next.label}</strong></>
            : <>Add <strong>{fmt(Number(next.threshold) - subtotal)}</strong> more for <strong>{next.label}</strong></>
        ) : null}
      </p>

      <div className="ms-track-area">
        <div className="ms-track">
          <div
            className={`ms-fill${isDone ? " ms-done" : ""}`}
            style={{ width: `${Math.max(fillPct, 1.5)}%` }}
          />
        </div>

        {sorted.map((m, i) => {
          const reached = subtotal >= Number(m.threshold);
          const isLast = i === n - 1;
          const isFirst = i === 0;
          return (
            <div
              key={i}
              className={`ms-pin${reached ? " ms-reached" : ""}${isLast ? " ms-pin-last" : ""}${isFirst ? " ms-pin-first" : ""}`}
              style={{ left: `${pinPcts[i]}%` }}
            >
              <div className="ms-pin-bubble">
                {reached
                  ? <CheckIcon />
                  : m.reward_type === "free_shipping"
                    ? <TruckIcon />
                    : <PercentIcon />}
              </div>
              <div className="ms-pin-label">
                <strong>{m.label}</strong>
                <span>{fmt(m.threshold)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Suggestions, pinned above the checkout button rather than sitting under the
 * basket. Below the lines they were only ever seen by a shopper who scrolled
 * past everything they had already decided to buy.
 *
 * One product fills the width at a time and the rest are a swipe away, with
 * dots so it reads as a carousel instead of a single lonely card.
 */
const AUTOPLAY_MS = 7000;
const GLIDE_MS = 450;

/**
 * Move the rail to a slide, easing scrollLeft by hand.
 *
 * Not scrollTo({behavior:"smooth"}): Chrome drops a smooth programmatic scroll
 * on a scroll-snap rail and nothing moves at all — measured again on this very
 * rail, where the smooth call left scrollLeft at 0 while a direct assignment
 * moved it. Snap is lifted for the glide so it cannot fight the easing, and a
 * settle timer puts the rail on the exact slide and restores snap even where
 * requestAnimationFrame never runs, which is the case in a backgrounded tab.
 *
 * `handle` is a ref used to cancel a glide still in flight, so a tapped dot or
 * the next tick never has to wait for the previous one.
 */
function glideToSlide(rail, index, handle, { instant = false } = {}) {
  if (!rail || !rail.clientWidth) return;

  if (handle.current) {
    cancelAnimationFrame(handle.current.frame);
    clearTimeout(handle.current.settle);
  }

  // Signed for RTL, where scrollLeft runs negative from the right edge.
  const direction = getComputedStyle(rail).direction === "rtl" ? -1 : 1;
  const to = direction * index * rail.clientWidth;
  const from = rail.scrollLeft;

  const finish = () => {
    rail.scrollLeft = to;
    rail.style.scrollSnapType = "";
    handle.current = null;
  };

  if (instant || from === to) {
    finish();
    return;
  }

  rail.style.scrollSnapType = "none";
  const started = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - started) / GLIDE_MS);
    // easeInOutQuad — a swipe that starts and stops rather than a hard cut.
    const eased = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
    rail.scrollLeft = from + (to - from) * eased;
    if (p < 1 && handle.current) {
      handle.current.frame = requestAnimationFrame(step);
    }
  };

  handle.current = {
    frame: requestAnimationFrame(step),
    settle: setTimeout(finish, GLIDE_MS + 60),
  };
}

function CartRecommendations({ locale, region, cartItems, drawerOpen, onAdd }) {
  const isAr = locale === "ar";
  const [products, setProducts] = useState([]);
  const [slide, setSlide] = useState(0);
  // Held while a finger is down on the rail: the shopper's own swipe outranks
  // the timer, and yanking the rail out from under it feels broken.
  const [held, setHeld] = useState(false);
  // Bumped by a dot tap so the timer restarts: without it the next tick can be
  // milliseconds away and the card the shopper just chose slides straight off.
  const [nudge, setNudge] = useState(0);
  const railRef = useRef(null);
  const glideRef = useRef(null);
  const slugKey = cartItems.map((item) => item.slug).sort().join(",");

  // Only ever fetched while the drawer is open. The drawer is mounted on every
  // page, so fetching on render would pull a row of product images down on every
  // visit for a panel nobody has opened.
  useEffect(() => {
    if (!drawerOpen) return undefined;

    const controller = new AbortController();
    const params = new URLSearchParams({ locale, region, limit: "6" });
    if (slugKey) params.set("slugs", slugKey);

    fetch(`${API_BASE_URL}/cart-recommendations/?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setProducts(Array.isArray(data?.products) ? data.products : []))
      .catch(() => {});

    return () => controller.abort();
  }, [drawerOpen, locale, region, slugKey]);

  // Rotate every 7s. Left still, this rail only ever showed its first card:
  // it sits above the checkout button, where a shopper is reading totals rather
  // than looking for something to swipe.
  useEffect(() => {
    const rail = railRef.current;
    if (!drawerOpen || held || products.length < 2 || !rail) return undefined;

    // Someone who asked for less motion still gets the rotation — it is how the
    // suggestions are seen at all — but it lands rather than travels.
    const instant =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const timer = setInterval(() => {
      if (!rail.clientWidth) return;
      // Read the position rather than the state: a finger may have moved the
      // rail since the last tick, and the next card should follow the rail.
      const current = Math.round(Math.abs(rail.scrollLeft) / rail.clientWidth);
      const next = (current + 1) % products.length;
      glideToSlide(rail, next, glideRef, { instant });
      setSlide(next);
    }, AUTOPLAY_MS);

    return () => clearInterval(timer);
  }, [drawerOpen, held, nudge, products.length]);

  // A glide left running past unmount would keep writing to a detached node.
  useEffect(() => () => {
    if (!glideRef.current) return;
    cancelAnimationFrame(glideRef.current.frame);
    clearTimeout(glideRef.current.settle);
    glideRef.current = null;
  }, []);

  if (!products.length) return null;

  // Which slide is in view, from the rail's own scroll position, so the dots
  // follow a finger swipe as well as a dot tap.
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || !rail.clientWidth) return;
    setSlide(Math.round(Math.abs(rail.scrollLeft) / rail.clientWidth));
  };

  const goToSlide = (index) => {
    glideToSlide(railRef.current, index, glideRef, { instant: true });
    // Set here as well as from the scroll handler so the tapped dot lights up
    // immediately rather than after the rail has settled on a snap point.
    setSlide(index);
    setNudge((n) => n + 1);
  };

  return (
    <div className="cart-recommendations">
      <h4 className="cart-recommendations-title">
        {cartItems.length
          ? (isAr ? "أضف إليها" : "Goes well with this")
          : (isAr ? "الأكثر مبيعًا" : "Popular right now")}
      </h4>
      <div
        className="cart-recommendations-rail"
        ref={railRef}
        onScroll={onRailScroll}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
      >
        {products.map((product) => {
          const outOfStock = product.stock_status && product.stock_status.is_in_stock === false;
          const href = buildStorePath(locale, `/product/${product.slug}`, region);
          return (
            <article key={product.slug} className="cart-recommendation">
              <Link href={href} className="cart-recommendation-media">
                <SiteImage src={product.image} alt={product.name} width={96} height={96} loading="lazy" sizes="96px" />
              </Link>
              <div className="cart-recommendation-copy">
                <Link href={href} className="cart-recommendation-name">
                  {product.name}
                </Link>
                <span className="cart-recommendation-price">{formatMoney(product.pricing, locale)}</span>
              </div>
              <button
                type="button"
                className="cart-recommendation-add"
                disabled={outOfStock}
                onClick={() => onAdd(product)}
              >
                {outOfStock
                  ? (isAr ? "نفد المخزون" : "Out of stock")
                  : (isAr ? "أضف" : "Add")}
              </button>
            </article>
          );
        })}
      </div>

      {products.length > 1 ? (
        <div className="cart-recommendations-dots">
          {products.map((product, index) => (
            <button
              key={product.slug}
              type="button"
              className={`cart-recommendations-dot${index === slide ? " is-active" : ""}`}
              aria-label={
                isAr ? `الاقتراح ${index + 1}` : `Suggestion ${index + 1}`
              }
              aria-current={index === slide}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CartDrawerInner() {
  // Never from `?region=` alone — the browser URL has no such param, so that
  // read priced every UAE and Saudi cart in OMR. See useRegionCode().
  const region = useRegionCode();
  const { locale } = useLocale();
  const t = uiText(locale);
  const {
    activeRegion,
    addItem,
    cartItems,
    closeCart,
    drawerOpen,
    outOfRegionItems,
    refreshCartPricing,
    removeItem,
    subtotal,
    updateQuantity,
  } = useStore();
  const [milestones, setMilestones] = useState([]);
  const [thresholdCurrency, setThresholdCurrency] = useState("OMR");

  // Only lines actually priced for this store carry the basket's currency; one
  // left behind by a region switch would otherwise decide how every figure in
  // the drawer is formatted.
  const isPricedHere = (item) => !activeRegion || item.pricing?.region_code === activeRegion;
  const pricedItems = cartItems.filter(isPricedHere);
  const basketPricing = pricedItems[0]?.pricing || cartItems[0]?.pricing || null;
  const money = (amount) =>
    basketPricing ? formatMoney({ ...basketPricing, amount, prefix: "" }, locale) : "";

  // Milestone thresholds come from the region payload while the basket is
  // priced by the product API. If those two ever disagree on currency the
  // comparison is meaningless, so no reward is claimed rather than a wrong one.
  const rewardsComparable =
    Boolean(basketPricing) && thresholdCurrency === basketPricing.currency_code;
  const reward = rewardsComparable
    ? milestoneReward(milestones, subtotal)
    : { discountPct: 0, discount: 0, freeShipping: false };

  // Same total the checkout shows: what the products are sold below their
  // compare-at price, plus the cart reward. A coupon can only be entered at
  // checkout, so it is the one part of that figure the cart cannot know.
  const savings = cartSavings(pricedItems, { discountAmount: reward.discount });
  const total = Math.max(0, subtotal - reward.discount);
  // What the basket would have cost at the compare-at prices, struck through
  // beside the total — the shopper sees the discount rather than a breakdown.
  const totalBeforeSavings = total + savings;

  useEffect(() => {
    if (!cartItems.length) {
      return;
    }

    void refreshCartPricing(locale, region);
    // Deliberately keyed on the item COUNT, not the array: repricing replaces
    // the array, so depending on it would re-enter this effect forever. Opening
    // the drawer is the extra trigger, so a line a dropped request left at the
    // previous store's price gets another attempt rather than sticking.
  }, [cartItems.length, drawerOpen, locale, region, refreshCartPricing]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/navigation/?locale=${locale}&region=${region}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        const currency = data?.current_region?.currency_code || "OMR";
        setThresholdCurrency(currency);
        const raw = data?.current_region?.cart_milestones || [];
        setMilestones(raw.map((m) => ({ ...m, label: m.label || m.reward_type })));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [locale, region]);

  return (
    <>
      <button
        type="button"
        className={`overlay ${drawerOpen ? "is-open" : ""}`}
        onClick={closeCart}
        aria-label="Close cart"
      />
      <aside className={`cart-drawer ${drawerOpen ? "is-open" : ""}`}>
        <div className="cart-drawer-panel">
          <div className="cart-drawer-header">
            <h3>{t.cart}</h3>
            <button type="button" className="icon-link" onClick={closeCart}>
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* One scroll region for the rewards bar, the lines and the totals.
              With the totals pinned to the footer instead, a phone in the 667px
              class had about a hundred pixels left for the basket itself. */}
          <div className="cart-drawer-scroll">
            {milestones.length > 0 && (
              <MilestoneBar
                subtotal={subtotal}
                milestones={milestones}
                currency={thresholdCurrency}
                locale={locale}
              />
            )}

            <div className="cart-drawer-items">
              {cartItems.length === 0 ? (
                <div className="empty-panel">
                  <p>{t.continueShopping}</p>
                </div>
              ) : (
                cartItems.map((item) => {
                  const lineMoney = (amount) => formatMoney({ ...item.pricing, amount, prefix: "" }, locale);
                  const compare = Number(item.pricing.compare_amount) || 0;
                  const discounted = compare > item.pricing.amount;
                  const strandedHere = !isPricedHere(item);

                  return (
                    <article
                      key={item.lineId}
                      className={`cart-line-item${strandedHere ? " is-unavailable" : ""}`}
                    >
                      <div className="cart-line-media">
                        <SiteImage src={item.image} alt={item.name} width={160} height={160} loading="lazy" sizes="96px" />
                      </div>
                      <div className="cart-line-copy">
                        <strong className="cart-line-name">{item.name}</strong>
                        {item.selectedOptionsText ? (
                          <span className="cart-line-variant">{item.selectedOptionsText}</span>
                        ) : null}

                        {strandedHere ? (
                          <span className="cart-line-unavailable">
                            {locale === "ar"
                              ? "غير متوفر في هذا المتجر — يرجى إزالته"
                              : "Not available in this store — please remove it"}
                          </span>
                        ) : (
                          <div className="cart-line-foot">
                            <div className="cart-line-controls">
                              <button
                                type="button"
                                aria-label={locale === "ar" ? "إنقاص الكمية" : "Decrease quantity"}
                                onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                              >
                                −
                              </button>
                              <span>{item.quantity}</span>
                              <button
                                type="button"
                                aria-label={locale === "ar" ? "زيادة الكمية" : "Increase quantity"}
                                onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                              >
                                +
                              </button>
                            </div>
                            <div className="cart-line-prices">
                              <span className="cart-line-total">
                                {lineMoney(item.pricing.amount * item.quantity)}
                              </span>
                              {discounted ? (
                                /* Amount only — the price beside it has already
                                   named the currency, and repeating it pushed
                                   the pair off the stepper's row. */
                                <s className="cart-line-was">
                                  {formatAmount({ ...item.pricing, amount: compare * item.quantity }, locale)}
                                </s>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="cart-line-remove"
                        aria-label={locale === "ar" ? "إزالة المنتج" : "Remove item"}
                        onClick={() => removeItem(item.lineId)}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </article>
                  );
                })
              )}
            </div>

          </div>

          <div className="cart-drawer-footer">
            {/* Outside the branch below: on an empty cart these become the
                "Popular right now" rail, which is the only thing in the drawer
                worth looking at. */}
            <CartRecommendations
              locale={locale}
              region={region}
              cartItems={cartItems}
              drawerOpen={drawerOpen}
              onAdd={(product) => addItem(product, 1)}
            />

            {cartItems.length ? (
              <>
                {outOfRegionItems.length ? (
                  <p className="cart-region-warning">
                    {locale === "ar"
                      ? "بعض المنتجات غير متوفرة في هذا المتجر ولم تُحتسب في الإجمالي."
                      : "Some items aren't sold in this store and are not counted in the total."}
                  </p>
                ) : null}

                {/* Shipping, tax and the reward breakdown all belong to the
                    order summary. Here it is the one figure the shopper is
                    weighing up, with what it would have cost struck out. */}
                <div className="cart-total-row">
                  <span>{locale === "ar" ? "الإجمالي" : "Total"}</span>
                  <span className="cart-total-amounts">
                    {savings > 0 ? (
                      <s className="cart-total-was">{money(totalBeforeSavings)}</s>
                    ) : null}
                    <strong>{money(total)}</strong>
                  </span>
                </div>

                {savings > 0 ? (
                  <p className="cart-saved-line">
                    {locale === "ar"
                      ? <>وفّرت <strong>{money(savings)}</strong></>
                      : <>You saved <strong>{money(savings)}</strong></>}
                  </p>
                ) : null}

                <CartApplePayButton />
                <Link
                  href={buildStorePath(locale, "/checkout", region)}
                  className="primary-action full-width"
                  onClick={closeCart}
                >
                  {t.checkout}
                </Link>
                <button
                  type="button"
                  className="cart-continue-shopping-btn"
                  onClick={closeCart}
                >
                  <Icon name="chevronLeft" size={13} />
                  {locale === "ar" ? "متابعة التسوق" : "Continue Shopping"}
                </button>
              </>
            ) : (
              <Link
                href={buildStorePath(locale, "/collections", region)}
                className="secondary-action full-width"
                onClick={closeCart}
              >
                {t.continueShopping}
              </Link>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default function CartDrawer() {
  return (
    <Suspense fallback={null}>
      <CartDrawerInner />
    </Suspense>
  );
}
