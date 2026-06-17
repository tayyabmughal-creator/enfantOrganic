"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import {
  fetchWishlistItems,
  hasWishlistSession,
  removeWishlistProduct,
  subscribeWishlist,
} from "@/lib/wishlist";
import { buildStorePath, formatMoney, normalizeRegion } from "@/lib/storefront";

export default function WishlistClient({ locale, region }) {
  const isAr = locale === "ar";
  const normalizedRegion = normalizeRegion(region);
  const { addItem, flyToCart, openQuickView } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [removingSlug, setRemovingSlug] = useState("");
  const [cartingSlug, setCartingSlug] = useState("");
  const [addedSlug, setAddedSlug] = useState("");

  const loadWishlist = useCallback(async () => {
    setError("");
    setRequiresLogin(false);

    if (!hasWishlistSession()) {
      setItems([]);
      setRequiresLogin(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const responseItems = await fetchWishlistItems({ locale, region: normalizedRegion });
      setItems(responseItems);
    } catch (loadError) {
      if (loadError?.code === "AUTH_REQUIRED") {
        setItems([]);
        setRequiresLogin(true);
      } else {
        setError(
          isAr
            ? "تعذر تحميل المفضلة الآن. حاول مرة أخرى."
            : "Unable to load your wishlist right now. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [isAr, locale, normalizedRegion]);

  useEffect(() => {
    void loadWishlist();
  }, [loadWishlist]);

  useEffect(() => {
    const unsubscribe = subscribeWishlist((detail) => {
      if (detail?.region !== normalizedRegion) return;
      const slugs = Array.isArray(detail?.slugs) ? detail.slugs : [];
      setItems((current) => {
        const currentSlugs = current
          .map((item) => item?.product?.slug)
          .filter(Boolean);
        const nextSlugSet = new Set(slugs);
        const hasIncomingItems = slugs.some((slug) => !currentSlugs.includes(slug));

        if (hasIncomingItems) {
          void loadWishlist();
          return current;
        }

        return current.filter((item) => nextSlugSet.has(item?.product?.slug));
      });
    });
    return unsubscribe;
  }, [loadWishlist, normalizedRegion]);

  async function handleRemove(slug) {
    if (!slug || removingSlug) return;
    setRemovingSlug(slug);
    setError("");
    try {
      await removeWishlistProduct(slug, { locale, region: normalizedRegion });
      setItems((current) => current.filter((item) => item?.product?.slug !== slug));
    } catch (removeError) {
      if (removeError?.code === "AUTH_REQUIRED") {
        setRequiresLogin(true);
        setItems([]);
      } else {
        setError(
          isAr
            ? "تعذر إزالة المنتج من المفضلة."
            : "Unable to remove this product from wishlist.",
        );
      }
    } finally {
      setRemovingSlug("");
    }
  }

  function handleAddToCart(product, event) {
    if (!product?.slug || cartingSlug) return;

    const hasVariants = Boolean(product.has_variants || (product.variants || []).length);
    const hasOptions = hasVariants || (product.option_groups || []).some(
      (group) => Array.isArray(group?.values) && group.values.length > 1,
    );

    setCartingSlug(product.slug);
    setAddedSlug("");

    try {
      if (hasOptions) {
        if (hasVariants && typeof window !== "undefined") {
          window.location.assign(buildStorePath(locale, `/product/${product.slug}`, normalizedRegion));
          return;
        }
        openQuickView({ ...product, locale, region: normalizedRegion });
        return;
      }

      addItem({ ...product, locale }, 1, {});
      flyToCart(event?.currentTarget);
      setAddedSlug(product.slug);
      window.setTimeout(() => {
        setAddedSlug((current) => (current === product.slug ? "" : current));
      }, 2200);
    } finally {
      setCartingSlug("");
    }
  }

  const itemCount = items.length;
  const totalValue = items.reduce(
    (sum, item) => sum + (Number(item?.product?.pricing?.amount) || 0),
    0,
  );
  const saleCount = items.filter((item) => {
    const amount = Number(item?.product?.pricing?.amount) || 0;
    const compareAmount = Number(item?.product?.pricing?.compare_amount) || 0;
    return compareAmount > amount;
  }).length;

  const heroTitle = isAr ? "قائمة المفضلة" : "Wishlist";
  const heroSubtitle = isAr
    ? "منتجاتك المحفوظة في مكان أنيق وواضح لتعود إليها وتكمل الشراء بسهولة."
    : "A polished view of everything you have saved, ready to compare, revisit, and add to bag.";
  const browseHref = buildStorePath(locale, "/collections", normalizedRegion);
  const accountHref = buildStorePath(locale, "/account", normalizedRegion);

  if (loading) {
    return (
      <section className="section-shell">
        <div className="account-loading">
          <span className="btn-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      </section>
    );
  }

  if (requiresLogin) {
    return (
      <section className="section-shell">
        <div className="wishlist-state-card wishlist-state-card-login">
          <div className="wishlist-state-icon">
            <Icon name="heart" size={26} />
          </div>
          <div className="wishlist-state-copy">
            <span className="wishlist-eyebrow">{isAr ? "قائمة محفوظة" : "Saved for later"}</span>
            <h1 className="account-title" style={{ marginBottom: 0 }}>
              {heroTitle}
            </h1>
            <p className="account-sub">
              {isAr
                ? "سجّل الدخول لعرض المنتجات المحفوظة، تنظيم اختياراتك، والعودة إليها في أي وقت."
                : "Sign in to view your saved products, keep choices organized, and pick up where you left off."}
            </p>
          </div>
          <div className="wishlist-state-actions">
            <Link href={accountHref} className="primary-action">
              {isAr ? "تسجيل الدخول" : "Sign in"}
            </Link>
            <Link href={browseHref} className="secondary-action">
              {isAr ? "تصفح المنتجات" : "Browse products"}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell">
      <div className="account-layout wishlist-layout">
        <div className="wishlist-hero">
          <div className="wishlist-hero-copy">
            <span className="wishlist-eyebrow">
              {isAr ? "منتجاتك المختارة" : "Your curated shortlist"}
            </span>
            <h1 className="account-title">{heroTitle}</h1>
            <p className="account-sub wishlist-hero-sub">{heroSubtitle}</p>
          </div>

          <div className="wishlist-hero-panel">
            <div className="wishlist-kpis">
              <div className="wishlist-kpi">
                <span>{isAr ? "المنتجات المحفوظة" : "Saved items"}</span>
                <strong>{itemCount}</strong>
              </div>
              <div className="wishlist-kpi">
                <span>{isAr ? "إجمالي القيمة" : "Total value"}</span>
                <strong>
                  {formatMoney(
                    {
                      amount: totalValue,
                      currency_code: items[0]?.product?.pricing?.currency_code || "OMR",
                      prefix: items[0]?.product?.pricing?.prefix || "",
                    },
                    locale,
                  )}
                </strong>
              </div>
              <div className="wishlist-kpi">
                <span>{isAr ? "عروض متاحة" : "On offer"}</span>
                <strong>{saleCount}</strong>
              </div>
            </div>
            <div className="wishlist-hero-note">
              <Icon name="sparkle" size={16} />
              <p>
                {isAr
                  ? "كل منتج محفوظ هنا جاهز للمراجعة السريعة أو الإضافة المباشرة إلى السلة."
                  : "Every saved product is ready for a quick review or a direct add to cart."}
              </p>
            </div>
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {items.length === 0 ? (
          <div className="wishlist-state-card">
            <div className="wishlist-state-icon">
              <Icon name="leaf" size={26} />
            </div>
            <div className="wishlist-state-copy">
              <h2>{isAr ? "قائمتك فارغة حاليًا" : "Your wishlist is empty"}</h2>
              <p className="account-empty">
                {isAr
                  ? "ابدأ بحفظ المنتجات التي تنال إعجابك لتبقى مرتبة وجاهزة للرجوع إليها لاحقًا."
                  : "Start saving products you love so they stay organized and easy to revisit later."}
              </p>
            </div>
            <div className="wishlist-state-actions">
              <Link href={browseHref} className="primary-action">
                {isAr ? "استكشف المنتجات" : "Explore products"}
              </Link>
              <Link href={buildStorePath(locale, "/best-sellers", normalizedRegion)} className="secondary-action">
                {isAr ? "الأكثر مبيعًا" : "Best sellers"}
              </Link>
            </div>
          </div>
        ) : (
          <div className="wishlist-grid">
            {items.map((item) => {
              const product = item.product;
              if (!product?.slug) return null;
              const productPath = buildStorePath(locale, `/product/${product.slug}`, normalizedRegion);
              const hasVariants = Boolean(product.has_variants || (product.variants || []).length);
              const hasOptions = hasVariants || (product.option_groups || []).some(
                (group) => Array.isArray(group?.values) && group.values.length > 1,
              );
              const amount = Number(product.pricing?.amount) || 0;
              const compareAmount = Number(product.pricing?.compare_amount) || 0;
              const hasDiscount = compareAmount > amount;
              const stockStatus = product.stock_status || {};
              const isOutOfStock = stockStatus.track_inventory && !stockStatus.is_in_stock;
              const isLowStock = stockStatus.track_inventory && stockStatus.is_in_stock && stockStatus.is_low_stock;
              const chips = [
                product.vendor || product.category?.name,
                ...(product.tags || []).map((tag) => tag.name).filter(Boolean),
                product.unit,
              ]
                .filter(Boolean)
                .filter((value, index, array) => array.indexOf(value) === index)
                .slice(0, 3);

              return (
                <article key={item.id} className="wishlist-card">
                  <Link href={productPath} className="wishlist-card-media">
                    <div className="wishlist-card-badges">
                      {hasDiscount ? (
                        <span className="wishlist-card-badge wishlist-card-badge-sale">
                          {isAr ? "عرض" : "Sale"}
                        </span>
                      ) : null}
                      {isOutOfStock ? (
                        <span className="wishlist-card-badge wishlist-card-badge-stock is-out">
                          {isAr ? "غير متوفر" : "Out of stock"}
                        </span>
                      ) : isLowStock ? (
                        <span className="wishlist-card-badge wishlist-card-badge-stock is-low">
                          {isAr ? "كمية محدودة" : "Low stock"}
                        </span>
                      ) : null}
                    </div>
                    <img src={product.image} alt={product.name} loading="lazy" />
                  </Link>
                  <div className="wishlist-card-body">
                    {chips.length ? (
                      <div className="wishlist-card-chips">
                        {chips.map((chip) => (
                          <span key={chip} className="wishlist-chip">{chip}</span>
                        ))}
                      </div>
                    ) : null}
                    <Link href={productPath} className="wishlist-card-title-link">
                      <h2>{product.name}</h2>
                    </Link>
                    {product.short_description ? <p>{product.short_description}</p> : null}
                    {!hasVariants ? (
                      <div className="wishlist-card-pricing">
                        <strong>{formatMoney(product.pricing, locale)}</strong>
                        {hasDiscount ? (
                          <span>
                            {formatMoney(
                              { ...product.pricing, amount: compareAmount, prefix: "" },
                              locale,
                            )}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {addedSlug === product.slug ? (
                      <div className="wishlist-card-feedback">
                        <Icon name="bag" size={15} />
                        <span>{isAr ? "تمت إضافة المنتج إلى السلة" : "Added to cart"}</span>
                      </div>
                    ) : null}
                    <div className="wishlist-card-actions">
                      <button
                        type="button"
                        className="primary-action wishlist-card-primary"
                        disabled={cartingSlug === product.slug || isOutOfStock}
                        onClick={(event) => handleAddToCart(product, event)}
                      >
                        <Icon name={hasOptions ? "sparkle" : "bag"} size={16} />
                        {isOutOfStock
                          ? (isAr ? "غير متوفر حاليًا" : "Currently unavailable")
                          : cartingSlug === product.slug
                            ? (isAr ? "جارٍ التحديث..." : "Updating...")
                            : hasOptions
                              ? (isAr ? "اختر الخيارات" : "Choose options")
                              : (isAr ? "أضف إلى السلة" : "Add to cart")}
                      </button>
                      <div className="wishlist-card-secondary-actions">
                        <Link href={productPath} className="order-view-link">
                          {isAr ? "عرض المنتج" : "View product"}
                        </Link>
                        <button
                          type="button"
                          className="wishlist-card-remove"
                          disabled={removingSlug === product.slug}
                          onClick={() => handleRemove(product.slug)}
                        >
                          {removingSlug === product.slug
                            ? (isAr ? "جارٍ الحذف..." : "Removing...")
                            : (isAr ? "إزالة" : "Remove")}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
