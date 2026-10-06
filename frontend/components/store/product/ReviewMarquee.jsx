"use client";

import { useEffect, useRef } from "react";

import SiteImage from "@/components/ui/SiteImage";

const SPEED_PX_PER_SECOND = 36;
const RESUME_AFTER_MS = 1200;

// A strip of designer-made images that keeps drifting sideways and can also be
// swiped (or dragged with a mouse) forwards and back. The list is rendered twice,
// so when the scroll position passes one copy it is shifted back by exactly that
// width and the loop never shows a seam. A swipe pauses the drift; it picks up
// again from wherever the visitor left it. `reverse` drifts the other way, so two
// strips on one page never move in lockstep.
export function ReviewMarquee({ images, reverse = false, label, variant = "card" }) {
  const scrollerRef = useRef(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const direction = reverse ? -1 : 1;
    const half = () => el.scrollWidth / 2;
    const wrap = (x) => {
      const h = half();
      if (h <= 0) return x;
      if (x >= h) return x - h;
      if (x < 0) return x + h;
      return x;
    };

    let position = reverse ? half() - 1 : 0;
    el.scrollLeft = position;
    let frame = 0;
    let last = performance.now();
    let held = false; // finger/mouse down or hovering on desktop
    let resumeAt = 0; // a swipe keeps the drift paused a moment after release
    let drag = null;

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduceMotion && !held && now >= resumeAt && el.scrollWidth > el.clientWidth) {
        position = wrap(position + direction * SPEED_PX_PER_SECOND * dt);
        el.scrollLeft = position;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // the visitor's own scrolling (swipe, momentum, wheel, drag) becomes the new position
    const onScroll = () => {
      if (Math.abs(el.scrollLeft - position) > 1) {
        const wrapped = wrap(el.scrollLeft);
        if (wrapped !== el.scrollLeft) el.scrollLeft = wrapped;
        position = wrapped;
        resumeAt = performance.now() + RESUME_AFTER_MS;
      }
    };
    const hold = () => {
      held = true;
    };
    const release = () => {
      held = false;
      resumeAt = performance.now() + RESUME_AFTER_MS;
    };

    // mouse: drag to scroll, like a finger on a phone
    const onPointerDown = (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      drag = { x: event.clientX, start: el.scrollLeft };
      el.classList.add("is-dragging");
    };
    const onPointerMove = (event) => {
      if (!drag) return;
      el.scrollLeft = drag.start - (event.clientX - drag.x);
    };
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      el.classList.remove("is-dragging");
      resumeAt = performance.now() + RESUME_AFTER_MS;
    };
    const onMouseEnter = () => {
      held = true;
    };
    const onMouseLeave = () => {
      endDrag();
      release();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("touchend", release, { passive: true });
    el.addEventListener("touchcancel", release, { passive: true });
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) {
      el.addEventListener("mouseenter", onMouseEnter);
      el.addEventListener("mouseleave", onMouseLeave);
    }

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", hold);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      el.removeEventListener("mouseenter", onMouseEnter);
      el.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [reverse, images?.length]);

  if (!images?.length) return null;
  return (
    <div
      ref={scrollerRef}
      // scroll offsets are always measured left-to-right, in Arabic pages too
      dir="ltr"
      className={`review-marquee review-marquee--${variant}${reverse ? " is-reverse" : ""}`}
      role="group"
      aria-label={label}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="review-marquee-track">
        {[0, 1].map((copy) => (
          <ul key={copy} className="review-marquee-list" aria-hidden={copy === 1 ? "true" : undefined}>
            {images.map((image, index) => (
              <li key={`${copy}-${index}`} className="review-marquee-item">
                <SiteImage src={image} alt="" width={360} height={480} loading="lazy" sizes="(min-width: 1024px) 304px, 272px" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

export default ReviewMarquee;
