"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SiteImage from "@/components/ui/SiteImage";

export default function CategoryCarousel({ categories, href, locale = "en" }) {
  const railRef = useRef(null);
  const isRtl = locale === "ar";
  // The design shows a plain centred row; arrows only earn their space once the
  // categories actually overflow the rail.
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const measure = () => setScrollable(rail.scrollWidth - rail.clientWidth > 4);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [categories]);

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
      {scrollable ? (
        <button
          type="button"
          className="category-carousel-button"
          onClick={() => scrollByCard(-1)}
          aria-label={isRtl ? "الفئة التالية" : "Previous categories"}
        >
          ‹
        </button>
      ) : null}

      <div className="category-carousel-rail" ref={railRef}>
        {categories.map((category) => (
          <Link key={category.slug} href={categoryHref(category)} className="category-round-card">
            <span className="category-round-image">
              {/* Must track .category-carousel-rail's grid-auto-columns in
                  home.css — clamp(150px, 15vw, 226px), and a quarter of the
                  rail below 640px. Undersizing this had the browser fetch a
                  128w or 256w variant for a card that is 226px wide and 452
                  device pixels on a retina screen, so every category came out
                  soft. */}
              <SiteImage
                src={category.image}
                alt={category.name}
                fill
                sizes="(max-width: 640px) 24vw, (max-width: 1500px) 15vw, 226px"
              />
            </span>
            <span className="category-round-title">{category.name}</span>
          </Link>
        ))}
      </div>

      {scrollable ? (
        <button
          type="button"
          className="category-carousel-button"
          onClick={() => scrollByCard(1)}
          aria-label={isRtl ? "الفئة السابقة" : "Next categories"}
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
