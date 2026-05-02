"use client";

import { useState } from "react";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";

export default function ProductDetailClient({ locale, product, region }) {
  const { addItem, openCart } = useStore();
  const t = uiText(locale);
  const galleryImages = Array.from(
    new Set((product.gallery?.length ? product.gallery : [product.image]).filter(Boolean)),
  );
  const [selectedImage, setSelectedImage] = useState(galleryImages[0] || product.image);
  const [selectedTab, setSelectedTab] = useState("description");
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState(
    Object.fromEntries((product.option_groups || []).map((group) => [group.name, group.values[0]])),
  );

  const addCurrentProduct = () => {
    addItem({ ...product, locale }, quantity, selectedOptions);
    openCart();
  };

  return (
    <div className="product-layout">
      <div className={`gallery-layout ${galleryImages.length === 1 ? "is-single" : ""}`}>
        {galleryImages.length > 1 ? (
          <div className="thumb-list">
            {galleryImages.map((image) => (
              <button
                key={image}
                type="button"
                className={`thumb-button ${selectedImage === image ? "is-active" : ""}`}
                onClick={() => setSelectedImage(image)}
              >
                <img src={image} alt={product.name} loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
        <div className={`main-product-image ${galleryImages.length === 1 ? "is-single" : ""}`}>
          <img src={selectedImage} alt={product.name} />
        </div>
      </div>

      <div className="product-summary">
        <div className="summary-block">
          <span className="summary-badge">{product.badge || product.category.name}</span>
          <h1>{product.name}</h1>
          <div className="product-reviews">
            <span className="review-stars small">★★★★★</span>
            <span>{product.review_count}</span>
          </div>
          <div className="product-pricing large">
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
          <p>{product.short_description}</p>
        </div>

        {product.option_groups.map((group) => (
          <div key={group.name} className="summary-block">
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

        <div className="summary-actions">
          <div className="quantity-control">
            <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
              <Icon name="minus" size={16} />
            </button>
            <span>{quantity}</span>
            <button type="button" onClick={() => setQuantity((value) => value + 1)}>
              <Icon name="plus" size={16} />
            </button>
          </div>
          <button type="button" className="primary-action" onClick={addCurrentProduct}>
            {t.addToCart}
          </button>
          <a className="secondary-action" href={buildStorePath(locale, "/collections", region)}>
            {t.continueShopping}
          </a>
        </div>

        <div className="trust-bar">
          <span>{t.freeShipping}</span>
          <span>{t.originalProducts}</span>
          <span>{t.securePayment}</span>
        </div>
      </div>

      <div className="detail-tabs">
        <div className="tab-switcher">
          {["description", "details", "reviews"].map((key) => (
            <button
              key={key}
              type="button"
              className={`tab-switcher-button ${selectedTab === key ? "is-active" : ""}`}
              onClick={() => setSelectedTab(key)}
            >
              {t[key]}
            </button>
          ))}
        </div>
        <div className="tab-panel">
          {selectedTab === "description" ? <p>{product.description}</p> : null}
          {selectedTab === "details" ? (
            <ul>
              {product.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
          {selectedTab === "reviews" ? (
            <div className="review-list">
              {product.reviews.map((review) => (
                <article key={`${review.name}-${review.copy}`} className="product-review-item">
                  <strong>{review.name}</strong>
                  <p>{review.copy}</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
