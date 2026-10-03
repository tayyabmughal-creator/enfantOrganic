"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import SiteImage from "@/components/ui/SiteImage";
import { StarRow } from "@/components/store/product/ProductReviewShowcase";

function timeAgo(value, isAr) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const days = Math.max(0, Math.round((Date.now() - time) / 86400000));
  const formatter = new Intl.RelativeTimeFormat(isAr ? "ar" : "en", { numeric: "auto" });
  if (days < 1) return formatter.format(0, "day");
  if (days < 30) return formatter.format(-days, "day");
  if (days < 365) return formatter.format(-Math.round(days / 30), "month");
  return formatter.format(-Math.round(days / 365), "year");
}

// Photo viewer for customer review photos: the photo and a thumbnail strip on one
// side, the review it belongs to on the other. `items` is [{ src, review }]; a photo
// that has no review behind it (a designer-made strip image) simply shows the photo.
export default function ReviewPhotoLightbox({
  items,
  index = 0,
  onClose,
  isAr = false,
  productName = "",
  productImage = "",
}) {
  const [current, setCurrent] = useState(index);
  const stripRef = useRef(null);
  const closeRef = useRef(null);
  const count = items.length;
  const step = (delta) => setCurrent((value) => (value + delta + count) % count);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
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

  useEffect(() => {
    // scrollIntoView on the thumb moves only the strip (the page behind is locked)
    // and, unlike scrollTo math on offsetLeft, behaves the same in RTL.
    stripRef.current
      ?.querySelector(".review-lightbox-thumb.is-active")
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current]);

  if (!count) return null;
  const item = items[current];
  const review = item.review;

  return createPortal(
    <div className="review-lightbox" onClick={onClose}>
      <div
        className={`review-lightbox-dialog${review ? "" : " is-photo-only"}`}
        role="dialog"
        aria-modal="true"
        aria-label={isAr ? "صورة العميل" : "Customer photo"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="review-lightbox-media">
          <span className="review-lightbox-counter">
            {current + 1} / {count}
          </span>
          <div className="review-lightbox-stage">
            <SiteImage src={item.src} alt="" width={1400} height={1400} sizes="(max-width: 860px) 100vw, 60vw" priority />
          </div>
          {count > 1 ? (
            <div className="review-lightbox-strip-row">
              <button
                type="button"
                className="review-lightbox-nav"
                onClick={() => step(-1)}
                aria-label={isAr ? "السابقة" : "Previous"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="review-lightbox-chevron is-prev">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
              <div className="review-lightbox-strip" ref={stripRef}>
                {items.map((entry, position) => (
                  <button
                    key={`${entry.src}-${position}`}
                    type="button"
                    className={`review-lightbox-thumb${position === current ? " is-active" : ""}`}
                    onClick={() => setCurrent(position)}
                    aria-label={`${isAr ? "صورة" : "Photo"} ${position + 1}`}
                    aria-current={position === current ? "true" : undefined}
                  >
                    <SiteImage src={entry.src} alt="" width={160} height={160} loading="lazy" sizes="80px" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="review-lightbox-nav"
                onClick={() => step(1)}
                aria-label={isAr ? "التالية" : "Next"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="review-lightbox-chevron is-next">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>

        {review ? (
          <aside className="review-lightbox-panel">
            <div className="review-lightbox-panel-top">
              <StarRow rating={review.rating} size={18} />
              <span className="review-lightbox-ago">{timeAgo(review.created_at, isAr)}</span>
            </div>
            <div className="review-lightbox-who">
              <strong>{review.customer_name}</strong>
              {review.is_verified_purchase ? (
                <span className="review-lightbox-verified">
                  {isAr ? "مشترٍ موثّق" : "Verified Buyer"}
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="11" fill="currentColor" />
                    <polyline points="7 12.5 10.5 16 17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : null}
            </div>
            {productName ? (
              <div className="review-lightbox-product">
                {productImage ? (
                  <SiteImage src={productImage} alt="" width={120} height={120} loading="lazy" sizes="56px" />
                ) : null}
                <div>
                  <small>{isAr ? "تقييم لمنتج" : "REVIEWING"}</small>
                  <span>{productName}</span>
                </div>
              </div>
            ) : null}
            {review.title ? <h4 className="review-lightbox-title">{review.title}</h4> : null}
            <p className="review-lightbox-comment">{review.comment}</p>
          </aside>
        ) : null}

        <button
          type="button"
          className="review-lightbox-close"
          onClick={onClose}
          ref={closeRef}
          aria-label={isAr ? "إغلاق" : "Close"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
