"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  ANALYTICS_CONSENT_EVENT,
  CONSENT_STATES,
  ensureDataLayer,
  getConsentState,
} from "@/lib/analytics";

const GTM_SCRIPT_ID = "enfant-gtm-script";
const GA4_SCRIPT_ID = "enfant-ga4-script";

const GTM_ID = String(process.env.NEXT_PUBLIC_GTM_ID || "").trim();
const GA4_ID = String(process.env.NEXT_PUBLIC_GA4_ID || "").trim();
const META_PIXEL_ID = String(process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();

// Shared helper — import this wherever you need to fire Meta Pixel events.
export function fbqTrack(event, params) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (params) {
      window.fbq("track", event, params);
    } else {
      window.fbq("track", event);
    }
  }
}

function loadGtm(gtmId) {
  if (!gtmId || typeof window === "undefined" || typeof document === "undefined") return;
  if (document.getElementById(GTM_SCRIPT_ID)) return;
  ensureDataLayer();
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.id = GTM_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(script);
}

function loadGa4(ga4Id) {
  if (!ga4Id || typeof window === "undefined" || typeof document === "undefined") return;
  if (document.getElementById(GA4_SCRIPT_ID)) return;
  ensureDataLayer();
  const script = document.createElement("script");
  script.id = GA4_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`;
  document.head.appendChild(script);
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", ga4Id);
}

export default function AnalyticsScripts() {
  const [consentState, setConsentState] = useState(CONSENT_STATES.UNSET);
  const pathname = usePathname();

  useEffect(() => {
    ensureDataLayer();
    setConsentState(getConsentState());
    const handleConsent = () => setConsentState(getConsentState());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    window.addEventListener("storage", handleConsent);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
      window.removeEventListener("storage", handleConsent);
    };
  }, []);

  // Fire PageView on every Next.js client-side navigation (SPA route change).
  useEffect(() => {
    if (META_PIXEL_ID && typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [pathname]);

  useEffect(() => {
    if (consentState !== CONSENT_STATES.GRANTED) return;
    if (GTM_ID) { loadGtm(GTM_ID); return; }
    if (GA4_ID) { loadGa4(GA4_ID); }
  }, [consentState]);

  return null;
}
