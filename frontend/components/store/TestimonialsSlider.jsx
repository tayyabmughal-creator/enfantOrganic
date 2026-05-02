"use client";

import { useRef } from "react";

import TestimonialCard from "@/components/cards/TestimonialCard";

export default function TestimonialsSlider({ testimonials }) {
  const railRef = useRef(null);

  const scrollByAmount = (direction) => {
    railRef.current?.scrollBy({
      left: direction * 380,
      behavior: "smooth",
    });
  };

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div className="section-toolbar">
        <div className="section-heading" style={{ marginBottom: 0 }}>
          <span className="kicker">Testimonials</span>
          <h2 className="section-title">Social proof with space to breathe.</h2>
          <p className="body-lg">
            The slider stays touch-friendly on mobile and reads like premium editorial
            cards on larger screens.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="icon-button" type="button" onClick={() => scrollByAmount(-1)}>
            ←
          </button>
          <button className="icon-button" type="button" onClick={() => scrollByAmount(1)}>
            →
          </button>
        </div>
      </div>

      <div className="scroll-strip" ref={railRef}>
        {testimonials.map((testimonial) => (
          <TestimonialCard key={testimonial.name} testimonial={testimonial} />
        ))}
      </div>
    </div>
  );
}
