"use client";

import { useCallback, useState } from "react";

import VideoLightbox, { videoMimeType } from "@/components/ui/VideoLightbox";

export default function ProductVideoTile({ src, label, closeLabel }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button type="button" className="product-video-tile" onClick={() => setOpen(true)} aria-label={label}>
        <video autoPlay muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1}>
          <source src={src} type={videoMimeType(src)} />
        </video>
        <span className="product-video-tile-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
          </svg>
        </span>
      </button>
      {open ? <VideoLightbox src={src} onClose={close} label={label} closeLabel={closeLabel} /> : null}
    </>
  );
}
