"use client";

/**
 * Fires a single page_view analytics event when the component mounts.
 * Used in server-rendered pages that have no other client component to
 * host the useEffect.
 *
 * Props:
 *   regionCode {string} - the active region code ("om", "ae", "sa")
 */

import { useEffect } from "react";
import { trackEvent } from "@/lib/eventTracking";

export default function PageViewTracker({ regionCode }) {
  useEffect(() => {
    trackEvent("page_view", { regionCode: regionCode || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
