"use client";

import { useState } from "react";

export default function Tabs({ items, defaultIndex = 0 }) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const activeItem = items[activeIndex];

  return (
    <div className="tabs">
      <div className="tab-list" role="tablist" aria-label="Product details tabs">
        {items.map((item, index) => (
          <button
            key={item.label}
            aria-selected={activeIndex === index}
            className={`tab-button ${activeIndex === index ? "is-active" : ""}`}
            role="tab"
            type="button"
            onClick={() => setActiveIndex(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {activeItem.content}
      </div>
    </div>
  );
}
