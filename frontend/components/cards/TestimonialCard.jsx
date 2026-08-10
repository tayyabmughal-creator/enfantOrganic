export default function TestimonialCard({ testimonial }) {
  const initials = testimonial.name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // The card printed five stars over every review regardless of what the
  // reviewer actually gave it.
  const rating = Math.max(0, Math.min(5, Math.round(Number(testimonial.rating) || 5)));

  return (
    <article className="review-card">
      <div className="review-card-head">
        <div className="review-avatar">{initials}</div>
        <div className="review-card-copy">
          <strong>{testimonial.name}</strong>
          <span>{testimonial.location}</span>
        </div>
        <div className="review-stars" aria-label={`${rating} out of 5`}>
          <span aria-hidden="true">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>
        </div>
      </div>
      <p>{testimonial.quote}</p>
    </article>
  );
}
