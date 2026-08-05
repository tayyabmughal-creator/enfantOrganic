"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  ANALYTICS_CONSENT_EVENT,
  CONSENT_STATES,
  ensureDataLayer,
  getConsentState,
} from "@/lib/analytics";
import {
  buildMetaEventId,
  isRelayableMetaEvent,
  relayMetaEvent,
} from "@/lib/metaCapi";
import { getOrCreateSessionKey } from "@/lib/eventTracking";
import { readStoredRegion } from "@/lib/regionResolver";
import { DEFAULT_REGION, parseLocaleRegionFromPath } from "@/lib/storefront-core/routing";

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
//
// Besides firing the Pixel, this relays the event to our backend for
// server-side delivery through the Conversions API. Both copies carry the same
// event_id, which is what tells Meta they are one conversion and not two.
//
// The ID is minted here rather than at each call site precisely so the two
// copies cannot drift apart: a mismatched pair would be counted twice, and
// double-counted purchases train Meta's optimiser on volume that never existed.
//
// capiOptions carries what the Pixel cannot: { userData, regionCode }. Purchase
// is never relayed from the browser — the server sends it from the order record
// so its value cannot be forged.
export function fbqTrack(event, params, capiOptions = {}) {
  const { event_id: providedId, ...rest } = params || {};
  const eventID =
    providedId || (isRelayableMetaEvent(event) ? buildMetaEventId(event) : "");

  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    if (params) {
      if (eventID) {
        window.fbq("track", event, rest, { eventID });
      } else {
        window.fbq("track", event, rest);
      }
    } else {
      window.fbq("track", event);
    }
  }

  if (eventID) {
    relayMetaEvent(event, {
      eventId: eventID,
      customData: rest,
      userData: capiOptions.userData || {},
      regionCode: capiOptions.regionCode || "",
    });
  }
}

/**
 * The matching data every visitor has, from the first page view onwards.
 *
 * Events Manager's "Set up manual advanced matching" error is raised when the
 * Pixel is initialised with no matching parameters at all. Checkout supplies
 * email and phone, but that is a fraction of a percent of page views, so the
 * dataset still counted as having none. These two are knowable on every visit
 * and neither is PII:
 *
 * - `external_id` — the storefront's own anonymous session id, the same value
 *   the CAPI relay sends, so the browser and server copies of an event describe
 *   the same visitor.
 * - `country` — om/ae/sa are ISO 3166-1 alpha-2 codes and a visitor on a
 *   regional store is in that market by definition.
 *
 * Read from `window.location` rather than taken as an argument because the
 * Pixel loads from an effect that must not re-run on every navigation.
 */
function baselineMetaMatching() {
  if (typeof window === "undefined") return {};
  const parsed = parseLocaleRegionFromPath(window.location.pathname);
  const data = {
    external_id: getOrCreateSessionKey(),
    country: parsed?.region || readStoredRegion() || DEFAULT_REGION,
  };
  // Storage can be blocked, and then there is no session id to send.
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value));
}

/**
 * Attach known customer details to the Pixel as manual advanced matching.
 *
 * Events Manager flagged this dataset for having none (2026-08-02): without it
 * Meta cannot tie a visitor to a real account, so attribution and targeting
 * both suffer. Meta hashes these values in the browser before they are sent —
 * we pass them raw on purpose, since pre-hashing here would break that.
 *
 * Re-calling init with the same pixel ID updates the matching data rather than
 * registering a second pixel. It *replaces* it, though, so the baseline is
 * merged back in — otherwise identifying a customer at checkout would drop the
 * external_id that ties their events to the server-side copies.
 */
export function setMetaAdvancedMatching(userData) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  // The pixel ID is admin-managed and only known to this module, so it is read
  // back from where loadMetaPixel recorded it. That keeps callers — checkout in
  // particular — from having to plumb site settings through just to do this.
  const pixelId = window.__metaPrimaryPixelId || "";
  if (!pixelId || !userData) return;
  const payload = Object.fromEntries(
    Object.entries(userData).filter(([, value]) => value),
  );
  if (Object.keys(payload).length === 0) return;
  window.fbq("init", pixelId, { ...baselineMetaMatching(), ...payload });
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
    // Hard-disable Meta's automatic event detection (SubscribedButtonClick /
    // inferred purchases from button text). All standard events are sent
    // explicitly by our code; the Events Manager toggle alone is not enough —
    // its config is CDN-cached and kept firing after being switched off.
    window.fbq("set", "autoConfig", false, pixelId);
    // Initialised *with* matching data, not bare: a pixel that never receives
    // any is what Events Manager reports as "no manual advanced matching set
    // up", and every event fired before checkout would carry none.
    window.fbq("init", pixelId, baselineMetaMatching());
    window.__metaPixelIds.add(pixelId);
  }
  // Remembered so setMetaAdvancedMatching() can re-init with customer details
  // once checkout knows them, without every caller needing site settings.
  window.__metaPrimaryPixelId = window.__metaPrimaryPixelId || pixelId;
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
