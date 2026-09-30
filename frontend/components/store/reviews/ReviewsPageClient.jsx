"use client";

import { useState } from "react";
import Link from "next/link";

import SiteImage from "@/components/ui/SiteImage";
import { StarRow } from "@/components/store/product/ProductReviewShowcase";
import { API_BASE_URL } from "@/lib/config";
import { buildStorePath } from "@/lib/storefront";

export default function ReviewsPageClient({ locale, region, initial, pageSize }) {
  const isAr = locale === "ar";
  const [reviews, setReviews] = useState(Array.isArray(initial?.reviews) ? initial.reviews : []);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(Boolean(initial?.has_next));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadMore() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ locale, region, page: String(page + 1), page_size: String(pageSize) });
      const response = await fetch(`${API_BASE_URL}/reviews/all/?${params.toString()}`);
      if (!response.ok) throw new Error("request failed");
      const data = await response.json();
      setReviews((current) => current.concat(Array.isArray(data.reviews) ? data.reviews : []));
      setPage(data.page || page + 1);
      setHasNext(Boolean(data.has_next));
    } catch {
      setError(isAr ? "تعذّر تحميل المزيد من المراجعات." : "Could not load more reviews.");
    } finally {
      setLoading(false);
    }
  }

  if (!reviews.length) {
    return (
      <p className="reviews-page-empty">
        {isAr ? "لا توجد مراجعات بعد." : "No reviews yet."}
      </p>
    );
  }

  return (
    <>
      <div className="reviews-page-grid">
        {reviews.map((review, index) => {
          const photo = Array.isArray(review.images) ? review.images[0] : "";
          return (
            <article key={`${review.customer_name}-${review.created_at}-${index}`} className="reviews-page-card">
              {photo ? (
                <div className="reviews-page-photo">
                  <SiteImage src={photo} alt="" width={480} height={480} loading="lazy" sizes="(max-width: 700px) 50vw, 25vw" />
                </div>
              ) : null}
              <div className="reviews-page-body">
                <StarRow rating={review.rating} size={14} />
                {review.title ? <h3>{review.title}</h3> : null}
                <p>{review.comment}</p>
                <div className="reviews-page-meta">
                  <strong>{review.customer_name}</strong>
                  {review.is_verified_purchase ? (
                    <span className="reviews-page-verified">{isAr ? "شراء موثّق" : "Verified buyer"}</span>
                  ) : null}
                </div>
                {review.product?.slug ? (
                  <Link className="reviews-page-product" href={buildStorePath(locale, `/product/${review.product.slug}`, region)}>
                    {review.product.name}
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {error ? <p className="reviews-page-error" role="alert">{error}</p> : null}
      {hasNext ? (
        <div className="reviews-page-more">
          <button type="button" className="review-view-all-btn" onClick={loadMore} disabled={loading}>
            {loading ? (isAr ? "جارٍ التحميل…" : "Loading…") : (isAr ? "عرض المزيد" : "Load more reviews")}
          </button>
        </div>
      ) : null}
    </>
  );
}
