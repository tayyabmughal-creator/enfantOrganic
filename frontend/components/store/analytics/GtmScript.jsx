"use client";

import { useEffect, useState } from "react";
import { hasConsent, ANALYTICS_CONSENT_EVENT } from "@/lib/analytics";

/**
 * Config-driven GTM/GA4 script injection.
 * Only loads if NEXT_PUBLIC_GTM_ID is set.
 * Waits for explicit consent before injecting the script.
 */
export default function GtmScript() {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID || "";
  const [consentGranted, setConsentGranted] = useState(false);

  useEffect(() => {
    // Check initial consent state
    if (typeof window !== "undefined" && hasConsent()) {
      setConsentGranted(true);
    }

    // Listen for consent changes
    const handleConsent = (e) => {
      if (e.detail?.state === "granted") {
        setConsentGranted(true);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
      return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    }
  }, []);

  useEffect(() => {
    if (!gtmId || !consentGranted || typeof window === "undefined") return;

    // Prevent double-injection
    if (window.__gtmInjected) return;
    window.__gtmInjected = true;

    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      "gtm.start": new Date().getTime(),
      event: "gtm.js",
    });

    // Inject GTM script
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
    document.head.appendChild(script);

    // Inject noscript iframe fallback
    const noscript = document.createElement("noscript");
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);
  }, [gtmId, consentGranted]);

  return null;
}
