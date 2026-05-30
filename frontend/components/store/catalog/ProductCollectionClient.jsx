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
  const products = Array.isArray(data?.products) ? data.products : [];
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const tags = Array.isArray(data?.tags) ? data.tags : [];
  const isAr = locale === "ar";
  const searchTerm = String(initialFilters?.search || "").trim();
  const lastTrackedListSignatureRef = useRef("");

  const prices = products
    .map((product) => Number(product?.pricing?.amount || 0))
    .filter((value) => Number.isFinite(value));
  const absoluteMinPrice = prices.length ? Math.min(...prices) : 0;
  const absoluteMaxPrice = prices.length ? Math.max(...prices) : 0;
  const brands = useMemo(
    () => Array.from(new Set(products.map((product) => String(product?.brand || "").trim()).filter(Boolean))).sort(),
    [products],
  );

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
  const [maxPrice, setMaxPrice] = useState(absoluteMaxPrice);

  useEffect(() => {
    setMaxPrice(absoluteMaxPrice);
  }, [absoluteMaxPrice]);

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
    || maxPrice < absoluteMaxPrice
  );

  function resetFilters() {
    setSelectedCategory("all");
    setSelectedTag("all");
    setSelectedBrand("all");
    setAvailability("all");
    setMinRating(0);
    setSortBy("featured");
    setMaxPrice(absoluteMaxPrice);
  }

  const filteredProducts = useMemo(() => {
    return products
      .map((product, index) => ({ product, index }))
      .filter(({ product }) => {
        const productPrice = Number(product?.pricing?.amount || 0);
        const isInStock = (
          !product?.stock_status?.track_inventory
          || Boolean(product?.stock_status?.is_in_stock)
        );
        const matchesCategory = selectedCategory === "all" || product?.category?.slug === selectedCategory;
        const matchesTag = selectedTag === "all" || (product?.tags || []).some((tag) => tag.slug === selectedTag);
        const matchesBrand = selectedBrand === "all" || String(product?.brand || "").trim() === selectedBrand;
        const matchesPrice = productPrice <= maxPrice;
        const matchesAvailability = (
          availability === "all"
          || (availability === "in_stock" && isInStock)
          || (availability === "out_of_stock" && !isInStock)
        );
        const matchesRating = Number(product?.rating || 0) >= minRating;
        return matchesCategory && matchesTag && matchesBrand && matchesPrice && matchesAvailability && matchesRating;
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
  }, [availability, maxPrice, minRating, products, selectedBrand, selectedCategory, selectedTag, sortBy]);

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
  const selectionLabel = `${selectedCategoryName} / ${selectedTagName} / ${selectedBrandName}`;
  const resultsLabel = isAr ? `${filteredProducts.length} منتج` : `${filteredProducts.length} products`;

  const activeChips = [];
  if (selectedCategory !== "all") activeChips.push({ key: "category", label: selectedCategoryName, clear: () => setSelectedCategory("all") });
  if (selectedTag !== "all") activeChips.push({ key: "tag", label: selectedTagName, clear: () => setSelectedTag("all") });
  if (selectedBrand !== "all") activeChips.push({ key: "brand", label: selectedBrandName, clear: () => setSelectedBrand("all") });
  if (availability !== "all") activeChips.push({ key: "availability", label: availabilityLabel, clear: () => setAvailability("all") });
  if (minRating > 0) activeChips.push({ key: "rating", label: isAr ? `${minRating}+ تقييم` : `${minRating}+ rating`, clear: () => setMinRating(0) });
  if (maxPrice < absoluteMaxPrice) activeChips.push({ key: "price", label: `≤ ${formatCatalogPrice(maxPrice)}`, clear: () => setMaxPrice(absoluteMaxPrice) });
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

  return (
    <div className="catalog-layout">
      <aside className="filters-panel">
        <div className="filters-panel-header">
          <div>
            <span>{t.filters}</span>
            <strong>{selectionLabel}</strong>
          </div>
          <button type="button" className="filter-reset-button" onClick={resetFilters} disabled={!hasActiveFilters}>
            {t.reset}
          </button>
        </div>

        <div className="filters-group">
          <div className="filters-group-heading">
            <h4>{t.categories}</h4>
            <span>{categories.length}</span>
          </div>
          <div className="filter-chip-row">
            <button type="button" className={`filter-chip ${selectedCategory === "all" ? "is-active" : ""}`} onClick={() => setSelectedCategory("all")}>
              {t.allProducts}
            </button>
            {categories.map((category) => (
              <button
                key={category.slug}
                type="button"
                className={`filter-chip ${selectedCategory === category.slug ? "is-active" : ""}`}
                onClick={() => setSelectedCategory(category.slug)}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="filters-group">
          <div className="filters-group-heading">
            <h4>{isAr ? "العلامة التجارية" : "Brand"}</h4>
            <span>{brands.length}</span>
          </div>
          <div className="filter-chip-row">
            <button type="button" className={`filter-chip ${selectedBrand === "all" ? "is-active" : ""}`} onClick={() => setSelectedBrand("all")}>
              {isAr ? "كل العلامات" : "All brands"}
            </button>
            {brands.map((brand) => (
              <button
                key={brand}
                type="button"
                className={`filter-chip ${selectedBrand === brand ? "is-active" : ""}`}
                onClick={() => setSelectedBrand(brand)}
              >
                {brand}
              </button>
            ))}
          </div>
        </div>

        <div className="filters-group">
          <div className="filters-group-heading">
            <h4>{t.tags}</h4>
            <span>{tags.length}</span>
          </div>
          <div className="filter-chip-row">
            <button type="button" className={`filter-chip ${selectedTag === "all" ? "is-active" : ""}`} onClick={() => setSelectedTag("all")}>
              {t.viewAll}
            </button>
            {tags.map((tag) => (
              <button
                key={tag.slug}
                type="button"
                className={`filter-chip ${selectedTag === tag.slug ? "is-active" : ""}`}
                onClick={() => setSelectedTag(tag.slug)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>

        <div className="filters-group">
          <div className="filters-group-heading">
            <h4>{isAr ? "التوفر" : "Availability"}</h4>
            <span>{availability === "all" ? "—" : "1"}</span>
          </div>
          <div className="filter-chip-row">
            <button type="button" className={`filter-chip ${availability === "all" ? "is-active" : ""}`} onClick={() => setAvailability("all")}>
              {isAr ? "الكل" : "All"}
            </button>
            <button type="button" className={`filter-chip ${availability === "in_stock" ? "is-active" : ""}`} onClick={() => setAvailability("in_stock")}>
              {isAr ? "متوفر" : "In stock"}
            </button>
            <button type="button" className={`filter-chip ${availability === "out_of_stock" ? "is-active" : ""}`} onClick={() => setAvailability("out_of_stock")}>
              {isAr ? "غير متوفر" : "Out of stock"}
            </button>
          </div>
        </div>

        <div className="filters-group">
          <div className="filters-group-heading">
            <h4>{isAr ? "الحد الأدنى للتقييم" : "Minimum rating"}</h4>
            <span>{minRating > 0 ? `${minRating}+` : "Any"}</span>
          </div>
          <div className="filter-chip-row">
            {[0, 3, 4, 4.5].map((value) => (
              <button
                key={value}
                type="button"
                className={`filter-chip ${minRating === value ? "is-active" : ""}`}
                onClick={() => setMinRating(value)}
              >
                {value === 0 ? (isAr ? "الكل" : "Any") : `${value}+`}
              </button>
            ))}
          </div>
        </div>

        <div className="filters-group">
          <div className="filters-group-heading">
            <h4>{t.price}</h4>
            <span>{formatCatalogPrice(maxPrice)}</span>
          </div>
          <div className="catalog-range-control">
            <input
              type="range"
              min={absoluteMinPrice}
              max={absoluteMaxPrice}
              value={maxPrice}
              onChange={(event) => setMaxPrice(Number(event.target.value))}
              aria-label={t.price}
            />
            <div className="catalog-range-labels">
              <span>{formatCatalogPrice(absoluteMinPrice)}</span>
              <span>{formatCatalogPrice(absoluteMaxPrice)}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="catalog-results">
        <div className="catalog-toolbar">
          <div className="catalog-toolbar-copy">
            <span>{t.products}</span>
            <strong>{resultsLabel}</strong>
            <small>{selectionLabel}</small>
          </div>
          <label className="control-select catalog-sort-select">
            <span className="catalog-sort-label">{t.sortBy}</span>
            <strong>{sortLabels[sortBy]}</strong>
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
