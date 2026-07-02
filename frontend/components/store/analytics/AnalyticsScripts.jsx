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
const META_SCRIPT_ID = "enfant-meta-pixel-script";
const SNAPCHAT_SCRIPT_ID = "enfant-snapchat-pixel-script";
const TIKTOK_SCRIPT_ID = "enfant-tiktok-pixel-script";

const ENV_GTM_ID = String(process.env.NEXT_PUBLIC_GTM_ID || "").trim();
const ENV_GA4_ID = String(process.env.NEXT_PUBLIC_GA4_ID || "").trim();
const ENV_META_PIXEL_ID = String(process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();
const ENV_SNAPCHAT_PIXEL_ID = String(process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID || "").trim();
const ENV_TIKTOK_PIXEL_ID = String(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "").trim();

// Shared helper — import this wherever you need to fire Meta Pixel events.
// eventID in params enables Conversions API server-side deduplication.
export function fbqTrack(event, params) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (params) {
      const { event_id: eventID, ...rest } = params;
      if (eventID) {
        window.fbq("track", event, rest, { eventID });
      } else {
        window.fbq("track", event, rest);
      }
    } else {
      window.fbq("track", event);
    }
  }
}

// Shared helper for Snapchat Pixel events.
export function snaptrTrack(event, params) {
  if (typeof window !== "undefined" && typeof window.snaptr === "function") {
    if (params) {
      window.snaptr("track", event, params);
    } else {
      window.snaptr("track", event);
    }
  }
}

// Shared helper for TikTok Pixel events.
// event_id in params enables TikTok Events API server-side deduplication.
export function ttqTrack(event, params) {
  if (typeof window === "undefined" || typeof window.ttq?.track !== "function") return;
  if (params) {
    const { event_id: eventId, ...rest } = params;
    if (eventId) {
      window.ttq.track(event, rest, { event_id: eventId });
    } else {
      window.ttq.track(event, rest);
    }
  } else {
    window.ttq.track(event);
  }
}

function loadGtm(gtmId) {
  if (!gtmId || typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__gtmInjected || document.getElementById(GTM_SCRIPT_ID)) return;
  window.__gtmInjected = true;
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

function loadMetaPixel(pixelId) {
  if (!pixelId || typeof window === "undefined" || typeof document === "undefined") return;
  window.__metaPixelIds = window.__metaPixelIds || new Set();
  if (!window.fbq) {
    window.fbq = function fbq() {
      window.fbq.callMethod
        ? window.fbq.callMethod.apply(window.fbq, arguments)
        : window.fbq.queue.push(arguments);
    };
    window._fbq = window.fbq;
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = "2.0";
    window.fbq.queue = [];
  }
  if (!document.getElementById(META_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = META_SCRIPT_ID;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  if (!window.__metaPixelIds.has(pixelId)) {
    window.fbq("init", pixelId);
    window.__metaPixelIds.add(pixelId);
  }
}

// Adapted from the official TikTok Pixel snippet: builds the ttq command queue
// so events can be fired before events.js finishes loading.
function loadTikTokPixel(pixelId) {
  if (!pixelId || typeof window === "undefined" || typeof document === "undefined") return;
  window.TiktokAnalyticsObject = "ttq";
  if (!window.ttq) {
    const ttq = (window.ttq = []);
    ttq.methods = [
      "page", "track", "identify", "instances", "debug", "on", "off", "once",
      "ready", "alias", "group", "enableCookie", "disableCookie",
      "holdConsent", "revokeConsent", "grantConsent",
    ];
    ttq.setAndDefer = function setAndDefer(target, method) {
      target[method] = function deferred() {
        target.push([method].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (const method of ttq.methods) ttq.setAndDefer(ttq, method);
    ttq.instance = function instance(id) {
      const inst = ttq._i?.[id] || [];
      for (const method of ttq.methods) ttq.setAndDefer(inst, method);
      return inst;
    };
  }
  window.__tiktokPixelIds = window.__tiktokPixelIds || new Set();
  if (!window.__tiktokPixelIds.has(pixelId)) {
    window.__tiktokPixelIds.add(pixelId);
    const ttq = window.ttq;
    ttq._i = ttq._i || {};
    ttq._i[pixelId] = [];
    ttq._i[pixelId]._u = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._t = ttq._t || {};
    ttq._t[pixelId] = +new Date();
    ttq._o = ttq._o || {};
    ttq._o[pixelId] = {};
  }
  if (!document.getElementById(TIKTOK_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = TIKTOK_SCRIPT_ID;
    script.async = true;
    script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`;
    document.head.appendChild(script);
  }
}

function loadSnapchatPixel(pixelId) {
  if (!pixelId || typeof window === "undefined" || typeof document === "undefined") return;
  if (!window.snaptr) {
    window.snaptr = function snaptr() {
      window.snaptr.handleRequest
        ? window.snaptr.handleRequest.apply(window.snaptr, arguments)
        : window.snaptr.queue.push(arguments);
    };
    window.snaptr.queue = [];
  }
  if (!document.getElementById(SNAPCHAT_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = SNAPCHAT_SCRIPT_ID;
    script.async = true;
    script.src = "https://sc-static.net/scevent.min.js";
    document.head.appendChild(script);
  }
  if (window.__snapchatPixelId !== pixelId) {
    window.snaptr("init", pixelId, {});
    window.__snapchatPixelId = pixelId;
  }
}

export default function AnalyticsScripts({ settings = {} }) {
  const [consentState, setConsentState] = useState(CONSENT_STATES.UNSET);
  const pathname = usePathname();
  const gtmId = String(settings?.google_tag_manager_id || ENV_GTM_ID || "").trim();
  const ga4Id = String(settings?.google_analytics_id || ENV_GA4_ID || "").trim();
  const metaPixelId = String(settings?.facebook_pixel_id || ENV_META_PIXEL_ID || "").trim();
  const snapchatPixelId = String(settings?.snapchat_pixel_id || ENV_SNAPCHAT_PIXEL_ID || "").trim();
  const tiktokPixelId = String(settings?.tiktok_pixel_id || ENV_TIKTOK_PIXEL_ID || "").trim();

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

  useEffect(() => {
    if (metaPixelId) loadMetaPixel(metaPixelId);
    if (snapchatPixelId) loadSnapchatPixel(snapchatPixelId);
    if (tiktokPixelId) loadTikTokPixel(tiktokPixelId);
  }, [metaPixelId, snapchatPixelId, tiktokPixelId]);

  // Fire PageView on every Next.js client-side navigation (SPA route change).
  useEffect(() => {
    if (metaPixelId && typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
    if (snapchatPixelId && typeof window !== "undefined" && typeof window.snaptr === "function") {
      window.snaptr("track", "PAGE_VIEW");
    }
    if (tiktokPixelId && typeof window !== "undefined" && typeof window.ttq?.page === "function") {
      window.ttq.page();
    }
  }, [metaPixelId, pathname, snapchatPixelId, tiktokPixelId]);

  useEffect(() => {
    if (consentState !== CONSENT_STATES.GRANTED) return;
    if (gtmId) { loadGtm(gtmId); return; }
    if (ga4Id) { loadGa4(ga4Id); }
  }, [consentState, ga4Id, gtmId]);

  return null;
}
