"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function videoMimeType(url) {
  return String(url).split("?")[0].toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
}

export default function VideoLightbox({ src, onClose, label = "Video", closeLabel = "Close video" }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="video-lightbox" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <button type="button" className="video-lightbox-close" onClick={onClose} aria-label={closeLabel}>
        <span aria-hidden="true">×</span>
      </button>
      <video
        className="video-lightbox-player"
        autoPlay
        controls
        playsInline
        loop
        onClick={(event) => event.stopPropagation()}
      >
        <source src={src} type={videoMimeType(src)} />
      </video>
    </div>,
    document.body,
  );
}
