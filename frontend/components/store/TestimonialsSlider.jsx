"use client";

import { useCallback, useRef } from "react";

import TestimonialCard from "@/components/cards/TestimonialCard";

export default function TestimonialsSlider({ testimonials, locale = "en" }) {
  const railRef = useRef(null);
  const isAr = locale === "ar";

  const scrollByAmount = useCallback((direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const amount = Math.max(280, Math.round(rail.clientWidth * 0.82));
    rail.scrollBy({
      left: direction * amount,
      behavior: "smooth",
    });
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByAmount(isAr ? 1 : -1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByAmount(isAr ? -1 : 1);
    }
  };

  return (
    <div className="review-carousel">
      <div className="review-carousel-controls" aria-hidden={testimonials.length < 2}>
        <button
          className="review-carousel-btn"
          type="button"
          onClick={() => scrollByAmount(isAr ? 1 : -1)}
          aria-label={isAr ? "التقييمات السابقة" : "Previous reviews"}
          disabled={testimonials.length < 2}
        >
          ‹
        </button>
        <button
          className="review-carousel-btn"
          type="button"
          onClick={() => scrollByAmount(isAr ? -1 : 1)}
          aria-label={isAr ? "التقييمات التالية" : "Next reviews"}
          disabled={testimonials.length < 2}
        >
          ›
        </button>
      </div>

      <div
        className="review-grid"
        ref={railRef}
        role="region"
        aria-label={isAr ? "تقييمات العملاء" : "Customer reviews"}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {testimonials.map((testimonial) => (
          <TestimonialCard key={`${testimonial.name}-${testimonial.location}`} testimonial={testimonial} />
        ))}
      </div>
    </div>
  );
}
