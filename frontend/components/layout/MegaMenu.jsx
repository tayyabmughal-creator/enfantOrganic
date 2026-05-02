import Link from "next/link";

export default function MegaMenu({ categories, collections, open }) {
  return (
    <div className={`mega-menu surface-panel ${open ? "is-open" : ""}`}>
      <div className="mega-grid">
        <div className="mega-column">
          <span className="label">Core Categories</span>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href="/collections"
              className="soft-card"
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: 16,
                padding: 12,
                alignItems: "center",
              }}
            >
              <div className="image-frame" style={{ borderRadius: 20, aspectRatio: "1 / 1" }}>
                <img src={category.image} alt={category.name} loading="lazy" />
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <strong>{category.name}</strong>
                <span className="body-md">{category.description}</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mega-column">
          <span className="label">Curated Collections</span>
          {collections.map((collection) => (
            <Link key={collection.slug} href="/collections" className="mega-card">
              <img src={collection.image} alt={collection.name} loading="lazy" />
              <div className="mega-card-content">
                <span className="label">{collection.eyebrow}</span>
                <strong style={{ fontSize: "1.5rem" }}>{collection.name}</strong>
                <span className="body-md" style={{ color: "rgba(255,255,255,0.82)" }}>
                  {collection.description}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
