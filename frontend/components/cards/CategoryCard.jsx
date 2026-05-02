import Link from "next/link";

export default function CategoryCard({ category, href }) {
  return (
    <Link href={href} className="category-card">
      <div className="category-card-image">
        <img src={category.image} alt={category.name} loading="lazy" />
      </div>
      <div className="category-card-body">
        <h4>{category.name}</h4>
        <p>{category.description}</p>
      </div>
    </Link>
  );
}
