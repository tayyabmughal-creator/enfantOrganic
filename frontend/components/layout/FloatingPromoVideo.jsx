"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "enfant-floating-reference-video-dismissed";

export default function FloatingPromoVideo() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.sessionStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // The close control still works when browser storage is unavailable.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="floating-promo-video" aria-label="Reference baby skincare video">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/videos/reference-baby-skincare-poster.jpg"
        aria-label="Sample video of a mother applying moisturizer to her baby"
      >
        <source src="/videos/reference-baby-skincare.mp4" type="video/mp4" />
      </video>
      <span className="floating-promo-video-label">Sample footage</span>
      <button
        type="button"
        className="floating-promo-video-close"
        onClick={dismiss}
        aria-label="Close sample video"
        title="Close sample video"
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}