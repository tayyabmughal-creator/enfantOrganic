"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [removingSlug, setRemovingSlug] = useState("");

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
      setItems((current) =>
        current.filter((item) => slugs.includes(item?.product?.slug)),
      );
    });
    return unsubscribe;
  }, [normalizedRegion]);

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
        <div className="auth-card" style={{ maxWidth: 560 }}>
          <h1 className="account-title" style={{ marginBottom: 0 }}>
            {isAr ? "قائمة المفضلة" : "My Wishlist"}
          </h1>
          <p className="account-sub">
            {isAr
              ? "يرجى تسجيل الدخول لحفظ المنتجات في قائمة المفضلة."
              : "Please sign in to save items to your wishlist."}
          </p>
          <Link href={buildStorePath(locale, "/account", normalizedRegion)} className="primary-action">
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell">
      <div className="account-layout">
        <div className="account-header">
          <div>
            <h1 className="account-title">{isAr ? "قائمة المفضلة" : "My Wishlist"}</h1>
            <p className="account-sub">
              {isAr
                ? "كل المنتجات التي حفظتها للعودة إليها لاحقًا."
                : "Products you have saved for later."}
            </p>
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {items.length === 0 ? (
          <div className="account-section">
            <p className="account-empty">
              {isAr ? "لا توجد منتجات في المفضلة بعد." : "Your wishlist is empty."}
            </p>
            <Link href={buildStorePath(locale, "/collections", normalizedRegion)} className="order-view-link">
              {isAr ? "تصفح المنتجات" : "Browse products"}
            </Link>
          </div>
        ) : (
          <div className="wishlist-grid">
            {items.map((item) => {
              const product = item.product;
              if (!product?.slug) return null;
              const productPath = buildStorePath(locale, `/product/${product.slug}`, normalizedRegion);
              return (
                <article key={item.id} className="wishlist-card">
                  <Link href={productPath} className="wishlist-card-media">
                    <img src={product.image} alt={product.name} loading="lazy" />
                  </Link>
                  <div className="wishlist-card-body">
                    <Link href={productPath}>
                      <h2>{product.name}</h2>
                    </Link>
                    {product.short_description ? <p>{product.short_description}</p> : null}
                    <strong>{formatMoney(product.pricing, locale)}</strong>
                    <div className="wishlist-card-actions">
                      <Link href={productPath} className="order-view-link">
                        {isAr ? "عرض المنتج" : "View product"}
                      </Link>
                      <button
                        type="button"
                        className="secondary-action"
                        disabled={removingSlug === product.slug}
                        onClick={() => handleRemove(product.slug)}
                      >
                        {removingSlug === product.slug
                          ? (isAr ? "جارٍ الحذف..." : "Removing...")
                          : (isAr ? "إزالة" : "Remove")}
                      </button>
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

