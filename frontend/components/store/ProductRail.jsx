"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ProductCard from "@/components/cards/ProductCard";

export default function ProductRail({ products, locale, region }) {
  const railRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(products.length > 1);
  const [activeDot, setActiveDot] = useState(0);
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

  function scrollByCard(dir) {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector("article");
    const cardWidth = (card ? card.offsetWidth : 270) + 24;
    rail.scrollBy({ left: (isRtl ? -dir : dir) * cardWidth, behavior: "smooth" });
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
        <div className="product-rail-dots" aria-hidden="true">
          {Array.from({ length: dotCount }, (_, i) => (
            <span key={i} className={`product-rail-dot${i === activeDot ? " is-active" : ""}`} />
          ))}
        </div>
      )}
    </div>
  );
}
