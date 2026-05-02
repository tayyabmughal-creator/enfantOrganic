"use client";

import { useRef } from "react";

import Button from "@/components/ui/Button";

export default function CollectionShowcase({ collections }) {
  const railRef = useRef(null);

  const scrollByAmount = (direction) => {
    railRef.current?.scrollBy({
      left: direction * 360,
      behavior: "smooth",
    });
  };

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div className="section-toolbar">
        <div className="section-heading" style={{ marginBottom: 0 }}>
          <span className="kicker">Collections</span>
          <h2 className="section-title">Story-led merchandising blocks.</h2>
          <p className="body-lg">
            Built as horizontal cards so we can reuse them on the homepage,
            collection landers, or seasonal campaigns.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="icon-button" type="button" onClick={() => scrollByAmount(-1)}>
            ←
          </button>
          <button className="icon-button" type="button" onClick={() => scrollByAmount(1)}>
            →
          </button>
        </div>
      </div>

      <div className="scroll-strip" ref={railRef}>
        {collections.map((collection) => (
          <article key={collection.slug} className="showcase-card soft-card">
            <img src={collection.image} alt={collection.name} loading="lazy" />
            <div className="showcase-card-copy">
              <span className="label">{collection.eyebrow}</span>
              <h3 className="card-title" style={{ fontSize: "2rem" }}>{collection.name}</h3>
              <p className="body-md" style={{ color: "rgba(255,255,255,0.84)" }}>
                {collection.description}
              </p>
              <div>
                <Button href="/collections" variant="secondary">
                  Explore collection
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
