"use client";

import { useRef } from "react";

import SiteImage from "@/components/ui/SiteImage";

// Swipeable step cards: a photo, a round number badge and, when the step has its own
// words, a frosted caption at the bottom. The arrows are for mouse users on desktop.
export default function ProductHowItWorksRail({ steps, heading, isAr }) {
  const railRef = useRef(null);

  const scroll = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const sign = (isAr ? -1 : 1) * direction;
    rail.scrollBy({ left: sign * rail.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="product-hiw-frame">
      <div className="product-hiw-rail" ref={railRef} tabIndex={0} role="group" aria-label={heading}>
        {steps.map((step, index) => {
          const number = String(index + 1).padStart(2, "0");
          const hasCaption = Boolean(step.title || step.text);
          return (
            <div key={`${step.image}-${index}`} className={`product-hiw-slide${hasCaption ? " has-caption" : ""}`}>
              <SiteImage
                src={step.image}
                alt={isAr ? `${heading} - الخطوة ${index + 1}` : `${heading} - step ${index + 1}`}
                fill
                sizes="(max-width: 640px) 78vw, (max-width: 900px) 45vw, 340px"
              />
              <span className="product-hiw-num" aria-hidden="true">{number}</span>
              {hasCaption ? (
                <div className="product-hiw-caption">
                  <small>{isAr ? `الخطوة ${index + 1}` : `STEP ${index + 1}`}</small>
                  {step.title ? <strong>{step.title}</strong> : null}
                  {step.text ? <p>{step.text}</p> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {steps.length > 1 ? (
        <>
          <span className="product-hiw-hint" aria-hidden="true">
            {isAr ? "اسحب" : "SWIPE"}
          </span>
          <button type="button" className="product-hiw-arrow is-prev" onClick={() => scroll(-1)} aria-label={isAr ? "السابقة" : "Previous"}>
            ‹
          </button>
          <button type="button" className="product-hiw-arrow is-next" onClick={() => scroll(1)} aria-label={isAr ? "التالية" : "Next"}>
            ›
          </button>
        </>
      ) : null}
    </div>
  );
}
