"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import ArtDirectedImage from "@/components/ui/ArtDirectedImage";

const AUTOPLAY_MS = 5000;
// Below this a drag is treated as a tap, so tapping a linked slide still navigates.
const SWIPE_THRESHOLD_PX = 40;

/**
 * Full-bleed image carousel at the top of the homepage.
 *
 * The track is pinned to `direction: ltr` even on Arabic pages: slides are in DOM
 * order and the transform is always negative, so one code path drives both
 * locales. Only the controls mirror, via logical inset properties in CSS.
 */
export default function HeroBannerCarousel({ slides = [], locale = "en" }) {
  const isAr = locale === "ar";
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);
  const dragged = useRef(false);

  const goTo = useCallback((next) => {
    if (count < 1) return;
    setIndex(((next % count) + count) % count);
  }, [count]);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    // Autoplay is a convenience, not the only way through the deck — anyone who
    // has asked for less motion gets a static first slide plus the controls.
    if (typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [count, index, paused]);

  if (count === 0) return null;

  function onTouchStart(event) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    dragged.current = false;
  }

  function onTouchMove(event) {
    if (touchStartX.current === null) return;
    const delta = (event.touches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) dragged.current = true;
  }

  function onTouchEnd(event) {
    if (touchStartX.current === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta < 0) next();
    else prev();
  }

  function onKeyDown(event) {
    // Arrow keys follow the reading direction, so on Arabic pages ← advances.
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (isAr) next(); else prev();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (isAr) prev(); else next();
    }
  }

  return (
    <section
      className="hero-banner"
      aria-roledescription="carousel"
      aria-label={isAr ? "عروض المتجر" : "Store promotions"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="hero-banner-viewport"
        tabIndex={0}
        role="group"
        onKeyDown={onKeyDown}
        // Clears a stale swipe flag on hybrid devices, where a mouse click can
        // follow an earlier touch drag and would otherwise be swallowed.
        onMouseDown={() => { dragged.current = false; }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="hero-banner-track"
          style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
        >
          {slides.map((slide, i) => {
            const active = i === index;
            const image = (
              <ArtDirectedImage
                src={slide.image}
                mobileSrc={slide.image_mobile}
                alt={slide.alt || ""}
                className="hero-banner-img"
                // Only the first slide is the LCP candidate; the rest must not
                // compete with it for bandwidth on the initial load.
                priority={i === 0}
                sizes="100vw"
                mobileSizes="100vw"
              />
            );
            // Already locale/region-resolved by the server — a builder function
            // cannot cross the server/client boundary.
            const href = slide.href || "";
            return (
              <div
                key={slide.id ?? i}
                className="hero-banner-slide"
                aria-hidden={!active}
                aria-roledescription="slide"
                aria-label={`${i + 1} / ${count}`}
              >
                {href ? (
                  <Link
                    href={href}
                    className="hero-banner-link"
                    // A swipe ends on the anchor, so without this every drag on
                    // a linked banner would also count as a click-through.
                    onClick={(e) => { if (dragged.current) e.preventDefault(); }}
                    tabIndex={active ? 0 : -1}
                  >
                    {image}
                  </Link>
                ) : image}
              </div>
            );
          })}
        </div>

        {count > 1 ? (
          <>
            <button
              type="button"
              className="hero-banner-arrow hero-banner-arrow--prev"
              onClick={prev}
              aria-label={isAr ? "الشريحة السابقة" : "Previous slide"}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="hero-banner-arrow hero-banner-arrow--next"
              onClick={next}
              aria-label={isAr ? "الشريحة التالية" : "Next slide"}
            >
              <span aria-hidden="true">›</span>
            </button>

            <div className="hero-banner-dots">
              {slides.map((slide, i) => (
                <button
                  key={slide.id ?? i}
                  type="button"
                  className={`hero-banner-dot${i === index ? " is-active" : ""}`}
                  onClick={() => goTo(i)}
                  aria-label={isAr ? `الشريحة ${i + 1}` : `Slide ${i + 1}`}
                  aria-current={i === index}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
