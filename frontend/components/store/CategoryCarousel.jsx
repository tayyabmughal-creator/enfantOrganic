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
  // Dots, one per screenful. The arrows are hidden on phones, so a rail showing
  // four of a dozen categories looked like the whole set — nothing said there
  // was anything to swipe to.
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const measure = () => {
      setScrollable(rail.scrollWidth - rail.clientWidth > 4);
      setPageCount(rail.clientWidth ? Math.ceil(rail.scrollWidth / rail.clientWidth) : 0);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [categories]);

  function onRailScroll() {
    const rail = railRef.current;
    if (!rail || !rail.clientWidth) return;
    // Math.abs: RTL rails scroll negative from the right edge.
    setPage(Math.round(Math.abs(rail.scrollLeft) / rail.clientWidth));
  }

  // Assigning scrollLeft rather than scrollTo({behavior:"smooth"}): on a rail
  // with scroll-snap-type Chrome drops smooth programmatic scrolls outright —
  // whether asked for in the call or through CSS scroll-behavior — and nothing
  // moves. That is why the arrows here never worked on this rail either.
  function scrollByCard(direction) {
    const rail = railRef.current;
    if (!rail) return;

    rail.scrollLeft +=
      (isRtl ? -direction : direction) * Math.min(rail.clientWidth * 0.72, 420);
  }

  function goToPage(index) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollLeft = (isRtl ? -1 : 1) * index * rail.clientWidth;
    // Set here as well as from the scroll handler so the tapped dot lights up
    // immediately rather than after the rail has settled on a snap point.
    setPage(index);
  }

  function categoryHref(category) {
    if (!href) return "#";
    const base = href.split("?")[0];
    const existing = href.includes("?") ? "&" + href.split("?")[1] : "";
    return `${base}?category=${category.slug}${existing}`;
  }

  return (
    <>
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

      <div className="category-carousel-rail" ref={railRef} onScroll={onRailScroll}>
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

    {scrollable && pageCount > 1 ? (
      <div className="category-carousel-dots">
        {Array.from({ length: pageCount }, (_, index) => (
          <button
            key={index}
            type="button"
            className={`category-carousel-dot${index === page ? " is-active" : ""}`}
            aria-label={isRtl ? `الصفحة ${index + 1}` : `Category page ${index + 1}`}
            aria-current={index === page}
            onClick={() => goToPage(index)}
          />
        ))}
      </div>
    ) : null}
    </>
  );
}
