"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ProductCard from "@/components/cards/ProductCard";
import { buildAnalyticsItems, pushDataLayerEvent } from "@/lib/analytics";
import { uiText } from "@/lib/storefront";

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
        <div className="filters-group">
          <h4>{t.categories}</h4>
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
          <h4>{t.tags}</h4>
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
          <h4>{t.price}</h4>
          <input
            type="range"
            min="0"
            max={absoluteMaxPrice}
            value={maxPrice}
            onChange={(event) => setMaxPrice(Number(event.target.value))}
          />
        </div>
      </aside>

      <div className="catalog-results">
        <div className="catalog-toolbar">
          <span>{filteredProducts.length} products</span>
          <label className="control-select">
            <select value={sortBy} onChange={(event) => setSortBy(sortKeys.includes(event.target.value) ? event.target.value : "featured")}>
              <option value="featured">{t.sortBy}: {sortLabels.featured}</option>
              <option value="price-asc">{t.sortBy}: {sortLabels["price-asc"]}</option>
              <option value="price-desc">{t.sortBy}: {sortLabels["price-desc"]}</option>
              <option value="reviews">{t.sortBy}: {sortLabels.reviews}</option>
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
