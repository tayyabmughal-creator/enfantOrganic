"use client";

import { useRef } from "react";

import SiteImage from "@/components/ui/SiteImage";

// A swipeable row of Instagram posts. The arrows only show for mouse users; on a
// phone the row is swiped.
export default function InstagramFeed({ posts, isAr = false }) {
  const railRef = useRef(null);

  const scroll = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const sign = (isAr ? -1 : 1) * direction;
    rail.scrollBy({ left: sign * rail.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="instagram-feed">
      <div className="instagram-rail" ref={railRef}>
        {posts.map((post, index) => (
          <a
            key={`${post.href}-${index}`}
            href={post.href}
            className="instagram-tile"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Instagram ${index + 1}`}
          >
            <SiteImage
              src={post.image}
              alt="Enfant Instagram"
              fill
              loading={index < 4 ? undefined : "lazy"}
              sizes="(max-width: 639px) 62vw, (max-width: 1023px) 33vw, 25vw"
            />
          </a>
        ))}
      </div>
      {posts.length > 4 ? (
        <>
          <button type="button" className="instagram-arrow is-prev" onClick={() => scroll(-1)} aria-label={isAr ? "السابقة" : "Previous"}>
            ‹
          </button>
          <button type="button" className="instagram-arrow is-next" onClick={() => scroll(1)} aria-label={isAr ? "التالية" : "Next"}>
            ›
          </button>
        </>
      ) : null}
    </div>
  );
}
