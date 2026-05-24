"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ProductCard from "@/components/cards/ProductCard";
import { buildAnalyticsItems, pushDataLayerEvent } from "@/lib/analytics";
import { formatMoney, uiText } from "@/lib/storefront";

const sortKeys = ["featured", "price-asc", "price-desc", "reviews"];

export default function ProductCollectionClient({ data, locale, region }) {
  const t = uiText(locale);
  const absoluteMaxPrice = Math.max(
    0,
    ...data.products.map((product) => product.pricing?.amount || 0),
  );
  const sortLabels =
    locale === "ar"
      ? {
          featured: "مميز",
          "price-asc": "السعر: من الأقل إلى الأعلى",
          "price-desc": "السعر: من الأعلى إلى الأقل",
          reviews: "الأكثر مراجعة",
        }
      : {
          featured: "Featured",
          "price-asc": "Price: Low to high",
          "price-desc": "Price: High to low",
          reviews: "Most reviewed",
        };
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [sortBy, setSortBy] = useState("featured");
  const [maxPrice, setMaxPrice] = useState(absoluteMaxPrice);
  const lastTrackedListSignatureRef = useRef("");
  const basePricing = data.products.find((product) => product.pricing)?.pricing || {};
  const formatCatalogPrice = (amount) => (
    basePricing.currency_code
      ? formatMoney({ ...basePricing, amount, prefix: "" }, locale)
      : String(Math.round(amount))
  );
  const hasActiveFilters =
    selectedCategory !== "all" ||
    selectedTag !== "all" ||
    sortBy !== "featured" ||
    maxPrice < absoluteMaxPrice;
  const selectedCategoryName =
    selectedCategory === "all"
      ? t.allProducts
      : data.categories.find((category) => category.slug === selectedCategory)?.name || t.allProducts;
  const selectedTagName =
    selectedTag === "all"
      ? t.viewAll
      : data.tags.find((tag) => tag.slug === selectedTag)?.name || t.viewAll;
  const priceCapLabel = formatCatalogPrice(maxPrice);
  const maxPriceLabel = formatCatalogPrice(absoluteMaxPrice);
  const selectionLabel = `${selectedCategoryName} / ${selectedTagName}`;

  function resetFilters() {
    setSelectedCategory("all");
    setSelectedTag("all");
    setSortBy("featured");
    setMaxPrice(absoluteMaxPrice);
  }

  const filteredProducts = useMemo(() => {
    const nextProducts = data.products
      .filter((product) => {
        const matchesCategory =
          selectedCategory === "all" || product.category.slug === selectedCategory;
        const matchesTag =
          selectedTag === "all" || product.tags.some((tag) => tag.slug === selectedTag);
        const matchesPrice = (product.pricing?.amount || 0) <= maxPrice;
        return matchesCategory && matchesTag && matchesPrice;
      })
      .sort((left, right) => {
        if (sortBy === "price-asc") {
          return (left.pricing?.amount || 0) - (right.pricing?.amount || 0);
        }

        if (sortBy === "price-desc") {
          return (right.pricing?.amount || 0) - (left.pricing?.amount || 0);
        }

        if (sortBy === "reviews") {
          return right.review_count - left.review_count;
        }

        return right.review_count - left.review_count;
      });

    return nextProducts;
  }, [data.products, maxPrice, selectedCategory, selectedTag, sortBy]);
  const resultsLabel =
    locale === "ar"
      ? `${filteredProducts.length} منتج`
      : `${filteredProducts.length} products`;

  useEffect(() => {
    if (!filteredProducts.length) {
      return;
    }
    const signature = filteredProducts.map((product) => product.slug).join("|");
    if (signature === lastTrackedListSignatureRef.current) {
      return;
    }
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
          <button
            type="button"
            className="filter-reset-button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
          >
            {t.reset}
          </button>
        </div>

        <div className="filters-group">
          <div className="filters-group-heading">
            <h4>{t.categories}</h4>
            <span>{data.categories.length}</span>
          </div>
          <div className="filter-chip-row">
            <button
              type="button"
              className={`filter-chip ${selectedCategory === "all" ? "is-active" : ""}`}
              onClick={() => setSelectedCategory("all")}
            >
              {t.allProducts}
            </button>
            {data.categories.map((category) => (
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
            <h4>{t.tags}</h4>
            <span>{data.tags.length}</span>
          </div>
          <div className="filter-chip-row">
            <button
              type="button"
              className={`filter-chip ${selectedTag === "all" ? "is-active" : ""}`}
              onClick={() => setSelectedTag("all")}
            >
              {t.viewAll}
            </button>
            {data.tags.map((tag) => (
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
            <h4>{t.price}</h4>
            <span>{priceCapLabel}</span>
          </div>
          <div className="catalog-range-control">
            <input
              type="range"
              min="0"
              max={absoluteMaxPrice}
              value={maxPrice}
              onChange={(event) => setMaxPrice(Number(event.target.value))}
              aria-label={t.price}
            />
            <div className="catalog-range-labels">
              <span>{formatCatalogPrice(0)}</span>
              <span>{maxPriceLabel}</span>
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
              onChange={(event) => setSortBy(sortKeys.includes(event.target.value) ? event.target.value : "featured")}
            >
              <option value="featured">{sortLabels.featured}</option>
              <option value="price-asc">{sortLabels["price-asc"]}</option>
              <option value="price-desc">{sortLabels["price-desc"]}</option>
              <option value="reviews">{sortLabels.reviews}</option>
            </select>
          </label>
        </div>
        <div className="catalog-grid">
          {filteredProducts.map((product) => (
            <ProductCard key={product.slug} locale={locale} product={product} region={region} />
          ))}
        </div>
      </div>
    </div>
  );
}
