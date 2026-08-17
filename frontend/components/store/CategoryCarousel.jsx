"use client";

import { useRef } from "react";
import Link from "next/link";
import SiteImage from "@/components/ui/SiteImage";

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
        ‹
      </button>

      <div className="category-carousel-rail" ref={railRef}>
        {categories.map((category) => (
          <Link key={category.slug} href={categoryHref(category)} className="category-round-card">
            <span className="category-round-image">
              {/* Must track .category-carousel-rail's grid-auto-columns in
                  home.css — clamp(148px, 16vw, 200px), and a flat 148px below
                  640px. Declaring 120px had the browser fetch a 128w or 256w
                  variant for a circle that is 200px wide and 400 device pixels
                  on a retina screen, so every category came out soft. */}
              <SiteImage
                src={category.image}
                alt={category.name}
                fill
                sizes="(max-width: 640px) 148px, (max-width: 1250px) 16vw, 200px"
              />
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
        ›
      </button>
    </div>
  );
}
