"use client";

import { useEffect, useRef, useState } from "react";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import { buildAnalyticsItem, pushDataLayerEvent } from "@/lib/analytics";
import { API_BASE_URL, CUSTOMER_TOKEN_KEY } from "@/lib/config";
import { trackEvent } from "@/lib/eventTracking";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";

export default function ProductDetailClient({ locale, product, region }) {
  const { addItem, openCart } = useStore();
  const t = uiText(locale);
  const isAr = locale === "ar";
  const galleryImages = Array.from(
    new Set((product.gallery?.length ? product.gallery : [product.image]).filter(Boolean)),
  );
  const [selectedImage, setSelectedImage] = useState(galleryImages[0] || product.image);
  const [selectedTab, setSelectedTab] = useState("description");
  const [quantity, setQuantity] = useState(1);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notifySubmitting, setNotifySubmitting] = useState(false);
  const [notifySuccess, setNotifySuccess] = useState("");
  const [notifyError, setNotifyError] = useState("");
  const lastTrackedViewItemRef = useRef("");
  const [selectedOptions, setSelectedOptions] = useState(
    Object.fromEntries((product.option_groups || []).map((group) => [group.name, group.values[0]])),
  );
  const isOutOfStock = Boolean(product?.stock_status?.track_inventory) && !Boolean(product?.stock_status?.is_in_stock);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentUrl(window.location.href);
    }
  }, [locale, product.slug, region]);

  useEffect(() => {
    if (!isOutOfStock || typeof window === "undefined") return;
    const token = localStorage.getItem(CUSTOMER_TOKEN_KEY) || "";
    if (!token) return;
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/account/profile/`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (cancelled) return;
        if (payload?.email) {
          setNotifyEmail(String(payload.email));
        }
      } catch {
        // Non-fatal: guests can still enter email manually.
      }
    };
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [isOutOfStock]);

  useEffect(() => {
    const key = `${region}:${product.slug}`;
    if (lastTrackedViewItemRef.current === key) {
      return;
    }
    const item = buildAnalyticsItem(product);
    if (!item) {
      return;
    }
    const didPush = pushDataLayerEvent("view_item", {
      locale,
      region,
      ecommerce: {
        currency: product.pricing?.currency_code || "",
        value: Number(product.pricing?.amount || 0),
        items: [item],
      },
    });
    if (didPush) {
      lastTrackedViewItemRef.current = key;
    }
    // Record a real product_view event for admin funnel analytics.
    trackEvent("product_view", { productSlug: product.slug, regionCode: region });
  }, [locale, product, region]);

  const addCurrentProduct = () => {
    addItem({ ...product, locale }, quantity, selectedOptions);
    openCart();
  };

  const getShareUrl = () => {
    if (currentUrl) {
      return currentUrl;
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}${buildStorePath(locale, `/product/${product.slug}`, region)}`;
    }
    return buildStorePath(locale, `/product/${product.slug}`, region);
  };

  const shareTitle = product.name;

  const openShareLink = (url) => {
    if (typeof window === "undefined") {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyProductLink = async () => {
    const url = getShareUrl();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopyFeedback(isAr ? "تم نسخ رابط المنتج." : "Product link copied.");
    } catch {
      setCopyFeedback(isAr ? "تعذر نسخ الرابط." : "Unable to copy the link.");
    }
    window.setTimeout(() => setCopyFeedback(""), 2200);
  };

  const submitBackInStockRequest = async (event) => {
    event.preventDefault();
    if (notifySubmitting) return;
    setNotifyError("");
    setNotifySuccess("");

    const cleanEmail = String(notifyEmail || "").trim();
    if (!cleanEmail) {
      setNotifyError(isAr ? "يرجى إدخال بريد إلكتروني صالح." : "Please enter a valid email.");
      return;
    }

    setNotifySubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/stock-notify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_slug: product.slug,
          region,
          email: cleanEmail,
          phone: String(notifyPhone || "").trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          data?.email?.[0] ||
          data?.product_slug?.[0] ||
          data?.detail ||
          data?.error ||
          (isAr ? "تعذر حفظ طلب التنبيه الآن." : "Unable to save your notify request right now.");
        setNotifyError(String(detail));
        return;
      }
      setNotifySuccess(
        data?.detail || (isAr ? "تم تسجيل طلبك. سنبلغك فور توفر المنتج." : "You're on the list. We’ll notify you when this product is back."),
      );
    } catch {
      setNotifyError(isAr ? "تعذر حفظ طلب التنبيه الآن." : "Unable to save your notify request right now.");
    } finally {
      setNotifySubmitting(false);
    }
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
          {isOutOfStock ? (
            <div className="product-stock-notify-card">
              <p className="product-stock-notify-title">
                {isAr ? "المنتج غير متوفر حالياً" : "This product is currently out of stock"}
              </p>
              <p className="product-stock-notify-copy">
                {isAr
                  ? "أضف بريدك الإلكتروني وسنخبرك فور توفره."
                  : "Leave your email and we’ll notify you as soon as it’s available."}
              </p>
              <form className="product-stock-notify-form" onSubmit={submitBackInStockRequest}>
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={(event) => setNotifyEmail(event.target.value)}
                  placeholder={isAr ? "البريد الإلكتروني" : "Email address"}
                  autoComplete="email"
                  required
                />
                <input
                  type="tel"
                  value={notifyPhone}
                  onChange={(event) => setNotifyPhone(event.target.value)}
                  placeholder={isAr ? "رقم الهاتف (اختياري)" : "Phone (optional)"}
                  autoComplete="tel"
                />
                <button type="submit" className="primary-action" disabled={notifySubmitting}>
                  {notifySubmitting
                    ? (isAr ? "جارٍ الحفظ..." : "Saving...")
                    : (isAr ? "أخبرني عند التوفر" : "Notify me when available")}
                </button>
              </form>
              {notifySuccess ? <p className="product-stock-notify-success">{notifySuccess}</p> : null}
              {notifyError ? <p className="product-stock-notify-error">{notifyError}</p> : null}
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div className="summary-block product-share-block">
          <h4>{isAr ? "مشاركة المنتج" : "Share this product"}</h4>
          <div className="product-share-actions">
            <button
              type="button"
              className="product-share-button"
              onClick={() => {
                const url = encodeURIComponent(getShareUrl());
                const text = encodeURIComponent(shareTitle);
                openShareLink(`https://wa.me/?text=${text}%20${url}`);
              }}
            >
              WhatsApp
            </button>
            <button
              type="button"
              className="product-share-button"
              onClick={() => {
                const url = encodeURIComponent(getShareUrl());
                openShareLink(`https://www.facebook.com/sharer/sharer.php?u=${url}`);
              }}
            >
              Facebook
            </button>
            <button
              type="button"
              className="product-share-button"
              onClick={() => {
                const url = encodeURIComponent(getShareUrl());
                const text = encodeURIComponent(shareTitle);
                openShareLink(`https://twitter.com/intent/tweet?text=${text}&url=${url}`);
              }}
            >
              X
            </button>
            <button
              type="button"
              className="product-share-button"
              onClick={copyProductLink}
            >
              <Icon name="link" size={14} />
              <span>{isAr ? "نسخ الرابط" : "Copy link"}</span>
            </button>
          </div>
          {copyFeedback ? <p className="product-share-feedback">{copyFeedback}</p> : null}
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
