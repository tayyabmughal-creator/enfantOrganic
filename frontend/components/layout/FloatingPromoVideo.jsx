"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "enfant-floating-video-dismissed-v1";

export default function FloatingPromoVideo({ videoUrl }) {
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

  if (!videoUrl || !visible) return null;

  const videoType = String(videoUrl).split("?")[0].toLowerCase().endsWith(".webm")
    ? "video/webm"
    : "video/mp4";

  return (
    <aside className="floating-promo-video" aria-label="Floating promotional video">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Promotional video"
      >
        <source src={videoUrl} type={videoType} />
      </video>
      <button
        type="button"
        className="floating-promo-video-close"
        onClick={dismiss}
        aria-label="Close video"
        title="Close video"
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}