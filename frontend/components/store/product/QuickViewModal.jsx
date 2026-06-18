"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";

function findMatchingVariant(variants, selectedOptions) {
  if (!Array.isArray(variants) || !variants.length) return null;
  return (
    variants.find((v) =>
      Object.entries(v.options || {}).every(
        ([name, value]) => selectedOptions?.[name] === value,
      ),
    ) || null
  );
}

export default function QuickViewModal() {
  const { addItem, closeQuickView, flyToCart, quickViewProduct } = useStore();
  const addBtnRef = useRef(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState({});

  const variants = Array.isArray(quickViewProduct?.variants) ? quickViewProduct.variants : [];
  const optionGroups = Array.isArray(quickViewProduct?.option_groups) ? quickViewProduct.option_groups : [];
  const hasVariants = variants.length > 0;

  useEffect(() => {
    if (!quickViewProduct) return;

    setQuantity(1);

    if (hasVariants && variants.length) {
      // Initialise from the first available variant's options
      const first = variants.find((v) => v.is_available !== false) || variants[0];
      setSelectedOptions({ ...(first?.options || {}) });
    } else {
      setSelectedOptions(
        Object.fromEntries(
          optionGroups.map((group) => [group.name, group.values[0]]),
        ),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickViewProduct?.slug]);

  if (!quickViewProduct) return null;

  const locale = quickViewProduct.locale || "en";
  const region = quickViewProduct.region || "";
  const t = uiText(locale);
  const isAr = locale === "ar";

  const selectedVariant = hasVariants ? findMatchingVariant(variants, selectedOptions) : null;
  const pricing = selectedVariant?.pricing?.amount != null
    ? selectedVariant.pricing
    : quickViewProduct.pricing;

  const variantStock = selectedVariant?.stock_quantity;
  const isOutOfStock = hasVariants
    ? (selectedVariant ? (variantStock != null && Number(variantStock) <= 0) : false)
    : false;

  // Build option groups from variants (all unique option keys + their values)
  const variantOptionGroups = hasVariants
    ? (() => {
        const grouped = {};
        const order = [];
        for (const v of variants) {
          for (const [name, value] of Object.entries(v.options || {})) {
            if (!grouped[name]) { grouped[name] = []; order.push(name); }
            if (!grouped[name].includes(value)) grouped[name].push(value);
          }
        }
        return order.map((name) => ({ name, values: grouped[name] }));
      })()
    : optionGroups;

  // Is a given option value available (has at least one in-stock variant)?
  function isOptionAvailable(groupName, value) {
    if (!hasVariants) return true;
    return variants.some(
      (v) =>
        v.options?.[groupName] === value &&
        Object.entries(selectedOptions).every(
          ([otherName, otherValue]) =>
            otherName === groupName || v.options?.[otherName] === otherValue,
        ) &&
        v.is_available !== false &&
        (v.stock_quantity == null || Number(v.stock_quantity) > 0),
    );
  }

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    addItem({ ...quickViewProduct, locale }, quantity, selectedOptions, selectedVariant);
    flyToCart(addBtnRef.current);
    closeQuickView();
  };

  const compareAmount = Number(pricing?.compare_amount || 0);
  const showCompare = compareAmount > Number(pricing?.amount || 0);

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

          {/* Image */}
          <div className="quick-view-image">
            <div className="quick-view-image-stage">
              <img
                src={selectedVariant?.image || quickViewProduct.image}
                alt={quickViewProduct.name}
              />
            </div>
          </div>

          {/* Content */}
          <div className="quick-view-copy">
            <div className="quick-view-header">
              <div className="quick-view-title-block">
                <span className="summary-badge">
                  {quickViewProduct.badge || quickViewProduct.vendor}
                </span>
                <h3>{quickViewProduct.name}</h3>
              </div>
              <button type="button" className="icon-link" onClick={closeQuickView}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <p>{quickViewProduct.short_description}</p>

            {/* Price */}
            <div className="quick-view-pricing">
              {pricing?.amount != null ? (
                <>
                  <strong className="quick-view-price">{formatMoney(pricing, locale)}</strong>
                  {showCompare ? (
                    <span className="quick-view-compare">
                      {formatMoney({ ...pricing, amount: compareAmount, prefix: "" }, locale)}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>

            {/* Variant / Option selectors */}
            {variantOptionGroups.map((group) => (
              <div key={group.name} className="quick-view-options">
                <h4>
                  {group.name}
                  {selectedOptions[group.name] ? (
                    <span className="quick-view-selected-value">
                      {" "}{isAr ? "" : ":"} {selectedOptions[group.name]}
                    </span>
                  ) : null}
                </h4>
                <div className="option-pills">
                  {group.values.map((value) => {
                    const available = isOptionAvailable(group.name, value);
                    const active = selectedOptions[group.name] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!available}
                        className={[
                          "option-pill",
                          active ? "is-active" : "",
                          !available ? "is-unavailable" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() =>
                          setSelectedOptions((current) => ({
                            ...current,
                            [group.name]: value,
                          }))
                        }
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Out of stock notice */}
            {isOutOfStock ? (
              <p className="quick-view-out-of-stock">
                {isAr ? "هذا الخيار غير متوفر حالياً" : "This option is currently out of stock"}
              </p>
            ) : null}

            {/* Actions */}
            <div className="summary-actions compact">
              <div className="quantity-control">
                <button
                  type="button"
                  onClick={() => setQuantity((v) => Math.max(1, v - 1))}
                  disabled={isOutOfStock}
                >
                  <Icon name="minus" size={16} />
                </button>
                <span>{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((v) => v + 1)}
                  disabled={isOutOfStock}
                >
                  <Icon name="plus" size={16} />
                </button>
              </div>
              <button
                ref={addBtnRef}
                type="button"
                className="primary-action"
                disabled={isOutOfStock}
                onClick={handleAddToCart}
              >
                {isOutOfStock ? (isAr ? "غير متوفر" : "Out of stock") : t.addToCart}
              </button>
            </div>

            {/* Link to full product page */}
            <Link
              href={buildStorePath(locale, `/product/${quickViewProduct.slug}`, region)}
              className="quick-view-full-link"
              onClick={closeQuickView}
            >
              {isAr ? "← عرض تفاصيل المنتج الكاملة" : "View full product details →"}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
