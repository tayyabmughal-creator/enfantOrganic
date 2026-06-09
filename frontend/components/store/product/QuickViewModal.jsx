"use client";

import { useEffect, useRef, useState } from "react";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import { formatMoney, uiText } from "@/lib/storefront";

export default function QuickViewModal() {
  const { addItem, closeQuickView, flyToCart, quickViewProduct } = useStore();
  const addBtnRef = useRef(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState({});

  useEffect(() => {
    if (!quickViewProduct) {
      return;
    }

    setQuantity(1);
    setSelectedOptions(
      Object.fromEntries(
        (quickViewProduct.option_groups || []).map((group) => [group.name, group.values[0]]),
      ),
    );
  }, [quickViewProduct]);

  if (!quickViewProduct) {
    return null;
  }

  const locale = quickViewProduct.locale || "en";
  const t = uiText(locale);

  return (
    <>
      <button
        type="button"
        className="overlay is-open"
        onClick={closeQuickView}
        aria-label="Close quick view"
      />
      <div className="quick-view-modal">
        <div className="quick-view-panel">
          <div className="quick-view-image">
            <div className="quick-view-image-stage">
              <img src={quickViewProduct.image} alt={quickViewProduct.name} />
            </div>
          </div>
          <div className="quick-view-copy">
            <div className="quick-view-header">
              <div className="quick-view-title-block">
                <span className="summary-badge">{quickViewProduct.badge || quickViewProduct.vendor}</span>
                <h3>{quickViewProduct.name}</h3>
              </div>
              <button type="button" className="icon-link" onClick={closeQuickView}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <p>{quickViewProduct.short_description}</p>
            <strong>{formatMoney(quickViewProduct.pricing, locale)}</strong>
            {(quickViewProduct.option_groups || []).map((group) => (
              <div key={group.name} className="quick-view-options">
                <h4>{group.name}</h4>
                <div className="option-pills">
                  {group.values.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`option-pill ${selectedOptions[group.name] === value ? "is-active" : ""}`}
                      onClick={() =>
                        setSelectedOptions((current) => ({
                          ...current,
                          [group.name]: value,
                        }))
                      }
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="summary-actions compact">
              <div className="quantity-control">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
                  <Icon name="minus" size={16} />
                </button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity((value) => value + 1)}>
                  <Icon name="plus" size={16} />
                </button>
              </div>
              <button
                ref={addBtnRef}
                type="button"
                className="primary-action"
                onClick={() => {
                  addItem(quickViewProduct, quantity, selectedOptions);
                  flyToCart(addBtnRef.current);
                  closeQuickView();
                }}
              >
                {t.addToCart}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
