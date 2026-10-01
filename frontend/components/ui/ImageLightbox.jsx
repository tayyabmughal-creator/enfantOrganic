"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import SiteImage from "@/components/ui/SiteImage";

export default function ImageLightbox({ images, index = 0, onClose, closeLabel = "Close", isAr = false }) {
  const [current, setCurrent] = useState(index);
  const count = images.length;
  const step = (delta) => setCurrent((value) => (value + delta + count) % count);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") step(isAr ? -1 : 1);
      else if (event.key === "ArrowLeft") step(isAr ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // step only closes over `count` and setCurrent, both stable for this dialog
  }, [onClose, count, isAr]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!count) return null;

  return createPortal(
    <div className="video-lightbox image-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="video-lightbox-close" onClick={onClose} aria-label={closeLabel}>
        <span aria-hidden="true">×</span>
      </button>
      <div className="image-lightbox-stage" onClick={(event) => event.stopPropagation()}>
        <SiteImage src={images[current]} alt="" width={1400} height={1400} sizes="100vw" priority />
      </div>
      {count > 1 ? (
        <>
          <button
            type="button"
            className="image-lightbox-nav is-prev"
            onClick={(event) => { event.stopPropagation(); step(-1); }}
            aria-label={isAr ? "السابقة" : "Previous"}
          >
            ‹
          </button>
          <button
            type="button"
            className="image-lightbox-nav is-next"
            onClick={(event) => { event.stopPropagation(); step(1); }}
            aria-label={isAr ? "التالية" : "Next"}
          >
            ›
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
