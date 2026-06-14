"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ProductCard from "@/components/cards/ProductCard";
import { buildAnalyticsItems, pushDataLayerEvent } from "@/lib/analytics";

export default function ProductRail({
  products,
  locale,
  region,
  listId = "product_rail",
  listName = "Product Rail",
}) {
  const railRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(products.length > 1);
  const [activeDot, setActiveDot] = useState(0);
  const lastTrackedListSignatureRef = useRef("");
  const isRtl = locale === "ar";
  const dotCount = Math.min(products.length, 5);

  const updateState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const scrollLeft = Math.abs(rail.scrollLeft);
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    setCanPrev(scrollLeft > 8);
    setCanNext(scrollLeft < maxScroll - 8);
    if (maxScroll > 0) {
      setActiveDot(Math.round((scrollLeft / maxScroll) * (dotCount - 1)));
    }
  }, [dotCount]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    updateState();
    rail.addEventListener("scroll", updateState, { passive: true });
    const ro = new ResizeObserver(updateState);
    ro.observe(rail);
    return () => {
      rail.removeEventListener("scroll", updateState);
      ro.disconnect();
    };
  }, [updateState]);

  useEffect(() => {
    if (!products.length) {
      return;
    }
    const signature = `${listId}:${products.map((product) => product.slug).join("|")}`;
    if (signature === lastTrackedListSignatureRef.current) {
      return;
    }
    const items = buildAnalyticsItems(products, (product, index) => ({
      index,
      item_list_id: listId,
      item_list_name: listName,
    }));
    const didPush = pushDataLayerEvent("view_item_list", {
      locale,
      region,
      ecommerce: {
        item_list_id: listId,
        item_list_name: listName,
        items,
      },
    });
    if (didPush) {
      lastTrackedListSignatureRef.current = signature;
    }
  }, [listId, listName, locale, products, region]);

  function scrollByCard(dir) {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector("article");
    const cardWidth = (card ? card.offsetWidth : 270) + 24;
    rail.scrollBy({ left: (isRtl ? -dir : dir) * cardWidth, behavior: "smooth" });
  }

  function scrollToDot(dotIndex) {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    const target = (dotIndex / (dotCount - 1)) * maxScroll;
    rail.scrollTo({ left: isRtl ? -target : target, behavior: "smooth" });
  }

  return (
    <div className="product-rail-shell">
      <div className="product-rail-track">
        <button
          type="button"
          className="product-rail-btn"
          onClick={() => scrollByCard(-1)}
          aria-label={isRtl ? "التالي" : "Previous"}
          disabled={!canPrev}
        >
          {isRtl ? "›" : "‹"}
        </button>
        <div className="product-rail" ref={railRef}>
          {products.map((product) => (
            <ProductCard key={product.slug} locale={locale} product={product} region={region} />
          ))}
        </div>
        <button
          type="button"
          className="product-rail-btn"
          onClick={() => scrollByCard(1)}
          aria-label={isRtl ? "السابق" : "Next"}
          disabled={!canNext}
        >
          {isRtl ? "‹" : "›"}
        </button>
      </div>
      {dotCount > 1 && (
        <div className="product-rail-dots">
          {Array.from({ length: dotCount }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to item ${i + 1}`}
              className={`product-rail-dot${i === activeDot ? " is-active" : ""}`}
              onClick={() => scrollToDot(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
