"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import { buildStorePath, formatMoney, normalizeLocale, uiText } from "@/lib/storefront";

function CartDrawerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const region = searchParams.get("region") || "om";
  const locale = normalizeLocale(pathname.split("/")[1]);
  const t = uiText(locale);
  const { cartItems, closeCart, drawerOpen, refreshCartPricing, removeItem, subtotal, updateQuantity } = useStore();

  useEffect(() => {
    if (!cartItems.length) {
      return;
    }

    void refreshCartPricing(locale, region);
  }, [cartItems, locale, region]);

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
