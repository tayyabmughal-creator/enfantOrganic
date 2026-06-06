"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  buildPageViewTrackingKey,
  resolveTrackingRegionCode,
  shouldTrackStorefrontPageView,
  trackEvent,
} from "@/lib/eventTracking";

function StorefrontPageViewTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedKeyRef = useRef("");

  useEffect(() => {
    if (!shouldTrackStorefrontPageView(pathname)) {
      return;
    }

    const trackingKey = buildPageViewTrackingKey(pathname, searchParams);
    if (lastTrackedKeyRef.current === trackingKey) {
      return;
    }

    lastTrackedKeyRef.current = trackingKey;
    trackEvent("page_view", {
      regionCode: resolveTrackingRegionCode(searchParams),
    });
  }, [pathname, searchParams]);

  return null;
}

export default function StorefrontPageViewTracker() {
  return (
    <Suspense fallback={null}>
      <StorefrontPageViewTrackerInner />
    </Suspense>
  );
}
