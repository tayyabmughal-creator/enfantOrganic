import Link from "next/link";

import { ReviewMarquee } from "@/components/store/product/ReviewMarquee";

export { ReviewMarquee };

export function StarRow({ rating = 5, size = 16 }) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return (
    <span className="review-star-row" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <svg
          key={index}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={index < full ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

export function ProductReviewShowcase({ showcase, reviewCount, isAr, readMoreHref }) {
  if (!showcase?.images?.length) return null;
  const countText =
    showcase.count_text ||
    (reviewCount > 0 ? (isAr ? `${reviewCount} عميل سعيد` : `${reviewCount} happy customers`) : "");
  const title = showcase.title || (isAr ? "مراجعات حقيقية من عملاء حقيقيين" : "Real reviews from real customers");
  return (
    <section className="product-extra-section review-showcase">
      <header className="review-showcase-head">
        {countText ? (
          <p className="review-showcase-count">
            <StarRow rating={5} size={15} />
            <span>{countText}</span>
          </p>
        ) : null}
        <h3 className="review-showcase-title">{title}</h3>
        {showcase.subtitle ? <p className="review-showcase-subtitle">{showcase.subtitle}</p> : null}
      </header>
      <ReviewMarquee images={showcase.images} label={title} />
      <div className="review-showcase-cta">
        <Link className="review-showcase-btn" href={readMoreHref}>
          {showcase.button || (isAr ? "اقرأ المزيد من المراجعات" : "Read more reviews")}
        </Link>
      </div>
    </section>
  );
}
