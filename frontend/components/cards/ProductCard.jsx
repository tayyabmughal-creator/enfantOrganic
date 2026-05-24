"use client";

import { useState } from "react";
import Link from "next/link";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
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

export default function ProductCard({ locale, product, region }) {
  const { addItem, openCart, openQuickView } = useStore();
  const t = uiText(locale);
  const [wishToast, setWishToast] = useState(false);
  const hasOptions = (product.option_groups || []).some((group) => group.values.length > 1);
  const primaryImage = resolveProductCardImage(product.image);
  const hoverImage = product.hover_image ? resolveProductCardImage(product.hover_image) : "";
  const rating = Number(product.rating || 0);
  const reviewLabel = locale === "ar" ? "تقييم" : "reviews";
  const saveLabel = locale === "ar" ? "وفر" : "Save";
  const wishlistLabel = locale === "ar" ? "إضافة إلى المفضلة" : "Add to wishlist";
  const featurePills = [
    ...(product.tags || []).map((tag) => tag.name).filter(Boolean),
    product.unit,
  ].filter(Boolean).filter((item, index, items) => items.indexOf(item) === index).slice(0, 2);
  const savingsAmount = Math.max(
    (Number(product.pricing?.compare_amount) || 0) - (Number(product.pricing?.amount) || 0),
    0,
  );

  const handlePrimaryAction = () => {
    if (hasOptions) {
      openQuickView({ ...product, locale, region });
      return;
    }

    addItem({ ...product, locale }, 1, {});
    openCart();
  };

  return (
    <article className={`product-card ${hoverImage ? "has-hover-image" : ""}`}>
      <div className="product-card-media-wrap">
        <Link href={buildStorePath(locale, `/product/${product.slug}`, region)} className="product-card-image">
          <img
            src={primaryImage}
            alt={product.name}
            loading="lazy"
            className="product-card-image-primary"
          />
          {hoverImage ? (
            <img
              src={hoverImage}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="product-card-image-secondary"
            />
          ) : null}
          {product.badge ? <span className="product-badge">{product.badge}</span> : null}
        </Link>
        <button
          type="button"
          className="wishlist-button product-card-wishlist"
          aria-label={wishlistLabel}
          onClick={() => {
            setWishToast(true);
            setTimeout(() => setWishToast(false), 2200);
          }}
        >
          <Icon name="heart" size={17} />
          {wishToast ? (
            <span className="wishlist-toast">
              {locale === "ar" ? "سجّل دخولك لحفظ المنتجات" : "Sign in to save items"}
            </span>
          ) : null}
        </button>
      </div>
      <div className="product-card-body">
        {product.vendor ? <span className="product-card-vendor">{product.vendor}</span> : null}
        <Link href={buildStorePath(locale, `/product/${product.slug}`, region)}>
          <h4>{product.name}</h4>
        </Link>
        <p className="product-card-description">{product.short_description || ""}</p>
        <div className="product-card-meta">
          {product.review_count > 0 ? (
            <div className="product-reviews">
              <span className="review-stars small">{"★".repeat(Math.round(rating || 5))}</span>
              {rating ? <strong>{rating.toFixed(1).replace(".0", "")}</strong> : null}
              <span>({product.review_count} {reviewLabel})</span>
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
        </div>
        {product.pricing?.unit_price_text ? (
          <span className="unit-price-label">{product.pricing.unit_price_text}</span>
        ) : null}
        <button type="button" className="product-action-button" onClick={handlePrimaryAction}>
          <Icon name="bag" size={18} />
          {hasOptions ? t.chooseOptions : t.addToCart}
        </button>
      </div>
    </article>
  );
}
