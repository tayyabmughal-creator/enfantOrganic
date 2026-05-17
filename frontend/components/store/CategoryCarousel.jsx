"use client";

import { useRef } from "react";
import Link from "next/link";

export default function CategoryCarousel({ categories, href, locale = "en" }) {
  const railRef = useRef(null);
  const isRtl = locale === "ar";

  function scrollByCard(direction) {
    const rail = railRef.current;
    if (!rail) return;

    rail.scrollBy({
      left: (isRtl ? -direction : direction) * Math.min(rail.clientWidth * 0.72, 420),
      behavior: "smooth",
    });
  }

  function categoryHref(category) {
    if (!href) return "#";
    const base = href.split("?")[0];
    const existing = href.includes("?") ? "&" + href.split("?")[1] : "";
    return `${base}?category=${category.slug}${existing}`;
  }

  return (
    <div className="category-carousel-shell">
      <button
        type="button"
        className="category-carousel-button"
        onClick={() => scrollByCard(-1)}
        aria-label={isRtl ? "الفئة التالية" : "Previous categories"}
      >
        {isRtl ? "›" : "‹"}
      </button>

      <div className="category-carousel-rail" ref={railRef}>
        {categories.map((category) => (
          <Link key={category.slug} href={categoryHref(category)} className="category-round-card">
            <span className="category-round-image">
              <img src={category.image} alt={category.name} loading="lazy" />
            </span>
            <span className="category-round-title">{category.name}</span>
          </Link>
        ))}
      </div>

      <button
        type="button"
        className="category-carousel-button"
        onClick={() => scrollByCard(1)}
        aria-label={isRtl ? "الفئة السابقة" : "Next categories"}
      >
        {isRtl ? "‹" : "›"}
      </button>
    </div>
  );
}
