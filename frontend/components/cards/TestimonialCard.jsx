export default function TestimonialCard({ testimonial }) {
  const initials = testimonial.name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="review-card">
      <div className="review-card-head">
        <div className="review-avatar">{initials}</div>
        <div className="review-card-copy">
          <strong>{testimonial.name}</strong>
          <span>{testimonial.location}</span>
        </div>
        <div className="review-stars">★★★★★</div>
      </div>
      <p>{testimonial.quote}</p>
    </article>
  );
}
