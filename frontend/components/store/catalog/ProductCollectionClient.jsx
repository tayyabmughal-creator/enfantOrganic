"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import ProductCard from "@/components/cards/ProductCard";
import { buildAnalyticsItems, pushDataLayerEvent } from "@/lib/analytics";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";

const KNOWN_SORT_KEYS = new Set([
  "featured",
  "newest",
  "price-asc",
  "price-desc",
  "best-sellers",
  "rating",
]);

function normalizeOrdering(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "featured";
  if (raw === "newest" || raw === "-id") return "newest";
  if (raw === "price_asc" || raw === "price-asc" || raw === "price_low_to_high") return "price-asc";
  if (raw === "price_desc" || raw === "price-desc" || raw === "price_high_to_low") return "price-desc";
  if (raw === "best_sellers" || raw === "best-sellers" || raw === "bestsellers") return "best-sellers";
  if (raw === "rating" || raw === "rating_desc" || raw === "-rating") return "rating";
  return "featured";
}

export default function ProductCollectionClient({
  data,
  locale,
  region,
  initialFilters = {},
  listingType = "collections",
  emptyState = null,
}) {
  const t = uiText(locale);
  const products = useMemo(() => (Array.isArray(data?.products) ? data.products : []), [data?.products]);
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const tags = Array.isArray(data?.tags) ? data.tags : [];
  const isAr = locale === "ar";
  const searchTerm = String(initialFilters?.search || "").trim();
  const lastTrackedListSignatureRef = useRef("");
  const indexedProducts = useMemo(
    () => products.map((product, index) => ({ product, index })),
    [products],
  );

  const prices = products
    .map((product) => Number(product?.pricing?.amount || 0))
    .filter((value) => Number.isFinite(value));
  const absoluteMinPrice = prices.length ? Math.min(...prices) : 0;
  const absoluteMaxPrice = prices.length ? Math.max(...prices) : 0;
  const brands = useMemo(
    () => Array.from(new Set(products.map((product) => String(product?.brand || "").trim()).filter(Boolean))).sort(),
    [products],
  );

  // Product count per category (across the full catalog, ignoring current filters)
  // so each category row can show how many items it holds.
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const product of products) {
      const cats = product?.categories?.length ? product.categories : (product?.category ? [product.category] : []);
      for (const cat of cats) {
        if (cat?.slug) counts[cat.slug] = (counts[cat.slug] || 0) + 1;
      }
    }
    return counts;
  }, [products]);

  const basePricing = products.find((product) => product.pricing)?.pricing || {};
  const formatCatalogPrice = (amount) => (
    basePricing.currency_code
      ? formatMoney({ ...basePricing, amount, prefix: "" }, locale)
      : String(Math.round(amount))
  );

  const initialSortBy = normalizeOrdering(initialFilters?.ordering);
  const canUseBestSellerSort = (
    listingType === "best-sellers"
    || String(initialFilters?.collection || "").toLowerCase() === "best_sellers"
    || initialSortBy === "best-sellers"
  );

  const [selectedCategory, setSelectedCategory] = useState(String(initialFilters?.category || "all") || "all");
  const [selectedTag, setSelectedTag] = useState(String(initialFilters?.tag || "all") || "all");
  const [selectedBrand, setSelectedBrand] = useState(String(initialFilters?.brand || "all") || "all");
  const [availability, setAvailability] = useState(String(initialFilters?.availability || "all") || "all");
  const [minRating, setMinRating] = useState(Math.max(0, Math.min(5, Number(initialFilters?.rating_min || 0))));
  const [sortBy, setSortBy] = useState(
    initialSortBy === "best-sellers" && !canUseBestSellerSort ? "featured" : initialSortBy,
  );

  // Sync filter state when URL params change (e.g. navigating from header dropdown)
  useEffect(() => {
    setSelectedCategory(String(initialFilters?.category || "all") || "all");
    setSelectedTag(String(initialFilters?.tag || "all") || "all");
    setSelectedBrand(String(initialFilters?.brand || "all") || "all");
    setAvailability(String(initialFilters?.availability || "all") || "all");
    setMinRating(Math.max(0, Math.min(5, Number(initialFilters?.rating_min || 0))));
  }, [
    initialFilters?.category,
    initialFilters?.tag,
    initialFilters?.brand,
    initialFilters?.availability,
    initialFilters?.rating_min,
  ]);
  const [maxPrice, setMaxPrice] = useState(absoluteMaxPrice);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Categories that actually hold products, sorted by product count (richest
  // first) so the most useful ones surface at the top of a long catalog.
  const visibleCategories = useMemo(
    () =>
      categories
        .filter((category) => categoryCounts[category.slug])
        .sort((a, b) => (categoryCounts[b.slug] || 0) - (categoryCounts[a.slug] || 0)),
    [categories, categoryCounts],
  );

  const CATEGORY_PREVIEW_COUNT = 8;

  const priceScopedProducts = useMemo(() => {
    return indexedProducts.filter(({ product }) => {
      const isInStock = (
        !product?.stock_status?.track_inventory
        || Boolean(product?.stock_status?.is_in_stock)
      );
      const productCats = product?.categories?.length ? product.categories : (product?.category ? [product.category] : []);
      const matchesCategory = selectedCategory === "all" || productCats.some((c) => c?.slug === selectedCategory);
      const matchesTag = selectedTag === "all" || (product?.tags || []).some((tag) => tag.slug === selectedTag);
      const matchesBrand = selectedBrand === "all" || String(product?.brand || "").trim() === selectedBrand;
      const matchesAvailability = (
        availability === "all"
        || (availability === "in_stock" && isInStock)
        || (availability === "out_of_stock" && !isInStock)
      );
      const matchesRating = Number(product?.rating || 0) >= minRating;
      return matchesCategory && matchesTag && matchesBrand && matchesAvailability && matchesRating;
    });
  }, [availability, indexedProducts, minRating, selectedBrand, selectedCategory, selectedTag]);

  const scopedPrices = priceScopedProducts
    .map(({ product }) => Number(product?.pricing?.amount || 0))
    .filter((value) => Number.isFinite(value));
  const rangeMinPrice = scopedPrices.length ? Math.min(...scopedPrices) : absoluteMinPrice;
  const rangeMaxPrice = scopedPrices.length ? Math.max(...scopedPrices) : absoluteMaxPrice;
  const hasPriceRange = rangeMaxPrice > rangeMinPrice;
  const priceStep = scopedPrices.some((value) => !Number.isInteger(value)) ? 0.01 : 1;

  useEffect(() => {
    if (!scopedPrices.length) {
      setMaxPrice(absoluteMaxPrice);
      return;
    }
    setMaxPrice((currentValue) => {
      if (!Number.isFinite(currentValue)) return rangeMaxPrice;
      return Math.min(rangeMaxPrice, Math.max(rangeMinPrice, currentValue));
    });
  }, [absoluteMaxPrice, rangeMaxPrice, rangeMinPrice, scopedPrices.length]);

  // Lock body scroll while the mobile filter drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (filtersOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
    return undefined;
  }, [filtersOpen]);

  const sortLabels = isAr
    ? {
        featured: "مميز",
        newest: "الأحدث",
        "price-asc": "السعر: من الأقل إلى الأعلى",
        "price-desc": "السعر: من الأعلى إلى الأقل",
        "best-sellers": "الأكثر مبيعًا",
        rating: "الأعلى تقييمًا",
      }
    : {
        featured: "Featured",
        newest: "Newest",
        "price-asc": "Price: Low to high",
        "price-desc": "Price: High to low",
        "best-sellers": "Best sellers",
        rating: "Top rated",
      };

  const hasActiveFilters = (
    selectedCategory !== "all"
    || selectedTag !== "all"
    || selectedBrand !== "all"
    || availability !== "all"
    || minRating > 0
    || sortBy !== "featured"
    || (hasPriceRange && maxPrice < rangeMaxPrice)
  );

  function resetFilters() {
    setSelectedCategory("all");
    setSelectedTag("all");
    setSelectedBrand("all");
    setAvailability("all");
    setMinRating(0);
    setSortBy("featured");
    setMaxPrice(rangeMaxPrice);
  }

  const filteredProducts = useMemo(() => {
    return priceScopedProducts
      .filter(({ product }) => {
        const productPrice = Number(product?.pricing?.amount || 0);
        const matchesPrice = !Number.isFinite(productPrice) || !hasPriceRange
          ? true
          : productPrice >= rangeMinPrice && productPrice <= maxPrice;
        return matchesPrice;
      })
      .sort((left, right) => {
        if (sortBy === "newest") {
          return right.index - left.index;
        }
        if (sortBy === "price-asc") {
          return Number(left.product?.pricing?.amount || 0) - Number(right.product?.pricing?.amount || 0);
        }
        if (sortBy === "price-desc") {
          return Number(right.product?.pricing?.amount || 0) - Number(left.product?.pricing?.amount || 0);
        }
        if (sortBy === "rating") {
          const ratingDelta = Number(right.product?.rating || 0) - Number(left.product?.rating || 0);
          if (ratingDelta !== 0) return ratingDelta;
          return Number(right.product?.review_count || 0) - Number(left.product?.review_count || 0);
        }
        if (sortBy === "best-sellers") {
          // Preserve backend ranking order for real paid-order best-seller sorting.
          return left.index - right.index;
        }
        return left.index - right.index;
      })
      .map(({ product }) => product);
  }, [hasPriceRange, maxPrice, priceScopedProducts, rangeMinPrice, sortBy]);

  const selectedCategoryName = (
    selectedCategory === "all"
      ? t.allProducts
      : categories.find((category) => category.slug === selectedCategory)?.name || t.allProducts
  );
  const selectedTagName = (
    selectedTag === "all"
      ? t.viewAll
      : tags.find((tag) => tag.slug === selectedTag)?.name || t.viewAll
  );
  const selectedBrandName = selectedBrand === "all" ? (isAr ? "كل العلامات" : "All brands") : selectedBrand;
  const availabilityLabel = (
    availability === "in_stock"
      ? (isAr ? "متوفر فقط" : "In stock only")
      : availability === "out_of_stock"
        ? (isAr ? "غير متوفر" : "Out of stock")
        : (isAr ? "كل الحالات" : "All availability")
  );
  const resultsLabel = isAr ? `${filteredProducts.length} منتج` : `${filteredProducts.length} products`;

  const activeChips = [];
  if (selectedCategory !== "all") activeChips.push({ key: "category", label: selectedCategoryName, clear: () => setSelectedCategory("all") });
  if (selectedTag !== "all") activeChips.push({ key: "tag", label: selectedTagName, clear: () => setSelectedTag("all") });
  if (selectedBrand !== "all") activeChips.push({ key: "brand", label: selectedBrandName, clear: () => setSelectedBrand("all") });
  if (availability !== "all") activeChips.push({ key: "availability", label: availabilityLabel, clear: () => setAvailability("all") });
  if (minRating > 0) activeChips.push({ key: "rating", label: isAr ? `${minRating}+ تقييم` : `${minRating}+ rating`, clear: () => setMinRating(0) });
  if (hasPriceRange && maxPrice < rangeMaxPrice) {
    activeChips.push({ key: "price", label: `≤ ${formatCatalogPrice(maxPrice)}`, clear: () => setMaxPrice(rangeMaxPrice) });
  }
  if (sortBy !== "featured") activeChips.push({ key: "sort", label: sortLabels[sortBy], clear: () => setSortBy("featured") });

  const hasCatalogProducts = products.length > 0;
  const isNewArrivalsPage = listingType === "new-arrivals";
  const isBestSellersPage = listingType === "best-sellers";
  const collectionsHref = buildStorePath(locale, "/collections", region);
  const contactHref = buildStorePath(locale, "/contact", region);

  const emptyTitle = (() => {
    if (hasActiveFilters) {
      if (searchTerm) return isAr ? "لا توجد نتائج مطابقة" : "No products match your search";
      if (selectedCategory !== "all") return isAr ? "لا توجد منتجات ضمن هذه الفئة" : "No products in this category";
      return isAr ? "لا توجد منتجات مطابقة للفلاتر" : "No products match your filters";
    }
    if (emptyState?.title) return emptyState.title;
    if (isNewArrivalsPage) return isAr ? "وصلات جديدة قريبًا" : "New arrivals are coming soon";
    if (isBestSellersPage) return isAr ? "سيتم عرض الأكثر مبيعًا قريبًا" : "Best sellers will appear soon";
    if (!hasCatalogProducts) return isAr ? "يتم تحديث المنتجات لمنطقتك" : "Products are being updated for your region";
    return isAr ? "لا توجد منتجات متاحة الآن" : "No products are available right now";
  })();

  const emptyMessage = (() => {
    if (hasActiveFilters) {
      if (searchTerm) return isAr ? "جرّب كلمات مختلفة أو قم بمسح الفلاتر." : "Try different keywords or clear filters.";
      return isAr ? "جرّب مسح الفلاتر أو تصفح فئة أخرى." : "Try clearing filters or browsing another category.";
    }
    if (emptyState?.message) return emptyState.message;
    if (!hasCatalogProducts) {
      return isAr
        ? "نحدّث التشكيلة بانتظام. يمكنك متابعة التصفح أو التواصل مع فريق الدعم."
        : "We refresh the catalog regularly. You can continue shopping or contact support.";
    }
    return isAr ? "يرجى المحاولة لاحقًا أو تصفح مجموعات أخرى." : "Please check back shortly or browse other collections.";
  })();

  useEffect(() => {
    if (!filteredProducts.length) return;
    const signature = filteredProducts.map((product) => product.slug).join("|");
    if (signature === lastTrackedListSignatureRef.current) return;
    const items = buildAnalyticsItems(filteredProducts, (product, index) => ({
      index,
      item_list_id: "catalog_collection",
      item_list_name: data?.hero?.title || "Collection",
    }));
    const didPush = pushDataLayerEvent("view_item_list", {
      locale,
      region,
      ecommerce: {
        item_list_id: "catalog_collection",
        item_list_name: data?.hero?.title || "Collection",
        items,
      },
    });
    if (didPush) {
      lastTrackedListSignatureRef.current = signature;
    }
  }, [data?.hero?.title, filteredProducts, locale, region]);

  const totalCount = products.length;
  const inStockOnly = availability === "in_stock";

  // Price slider fill percentage for the gradient track.
  const sliderValue = hasPriceRange ? maxPrice : rangeMaxPrice;
  const sliderPct = hasPriceRange && rangeMaxPrice > rangeMinPrice
    ? Math.round(((sliderValue - rangeMinPrice) / (rangeMaxPrice - rangeMinPrice)) * 100)
    : 100;

  const filtersBody = (
    <>
      <div className="cat-filter-head">
        <div>
          <span className="cat-filter-eyebrow">{t.filters}</span>
          <strong>{selectedCategoryName}</strong>
        </div>
        {hasActiveFilters ? (
          <button type="button" className="cat-filter-reset" onClick={resetFilters}>
            {t.reset}
          </button>
        ) : null}
      </div>

      {/* ── Categories ── */}
      <div className="cat-filter-section">
        <h4 className="cat-filter-title">{t.categories}</h4>
        <div className="cat-category-list">
          <button
            type="button"
            className={`cat-category-item ${selectedCategory === "all" ? "is-active" : ""}`}
            onClick={() => setSelectedCategory("all")}
          >
            <span>{t.allProducts}</span>
            <span className="cat-category-count">{totalCount}</span>
          </button>
          {visibleCategories.map((category, index) => {
            // Keep the first N + the active one visible; hide the rest until
            // "Show all" is toggled so the sidebar stays compact.
            const isHidden =
              !showAllCategories
              && index >= CATEGORY_PREVIEW_COUNT
              && selectedCategory !== category.slug;
            if (isHidden) return null;
            return (
              <button
                key={category.slug}
                type="button"
                className={`cat-category-item ${selectedCategory === category.slug ? "is-active" : ""}`}
                onClick={() => setSelectedCategory(category.slug)}
              >
                <span>{category.name}</span>
                <span className="cat-category-count">{categoryCounts[category.slug]}</span>
              </button>
            );
          })}
        </div>
        {visibleCategories.length > CATEGORY_PREVIEW_COUNT ? (
          <button
            type="button"
            className="cat-category-toggle"
            onClick={() => setShowAllCategories((value) => !value)}
          >
            {showAllCategories
              ? (isAr ? "عرض أقل" : "Show less")
              : (isAr ? `عرض الكل (${visibleCategories.length})` : `Show all (${visibleCategories.length})`)}
            <svg viewBox="0 0 12 12" className={`cat-category-toggle-caret ${showAllCategories ? "is-up" : ""}`} aria-hidden="true">
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* ── Price ── */}
      {hasPriceRange ? (
        <div className="cat-filter-section">
          <div className="cat-filter-title-row">
            <h4 className="cat-filter-title">{t.price}</h4>
            <span className="cat-price-value">{formatCatalogPrice(sliderValue)}</span>
          </div>
          <input
            type="range"
            className="cat-price-range"
            min={rangeMinPrice}
            max={rangeMaxPrice}
            step={priceStep}
            value={sliderValue}
            onChange={(event) => setMaxPrice(Number(event.target.value))}
            aria-label={t.price}
            style={{ "--cat-slider-pct": `${sliderPct}%` }}
          />
          <div className="cat-price-labels">
            <span>{formatCatalogPrice(rangeMinPrice)}</span>
            <span>{formatCatalogPrice(rangeMaxPrice)}</span>
          </div>
        </div>
      ) : null}

      {/* ── Availability toggle ── */}
      <div className="cat-filter-section">
        <label className="cat-toggle-row">
          <span className="cat-toggle-label">{isAr ? "المتوفر فقط" : "In stock only"}</span>
          <span className="cat-toggle">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => setAvailability(event.target.checked ? "in_stock" : "all")}
            />
            <span className="cat-toggle-track" aria-hidden="true">
              <span className="cat-toggle-thumb" />
            </span>
          </span>
        </label>
      </div>
    </>
  );

  return (
    <div className="catalog-layout">
      {/* ── Desktop sidebar ── */}
      <aside className="cat-filters-panel">{filtersBody}</aside>

      {/* ── Mobile drawer ── */}
      {filtersOpen ? (
        <div className="cat-filters-overlay" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
      ) : null}
      <aside className={`cat-filters-drawer ${filtersOpen ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-label={isAr ? "فلاتر المنتجات" : "Product filters"}>
        <div className="cat-filters-drawer-head">
          <strong>{t.filters}</strong>
          <button type="button" className="cat-filters-drawer-close" onClick={() => setFiltersOpen(false)} aria-label={isAr ? "إغلاق" : "Close"}>
            ✕
          </button>
        </div>
        <div className="cat-filters-drawer-body">{filtersBody}</div>
        <div className="cat-filters-drawer-foot">
          <button type="button" className="primary-action full-width" onClick={() => setFiltersOpen(false)}>
            {isAr ? `عرض ${filteredProducts.length} منتج` : `Show ${filteredProducts.length} products`}
          </button>
        </div>
      </aside>

      <div className="catalog-results">
        <div className="cat-toolbar">
          <div className="cat-toolbar-count">
            <strong>{resultsLabel}</strong>
            {selectedCategory !== "all" ? <span>{selectedCategoryName}</span> : null}
          </div>
          <div className="cat-toolbar-actions">
            <button type="button" className="cat-mobile-filter-btn" onClick={() => setFiltersOpen(true)}>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="16" height="16">
                <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t.filters}
              {activeChips.length ? <span className="cat-mobile-filter-badge">{activeChips.length}</span> : null}
            </button>
            <label className="cat-sort">
              <span className="cat-sort-label">{t.sortBy}</span>
              <strong>{sortLabels[sortBy]}</strong>
              <svg viewBox="0 0 12 12" className="cat-sort-caret" aria-hidden="true">
                <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <select
                value={sortBy}
                onChange={(event) => {
                  const next = event.target.value;
                  setSortBy(KNOWN_SORT_KEYS.has(next) ? next : "featured");
                }}
              >
                <option value="featured">{sortLabels.featured}</option>
                <option value="newest">{sortLabels.newest}</option>
                <option value="price-asc">{sortLabels["price-asc"]}</option>
                <option value="price-desc">{sortLabels["price-desc"]}</option>
                <option value="rating">{sortLabels.rating}</option>
                {canUseBestSellerSort ? <option value="best-sellers">{sortLabels["best-sellers"]}</option> : null}
              </select>
            </label>
          </div>
        </div>

        {activeChips.length ? (
          <div className="catalog-active-filters" aria-label={isAr ? "الفلاتر النشطة" : "Active filters"}>
            {activeChips.map((chip) => (
              <button key={chip.key} type="button" className="catalog-active-chip" onClick={chip.clear}>
                <span>{chip.label}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="catalog-clear-all-chip" onClick={resetFilters}>
              {isAr ? "مسح الكل" : "Clear all"}
            </button>
          </div>
        ) : null}

        {filteredProducts.length ? (
          <div className="catalog-grid">
            {filteredProducts.map((product) => (
              <ProductCard key={product.slug} locale={locale} product={product} region={region} />
            ))}
          </div>
        ) : (
          <div className="store-empty-state catalog-empty-state">
            <strong>{emptyTitle}</strong>
            <p>{emptyMessage}</p>
            <div className="store-empty-state-actions">
              {hasActiveFilters ? (
                <button type="button" className="secondary-action" onClick={resetFilters}>
                  {isAr ? "مسح الفلاتر" : "Clear filters"}
                </button>
              ) : (
                <Link href={collectionsHref} className="secondary-action">
                  {t.continueShopping}
                </Link>
              )}
              <Link href={contactHref} className="secondary-action">
                {isAr ? "تواصل مع الدعم" : "Contact support"}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
