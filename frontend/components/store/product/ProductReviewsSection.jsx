"use client";

import { useState } from "react";
import Link from "next/link";

import SiteImage from "@/components/ui/SiteImage";
import ImageLightbox from "@/components/ui/ImageLightbox";
import { ReviewMarquee, StarRow } from "@/components/store/product/ProductReviewShowcase";

const FIRST_BATCH = 4;
const NEXT_BATCH = 20;
const LONG_COMMENT = 220;
const AVATAR_COLORS = ["#d9e8c5", "#f3dccf", "#d6e4f0", "#eadbf0", "#f6e7b8", "#cfe9e1"];

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

const timeOf = (review) => {
  const value = new Date(review.created_at).getTime();
  return Number.isNaN(value) ? 0 : value;
};

export function sortReviews(reviews, sort) {
  const list = [...reviews];
  if (sort === "highest") return list.sort((a, b) => b.rating - a.rating || timeOf(b) - timeOf(a));
  if (sort === "lowest") return list.sort((a, b) => a.rating - b.rating || timeOf(b) - timeOf(a));
  if (sort === "photos") {
    const count = (review) => (Array.isArray(review.images) ? review.images.length : 0);
    return list.sort((a, b) => count(b) - count(a) || timeOf(b) - timeOf(a));
  }
  return list.sort((a, b) => timeOf(b) - timeOf(a));
}

