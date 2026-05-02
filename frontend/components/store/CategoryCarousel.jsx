"use client";

import { useRef } from "react";
import Link from "next/link";

export default function CategoryCarousel({ categories, href }) {
  const railRef = useRef(null);

  function scrollByCard(direction) {
    const rail = railRef.current;
    if (!rail) return;

    rail.scrollBy({
      left: direction * Math.min(rail.clientWidth * 0.72, 420),
      behavior: "smooth",
    });
  }

  return (
    <div className="category-carousel-shell">
      <button
        type="button"
        className="category-carousel-button"
        onClick={() => scrollByCard(-1)}
        aria-label="Previous categories"
      >
        ‹
      </button>

      <div className="category-carousel-rail" ref={railRef}>
        {categories.map((category) => (
          <Link key={category.slug} href={href} className="category-round-card">
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
        aria-label="Next categories"
      >
        ›
      </button>
    </div>
  );
}
