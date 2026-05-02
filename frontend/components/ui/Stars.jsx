import Icon from "@/components/icons/Icon";

export default function Stars({ rating = 5 }) {
  const stars = Array.from({ length: 5 }, (_, index) => index < Math.round(rating));

  return (
    <div style={{ display: "flex", gap: 4, color: "#ffbc4b" }}>
      {stars.map((filled, index) => (
        <span key={index} style={{ opacity: filled ? 1 : 0.3 }}>
          <Icon name="star" size={16} />
        </span>
      ))}
    </div>
  );
}
