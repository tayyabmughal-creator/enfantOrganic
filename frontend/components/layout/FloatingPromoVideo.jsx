"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import VideoLightbox from "@/components/ui/VideoLightbox";

const DISMISS_KEY = "enfant-floating-video-dismissed-v1";

export default function FloatingPromoVideo({ videoUrl }) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef(null);
  const collapse = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    try {
      setVisible(window.sessionStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (expanded) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [expanded]);

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
        ref={videoRef}
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
        className="floating-promo-video-open"
        onClick={() => setExpanded(true)}
        aria-label="Play video with sound"
        title="Play video with sound"
      />
      <button
        type="button"
        className="floating-promo-video-close"
        onClick={dismiss}
        aria-label="Close video"
        title="Close video"
      >
        <span aria-hidden="true">×</span>
      </button>
      {expanded ? <VideoLightbox src={videoUrl} onClose={collapse} label="Promotional video" /> : null}
    </aside>
  );
}