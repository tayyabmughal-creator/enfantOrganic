import Link from "next/link";
import SiteImage from "@/components/ui/SiteImage";

export default function CategoryCard({ category, href }) {
  return (
    <Link href={href} className="category-card">
      <div className="category-card-image">
        <SiteImage
          src={category.image}
          alt={category.name}
          width={300}
          height={230}
          loading="lazy"
          sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
        />
      </div>
      <div className="category-card-body">
        <h4>{category.name}</h4>
        <p>{category.description}</p>
      </div>
    </Link>
  );
}
