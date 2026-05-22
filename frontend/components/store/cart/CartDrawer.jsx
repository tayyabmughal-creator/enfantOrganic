"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import Icon from "@/components/icons/Icon";
import CartApplePayButton from "@/components/store/cart/CartApplePayButton";
import { useStore } from "@/components/store/cart/StoreProvider";
import { useLocale } from "@/contexts/LocaleContext";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";
import { API_BASE_URL } from "@/lib/config";

function CartDrawerInner() {
  const searchParams = useSearchParams();
  const region = searchParams.get("region") || "om";
  const { locale } = useLocale();
  const t = uiText(locale);
  const { cartItems, closeCart, drawerOpen, refreshCartPricing, removeItem, subtotal, updateQuantity } = useStore();
  const [shippingThreshold, setShippingThreshold] = useState(null);
  const [thresholdCurrency, setThresholdCurrency] = useState(null);

  useEffect(() => {
    if (!cartItems.length) {
      return;
    }

    void refreshCartPricing(locale, region);
  }, [cartItems, locale, region]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/navigation/?locale=${locale}&region=${region}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        const t = Number(data?.current_region?.shipping_threshold);
        if (t > 0) {
          setShippingThreshold(t);
          setThresholdCurrency(data?.current_region?.currency_code || "");
        }
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

          {shippingThreshold > 0 && (() => {
            const progress = Math.min((subtotal / shippingThreshold) * 100, 100);
            const isUnlocked = subtotal >= shippingThreshold;
            const remaining = Math.max(shippingThreshold - subtotal, 0);
            const remainingLabel = `${thresholdCurrency} ${remaining.toFixed(3).replace(/\.?0+$/, (m) => remaining % 1 === 0 ? "" : m)}`;
            return (
              <div className="free-shipping-bar">
                <p className={`free-shipping-msg${isUnlocked ? " is-unlocked" : ""}`}>
                  {isUnlocked ? (
                    locale === "ar"
                      ? <><span aria-hidden="true">🎉</span> لقد حصلت على <strong>شحن مجاني</strong> لطلبك!</>
                      : <><span aria-hidden="true">🎉</span> You&rsquo;ve unlocked <strong>FREE shipping</strong> on your order!</>
                  ) : (
                    locale === "ar"
                      ? <>أضف <strong>{remainingLabel}</strong> للحصول على <strong>شحن مجاني</strong></>
                      : <>Add <strong>{remainingLabel}</strong> more for <strong>free shipping</strong></>
                  )}
                </p>
                <div className="free-shipping-track">
                  <div
                    className={`free-shipping-fill${isUnlocked ? " is-full" : ""}`}
                    style={{ width: `${progress}%` }}
                  >
                    {progress >= 18 && (
                      <span className="free-shipping-pct">{Math.round(progress)}%</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

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
