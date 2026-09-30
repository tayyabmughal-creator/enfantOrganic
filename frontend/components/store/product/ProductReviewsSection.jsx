"use client";

import { useState } from "react";
import Link from "next/link";

import SiteImage from "@/components/ui/SiteImage";
import { ReviewMarquee, StarRow } from "@/components/store/product/ProductReviewShowcase";

const FIRST_BATCH = 4;
const NEXT_BATCH = 20;

export function summariseReviews(reviews) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((review) => {
    const value = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 5)));
    counts[value] += 1;
  });
  const total = reviews.length;
  const recommended = counts[4] + counts[5];
  return { counts, total, recommendPercent: total ? Math.round((recommended / total) * 100) : 0 };
}

export default function ProductReviewsSection({
  reviews,
  editorialReviews,
  rating,
  reviewCount,
  photos,
  isAr,
  onWrite,
  allReviewsHref,
}) {
  const [visible, setVisible] = useState(FIRST_BATCH);
  const { counts, total, recommendPercent } = summariseReviews(reviews);
  const heading = isAr ? "التقييمات" : "Reviews";

  const strip =
    photos?.length
      ? photos
      : Array.from(new Set(reviews.flatMap((review) => (Array.isArray(review.images) ? review.images : [])))).slice(0, 12);

  const shown = reviews.slice(0, visible);
  const remaining = Math.max(0, total - visible);

  return (
    <section className="product-extra-section product-reviews-section" id="reviews">
      {reviewCount > 0 ? (
        <div className="reviews-score-card">
          <div className="reviews-score-head">
            <strong className="reviews-score-value">{Number(rating || 5).toFixed(1)}</strong>
            <StarRow rating={rating || 5} size={20} />
            <span className="reviews-score-count">
              {isAr ? `بناءً على ${reviewCount} مراجعة` : `Based on ${reviewCount} reviews`}
            </span>
          </div>

          {total > 0 ? (
            <ul className="reviews-bars" aria-label={isAr ? "توزيع التقييمات" : "Rating breakdown"}>
              {[5, 4, 3, 2, 1].map((star) => (
                <li key={star} className="reviews-bar-row">
                  <span className="reviews-bar-label">
                    {star}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </span>
                  <span className="reviews-bar-track">
                    <span className="reviews-bar-fill" style={{ width: `${(counts[star] / total) * 100}%` }} />
                  </span>
                  <span className="reviews-bar-count">{counts[star]}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {total > 0 ? (
            <p className="reviews-recommend">
              <strong>{recommendPercent}%</strong>{" "}
              <span>{isAr ? "يوصون بهذا المنتج" : "would recommend this product"}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <ReviewMarquee images={strip} reverse variant="photo" label={isAr ? "صور العملاء" : "Customer photos"} />

      <div className="reviews-list-head">
        <h3 className="reviews-list-title">
          {heading} ({reviewCount || total})
        </h3>
        <button type="button" className="review-write-btn" onClick={onWrite}>
          {isAr ? "اكتب مراجعة" : "Write a Review"}
        </button>
      </div>

      <div className="reviews-list">
        {shown.length ? (
          shown.map((review, index) => (
            <article key={`${review.customer_name}-${review.created_at}-${index}`} className="product-review-item">
              <div className="product-review-head">
                <strong>{review.customer_name}</strong>
                <StarRow rating={review.rating} size={14} />
              </div>
              {review.title ? <h5>{review.title}</h5> : null}
              <p>{review.comment}</p>
              {Array.isArray(review.images) && review.images.length ? (
                <div className="product-review-images" aria-label={isAr ? "صور المراجعة" : "Review photos"}>
                  {review.images.map((image) => (
                    <SiteImage key={image} src={image} alt="" width={96} height={96} loading="lazy" sizes="96px" />
                  ))}
                </div>
              ) : null}
            </article>
          ))
        ) : editorialReviews.length ? (
          editorialReviews.map((review) => (
            <article key={`${review.name}-${review.copy}`} className="product-review-item">
              <strong>{review.name}</strong>
              <p>{review.copy}</p>
            </article>
          ))
        ) : (
          <article className="product-review-item">
            <strong>{isAr ? "لا توجد مراجعات بعد" : "No reviews yet"}</strong>
            <p>
              {isAr
                ? "كوني أول من يشارك تجربته مع هذا المنتج."
                : "Be the first to share feedback on this product."}
            </p>
          </article>
        )}
      </div>

      {remaining > 0 ? (
        <button type="button" className="review-view-all-btn" onClick={() => setVisible((count) => count + NEXT_BATCH)}>
          {visible === FIRST_BATCH
            ? (isAr ? "قراءة كل المراجعات" : "Read All Reviews")
            : (isAr ? `عرض المزيد (${remaining})` : `Show more (${remaining})`)}
        </button>
      ) : total > FIRST_BATCH ? (
        <button type="button" className="review-view-all-btn" onClick={() => setVisible(FIRST_BATCH)}>
          {isAr ? "عرض أقل" : "Show Less"}
        </button>
      ) : null}

      {total > 0 && allReviewsHref ? (
        <Link className="review-all-link" href={allReviewsHref}>
          {isAr ? "شاهد مراجعات جميع العملاء" : "See what all our customers say"}
        </Link>
      ) : null}
    </section>
  );
}
