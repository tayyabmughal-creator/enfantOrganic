"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SiteImage from "@/components/ui/SiteImage";
import Icon from "@/components/icons/Icon";
import { useStoreActions } from "@/components/store/cart/StoreProvider";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";

const PRODUCT_CARD_IMAGE_MAP = {
  "/enfant/complete-care-cream.jpg": "/enfant/product-cards/complete-care-cream-card.jpg",
  "/enfant/daily-sun-protection-lotion.png": "/enfant/product-cards/daily-sun-protection-lotion-card.jpg",
  "/enfant/double-moisture-lotion.png": "/enfant/product-cards/double-moisture-lotion-card.jpg",
  "/enfant/extra-mild-baby-wipes.jpg": "/enfant/product-cards/extra-mild-baby-wipes-card.jpg",
  "/enfant/extra-mild-moisture-lotion.jpg": "/enfant/product-cards/extra-mild-moisture-lotion-card.jpg",
  "/enfant/face-body-sunscreen-lotion.png": "/enfant/product-cards/face-body-sunscreen-lotion-card.jpg",
  "/enfant/insect-repellent-lotion.png": "/enfant/product-cards/insect-repellent-lotion-card.jpg",
  "/enfant/moisture-shampoo.png": "/enfant/product-cards/moisture-shampoo-card.jpg",
  "/enfant/relax-moisturizing-lotion.png": "/enfant/product-cards/relax-moisturizing-lotion-card.jpg",
};

function resolveProductCardImage(image) {
  return PRODUCT_CARD_IMAGE_MAP[image] || image;
}

function ProductCard({ locale, product, region }) {
  const { addItem, flyToCart, openQuickView } = useStoreActions();
  const addBtnRef = useRef(null);
  const t = uiText(locale);
  const hasVariants = Boolean(product.has_variants || (product.variants || []).length);
  const hasOptions = hasVariants || (product.option_groups || []).some((group) => group.values.length > 1);
  const stockStatus = product.stock_status || {};
  const isOutOfStock = Boolean(stockStatus.track_inventory) && !Boolean(stockStatus.is_in_stock);
  const isLowStock = Boolean(stockStatus.track_inventory) && Boolean(stockStatus.is_in_stock) && Boolean(stockStatus.is_low_stock);
  const primaryImage = resolveProductCardImage(product.image);
  const hoverImage = product.hover_image ? resolveProductCardImage(product.hover_image) : "";
  const rating = Number(product.rating || 5);
  const reviewCount = Number(product.review_count || 0);
  const saveLabel = locale === "ar" ? "وفر" : "Save";
  const featurePills = [
    ...(product.tags || []).map((tag) => tag.name).filter(Boolean),
    product.unit,
  ].filter(Boolean).filter((item, index, items) => items.indexOf(item) === index).slice(0, 2);
  const savingsAmount = Math.max(
    (Number(product.pricing?.compare_amount) || 0) - (Number(product.pricing?.amount) || 0),
    0,
  );

  const handlePrimaryAction = () => {
    if (isOutOfStock) return;

    if (hasVariants || hasOptions) {
      openQuickView({ ...product, locale, region });
      return;
    }

    addItem({ ...product, locale }, 1, {});
    flyToCart(addBtnRef.current);
  };

  return (
    <article className={`product-card ${hoverImage ? "has-hover-image" : ""}`}>
      <div className="product-card-media-wrap">
        <Link
          href={buildStorePath(locale, `/product/${product.slug}`, region)}
          className="product-card-image"
        >
          <SiteImage
            src={primaryImage}
            alt={product.name}
            width={600}
            height={600}
            loading="lazy"
            className="product-card-image-primary"
            sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
          />
          {hoverImage ? (
            <SiteImage
              src={hoverImage}
              alt=""
              aria-hidden="true"
              width={600}
              height={600}
              loading="lazy"
              className="product-card-image-secondary"
              sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
            />
          ) : null}
          {isOutOfStock ? (
            <span className="product-badge product-badge-stock is-out">
              {locale === "ar" ? "غير متوفر" : "Out of stock"}
            </span>
          ) : isLowStock ? (
            <span className="product-badge product-badge-stock is-low">
              {locale === "ar" ? "كمية محدودة" : "Low stock"}
            </span>
          ) : product.badge ? (
            <span className="product-badge">{product.badge}</span>
          ) : null}
        </Link>
      </div>
      <div className="product-card-body">
        <Link href={buildStorePath(locale, `/product/${product.slug}`, region)}>
          <h4>{product.name}</h4>
        </Link>
        <div className="product-card-meta">
          {reviewCount > 0 ? (
            <div className="product-reviews">
              <span className="review-stars small">{"★".repeat(Math.max(1, Math.min(5, Math.round(rating || 5))))}</span>
              <strong>{rating.toFixed(1).replace(".0", "")}</strong>
              <span className="review-count-label">({reviewCount})</span>
            </div>
          ) : null}
          {featurePills.length ? (
            <div className="product-pill-row">
              {featurePills.map((pill) => (
                <span key={pill} className="product-feature-pill">{pill}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="product-price-panel">
          {hasVariants ? (
            <div className="product-pricing">
              <strong>{locale === "ar" ? "يبدأ من " : "From "}{formatMoney(product.pricing, locale)}</strong>
            </div>
          ) : (
            <>
              <div className="product-pricing">
                <strong>{formatMoney(product.pricing, locale)}</strong>
                {product.pricing?.compare_amount ? (
                  <span>
                    {formatMoney(
                      { ...product.pricing, amount: product.pricing.compare_amount, prefix: "" },
                      locale,
                    )}
                  </span>
                ) : null}
              </div>
              {savingsAmount > 0 ? (
                <span className="product-savings-badge">
                  {saveLabel} {formatMoney({ ...product.pricing, amount: savingsAmount, prefix: "" }, locale)}
                </span>
              ) : null}
            </>
          )}
        </div>
        {!hasVariants && product.pricing?.unit_price_text ? (
          <span className="unit-price-label">{product.pricing.unit_price_text}</span>
        ) : null}
        <button
          ref={addBtnRef}
          type="button"
          className="product-action-button"
          onClick={handlePrimaryAction}
          disabled={isOutOfStock}
        >
          <Icon name="bag" size={18} />
          {isOutOfStock ? t.outOfStock : hasOptions ? t.chooseOptions : t.addToCart}
        </button>
      </div>
    </article>
  );
}

export default memo(ProductCard);