function formatDate(value, isAr) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(isAr ? "ar" : "en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function avatarColor(name) {
  const code = String(name || "?").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
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
  const [sort, setSort] = useState("recent");
  const [ratingFilter, setRatingFilter] = useState(0);
  const [photosOnly, setPhotosOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [lightbox, setLightbox] = useState(null);

  const { counts, total, recommendPercent } = summariseReviews(reviews);
  const heading = isAr ? "التقييمات" : "Reviews";

  const gallery =
    photos?.length
      ? photos
      : Array.from(new Set(reviews.flatMap((review) => (Array.isArray(review.images) ? review.images : [])))).slice(0, 14);

  const filtered = sortReviews(
    reviews.filter(
      (review) =>
        (!ratingFilter || Math.round(Number(review.rating)) === ratingFilter) &&
        (!photosOnly || (Array.isArray(review.images) && review.images.length)),
    ),
    sort,
  );
  const shown = filtered.slice(0, visible);
  const remaining = Math.max(0, filtered.length - visible);
  const filtersActive = ratingFilter !== 0 || photosOnly;

  const resetView = () => setVisible(FIRST_BATCH);
  const clearFilters = () => {
    setRatingFilter(0);
    setPhotosOnly(false);
    resetView();
  };

  const sortOptions = [
    ["recent", isAr ? "الأحدث" : "Most Recent"],
    ["highest", isAr ? "الأعلى تقييمًا" : "Highest Rating"],
    ["lowest", isAr ? "الأقل تقييمًا" : "Lowest Rating"],
    ["photos", isAr ? "مع صور أولًا" : "With Photos First"],
  ];

  return (
    <section className="product-extra-section product-reviews-section" id="reviews">
      <div className={`reviews-top${gallery.length ? " has-gallery" : ""}`}>
        {reviewCount > 0 ? (
          <div className="reviews-top-head">
            <div className="reviews-score-head">
              <strong className="reviews-score-value">{Number(rating || 5).toFixed(1)}</strong>
              <StarRow rating={rating || 5} size={20} />
              <span className="reviews-score-count">
                {isAr ? `بناءً على ${reviewCount} مراجعة` : `Based on ${reviewCount} reviews`}
              </span>
            </div>
            {total > 0 ? (
              <p className="reviews-recommend">
                <strong>{recommendPercent}%</strong>{" "}
                <span>{isAr ? "يوصون بهذا المنتج" : "would recommend this product"}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {reviewCount > 0 && total > 0 ? (
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

        {gallery.length ? (
          <div className="reviews-gallery">
            <ReviewMarquee images={gallery} reverse variant="photo" label={isAr ? "صور العملاء" : "Customer photos"} />
          </div>
        ) : null}
      </div>

      <div className="reviews-tab">
        <span>
          {heading} ({reviewCount || total})
        </span>
      </div>

      <div className="reviews-toolbar">
        <button
          type="button"
          className={`reviews-filter-btn${filtersOpen || filtersActive ? " is-active" : ""}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span>{isAr ? "تصفية" : "Filters"}</span>
        </button>
        <button type="button" className="review-write-btn" onClick={onWrite}>
          {isAr ? "اكتب مراجعة" : "Write a Review"}
        </button>
      </div>

      {filtersOpen ? (
        <div className="reviews-filters">
          <div className="reviews-filter-group" role="group" aria-label={isAr ? "التقييم" : "Rating"}>
            {[0, 5, 4, 3, 2, 1].map((value) => (
              <button
                key={value}
                type="button"
                className={`reviews-chip${ratingFilter === value ? " is-on" : ""}`}
                aria-pressed={ratingFilter === value}
                onClick={() => {
                  setRatingFilter(value);
                  resetView();
                }}
              >
                {value === 0 ? (isAr ? "الكل" : "All") : `${value} ★`}
              </button>
            ))}
          </div>
          <label className="reviews-photos-only">
            <input
              type="checkbox"
              checked={photosOnly}
              onChange={(event) => {
                setPhotosOnly(event.target.checked);
                resetView();
              }}
            />
            <span>{isAr ? "مع صور فقط" : "With photos only"}</span>
          </label>
          {filtersActive ? (
            <button type="button" className="checkout-inline-clear reviews-clear" onClick={clearFilters}>
              {isAr ? "مسح الكل" : "Clear all"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="reviews-subbar">
        <span className="reviews-found">
          {isAr ? `${filtered.length} مراجعة` : `${filtered.length} ${filtered.length === 1 ? "review" : "reviews"}`}
        </span>
        <label className="reviews-sort">
          <span>{isAr ? "ترتيب" : "Sort"}</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              resetView();
            }}
          >
            {sortOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="reviews-list">
        {shown.length ? (
          shown.map((review, index) => {
            const key = `${review.customer_name}-${review.created_at}-${index}`;
            const long = String(review.comment || "").length > LONG_COMMENT;
            const open = Boolean(expanded[key]);
            const images = Array.isArray(review.images) ? review.images : [];
            return (
              <article key={key} className="review-card">
                <span className="review-avatar" style={{ background: avatarColor(review.customer_name) }} aria-hidden="true">
                  {String(review.customer_name || "?").trim().charAt(0).toUpperCase()}
                </span>
                <div className="review-card-main">
                  <div className="review-card-head">
                    <strong>{review.customer_name}</strong>
                    {review.is_verified_purchase ? (
                      <span className="review-verified">{isAr ? "شراء موثّق" : "Verified buyer"}</span>
                    ) : null}
                  </div>
                  <div className="review-card-meta">
                    <StarRow rating={review.rating} size={14} />
                    <time dateTime={review.created_at}>{formatDate(review.created_at, isAr)}</time>
                  </div>
                  {review.title ? <h5>{review.title}</h5> : null}
                  <p className={long && !open ? "is-clamped" : undefined}>{review.comment}</p>
                  {long ? (
                    <button
                      type="button"
                      className="review-read-more"
                      onClick={() => setExpanded((current) => ({ ...current, [key]: !open }))}
                    >
                      {open ? (isAr ? "عرض أقل" : "Show less") : (isAr ? "اقرأ المزيد" : "Read more")}
                    </button>
                  ) : null}
                  {images.length ? (
                    <div className="review-card-photos" aria-label={isAr ? "صور المراجعة" : "Review photos"}>
                      {images.map((image, photoIndex) => (
                        <button
                          key={image}
                          type="button"
                          onClick={() => setLightbox({ images, index: photoIndex })}
                          aria-label={isAr ? "تكبير الصورة" : "Enlarge photo"}
                        >
                          <SiteImage src={image} alt="" width={160} height={160} loading="lazy" sizes="96px" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : reviews.length ? (
          <article className="review-card review-card--empty">
            <p>{isAr ? "لا توجد مراجعات تطابق هذا الاختيار." : "No reviews match these filters."}</p>
            <button type="button" className="checkout-inline-clear" onClick={clearFilters}>
              {isAr ? "مسح الكل" : "Clear all"}
            </button>
          </article>
        ) : editorialReviews.length ? (
          editorialReviews.map((review) => (
            <article key={`${review.name}-${review.copy}`} className="review-card">
              <span className="review-avatar" style={{ background: avatarColor(review.name) }} aria-hidden="true">
                {String(review.name || "?").trim().charAt(0).toUpperCase()}
              </span>
              <div className="review-card-main">
                <div className="review-card-head">
                  <strong>{review.name}</strong>
                </div>
                <p>{review.copy}</p>
              </div>
            </article>
          ))
        ) : (
          <article className="review-card review-card--empty">
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
      ) : filtered.length > FIRST_BATCH ? (
        <button type="button" className="review-view-all-btn" onClick={resetView}>
          {isAr ? "عرض أقل" : "Show Less"}
        </button>
      ) : null}

      {total > 0 && allReviewsHref ? (
        <Link className="review-all-link" href={allReviewsHref}>
          {isAr ? "شاهد مراجعات جميع العملاء" : "See what all our customers say"}
        </Link>
      ) : null}

      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          isAr={isAr}
          closeLabel={isAr ? "إغلاق" : "Close"}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </section>
  );
}
