"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import Icon from "@/components/icons/Icon";
import CartApplePayButton from "@/components/store/cart/CartApplePayButton";
import { useStore } from "@/components/store/cart/StoreProvider";
import { useLocale } from "@/contexts/LocaleContext";
import { buildStorePath, formatMoney, normalizeRegion, uiText } from "@/lib/storefront";
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

function CartDrawerInner() {
  const searchParams = useSearchParams();
  const region = normalizeRegion(searchParams.get("region") || "om");
  const { locale } = useLocale();
  const t = uiText(locale);
  const { cartItems, closeCart, drawerOpen, refreshCartPricing, removeItem, subtotal, updateQuantity } = useStore();
  const [milestones, setMilestones] = useState([]);
  const [thresholdCurrency, setThresholdCurrency] = useState("OMR");

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
              cartItems.map((item) => (
                <article key={item.lineId} className="cart-line-item">
                  <div className="cart-line-media">
                    <img src={item.image} alt={item.name} />
                  </div>
                  <div className="cart-line-copy">
                    <strong>{item.name}</strong>
                    {item.selectedOptionsText ? <span>{item.selectedOptionsText}</span> : null}
                    <span className="cart-line-total">
                      {formatMoney(
                        {
                          ...item.pricing,
                          amount: item.pricing.amount * item.quantity,
                          prefix: "",
                        },
                        locale,
                      )}
                    </span>
                    <div className="cart-line-controls">
                      <button type="button" onClick={() => updateQuantity(item.lineId, item.quantity - 1)}>
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.lineId, item.quantity + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                  <button type="button" className="icon-link" onClick={() => removeItem(item.lineId)}>
                    <Icon name="close" size={14} />
                  </button>
                </article>
              ))
            )}
          </div>

          <div className="cart-drawer-footer">
            {cartItems.length ? (
              <>
                <div className="subtotal-row">
                  <span>{t.subtotal}</span>
                  <strong>
                    {cartItems[0]
                      ? formatMoney(
                          {
                            ...cartItems[0].pricing,
                            amount: subtotal,
                            prefix: "",
                          },
                          locale,
                        )
                      : ""}
                  </strong>
                </div>
                <p>{t.shipping}</p>
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
