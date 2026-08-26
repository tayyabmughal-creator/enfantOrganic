"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";

import Icon from "@/components/icons/Icon";
import SiteImage from "@/components/ui/SiteImage";
import CartApplePayButton from "@/components/store/cart/CartApplePayButton";
import { useStore } from "@/components/store/cart/StoreProvider";
import { useLocale } from "@/contexts/LocaleContext";
import { buildStorePath, cartSavings, formatMoney, milestoneReward, uiText } from "@/lib/storefront";
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

function CartRecommendations({ locale, region, cartItems, drawerOpen, onAdd }) {
  const isAr = locale === "ar";
  const [products, setProducts] = useState([]);
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

  if (!products.length) return null;

  return (
    <div className="cart-recommendations">
      <h4 className="cart-recommendations-title">
        {cartItems.length
          ? (isAr ? "أضف إليها" : "Goes well with this")
          : (isAr ? "الأكثر مبيعًا" : "Popular right now")}
      </h4>
      <div className="cart-recommendations-rail">
        {products.map((product) => {
          const outOfStock = product.stock_status && product.stock_status.is_in_stock === false;
          return (
            <article key={product.slug} className="cart-recommendation">
              <Link
                href={buildStorePath(locale, `/product/${product.slug}`, region)}
                className="cart-recommendation-media"
              >
                <SiteImage src={product.image} alt={product.name} width={96} height={96} loading="lazy" sizes="96px" />
              </Link>
              <Link
                href={buildStorePath(locale, `/product/${product.slug}`, region)}
                className="cart-recommendation-name"
              >
                {product.name}
              </Link>
              <span className="cart-recommendation-price">{formatMoney(product.pricing, locale)}</span>
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
    </div>
  );
}

function CartDrawerInner() {
  // Never from `?region=` alone — the browser URL has no such param, so that
  // read priced every UAE and Saudi cart in OMR. See useRegionCode().
  const region = useRegionCode();
  const { locale } = useLocale();
  const t = uiText(locale);
  const { addItem, cartItems, closeCart, drawerOpen, refreshCartPricing, removeItem, subtotal, updateQuantity } = useStore();
  const [milestones, setMilestones] = useState([]);
  const [thresholdCurrency, setThresholdCurrency] = useState("OMR");

  const basketPricing = cartItems[0]?.pricing || null;
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
  const savings = cartSavings(cartItems, { discountAmount: reward.discount });
  const estimatedTotal = Math.max(0, subtotal - reward.discount);

  useEffect(() => {
    if (!cartItems.length) {
      return;
    }

    void refreshCartPricing(locale, region);
  }, [cartItems.length, locale, region, refreshCartPricing]);

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
                  const lineSaving = compare > item.pricing.amount
                    ? (compare - item.pricing.amount) * item.quantity
                    : 0;

                  return (
                    <article key={item.lineId} className="cart-line-item">
                      <div className="cart-line-media">
                        <SiteImage src={item.image} alt={item.name} width={120} height={120} loading="lazy" sizes="120px" />
                      </div>
                      <div className="cart-line-copy">
                        <strong className="cart-line-name">{item.name}</strong>
                        {item.selectedOptionsText ? (
                          <span className="cart-line-variant">{item.selectedOptionsText}</span>
                        ) : null}
                        {item.quantity > 1 ? (
                          <span className="cart-line-unit">
                            {lineMoney(item.pricing.amount)} × {item.quantity}
                          </span>
                        ) : null}

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
                            {lineSaving > 0 ? (
                              <s className="cart-line-was">{lineMoney(compare * item.quantity)}</s>
                            ) : null}
                          </div>
                        </div>

                        {lineSaving > 0 ? (
                          <span className="cart-line-save">
                            {locale === "ar" ? "توفير" : "Save"} {lineMoney(lineSaving)}
                          </span>
                        ) : null}
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

            {cartItems.length ? (
              <div className="cart-summary">
                <div className="subtotal-row">
                  <span>{t.subtotal}</span>
                  <strong>{money(subtotal)}</strong>
                </div>

                {reward.discount > 0 ? (
                  <div className="subtotal-row">
                    <span>
                      {locale === "ar"
                        ? `مكافأة السلة (خصم ${reward.discountPct}%)`
                        : `Cart reward (${reward.discountPct}% off)`}
                    </span>
                    <strong className="summary-amount--discount">-{money(reward.discount)}</strong>
                  </div>
                ) : null}

                <div className="subtotal-row">
                  <span>{locale === "ar" ? "الشحن" : "Shipping"}</span>
                  {reward.freeShipping ? (
                    <strong className="summary-amount--discount">
                      {locale === "ar" ? "مجاناً" : "Free"}
                    </strong>
                  ) : (
                    <strong className="cart-summary-pending">
                      {locale === "ar" ? "يُحتسب عند الدفع" : "At checkout"}
                    </strong>
                  )}
                </div>

                {/* Tax needs the region's rate and shipping needs an address,
                    so neither is a figure the drawer can put a number against.
                    They are still listed, the way the order summary lists them,
                    so the estimate visibly excludes them rather than just
                    reading lower than the total at checkout. */}
                <div className="subtotal-row">
                  <span>{locale === "ar" ? "ضريبة القيمة المضافة" : "VAT"}</span>
                  <strong className="cart-summary-pending">
                    {locale === "ar" ? "يُحتسب عند الدفع" : "At checkout"}
                  </strong>
                </div>

                <div className="subtotal-row cart-summary-total">
                  <span>{locale === "ar" ? "الإجمالي التقديري" : "Estimated total"}</span>
                  <strong>{money(estimatedTotal)}</strong>
                </div>

                {savings > 0 ? (
                  <div className="cart-savings-row">
                    <span aria-hidden="true">🎉</span>
                    <span>
                      {locale === "ar" ? "أنت توفّر" : "You're saving"}{" "}
                      <strong>{money(savings)}</strong>
                      {locale === "ar" ? " على هذا الطلب" : " on this order"}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <CartRecommendations
              locale={locale}
              region={region}
              cartItems={cartItems}
              drawerOpen={drawerOpen}
              onAdd={(product) => addItem(product, 1)}
            />
          </div>

          <div className="cart-drawer-footer">
            {cartItems.length ? (
              <>
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
