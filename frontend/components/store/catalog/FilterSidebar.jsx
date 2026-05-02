"use client";

export default function FilterSidebar({
  categories,
  tags,
  selectedCategories,
  selectedTags,
  priceCap,
  maxPrice,
  onCategoryToggle,
  onTagToggle,
  onPriceChange,
}) {
  return (
    <aside className="soft-card filter-sidebar">
      <div className="filter-group">
        <span className="label">Categories</span>
        <div className="filter-pill-row">
          {categories.map((category) => {
            const active = selectedCategories.includes(category.slug);

            return (
              <button
                key={category.slug}
                type="button"
                className={`filter-pill ${active ? "is-active" : ""}`}
                onClick={() => onCategoryToggle(category.slug)}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filter-group">
        <span className="label">Price Range</span>
        <input
          aria-label="Maximum price"
          max={maxPrice}
          min="20"
          step="1"
          type="range"
          value={priceCap}
          onChange={(event) => onPriceChange(Number(event.target.value))}
        />
        <div className="range-labels">
          <span className="body-md">$20</span>
          <span className="body-md">Up to ${priceCap}</span>
        </div>
      </div>

      <div className="filter-group">
        <span className="label">Tags</span>
        <div className="chip-row">
          {tags.map((tag) => {
            const active = selectedTags.includes(tag.slug);

            return (
              <button
                key={tag.slug}
                type="button"
                className={`filter-pill ${active ? "is-active" : ""}`}
                onClick={() => onTagToggle(tag.slug)}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
