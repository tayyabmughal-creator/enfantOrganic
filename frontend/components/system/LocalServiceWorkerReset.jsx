"use client";

import { useEffect } from "react";

// Local (dev) reset runs once per browsing session so local debugging always
// gets a clean slate.
const LOCAL_RESET_SESSION_KEY = "enfant-local-sw-reset-v1";
// Production cleanup runs ONCE per browser (persisted). It clears any legacy
// service worker + its caches that could serve a stale bundle (which had, in the
// past, stopped analytics pixels and fresh content from loading for returning
// visitors). Bump the version suffix to force a new one-time cleanup for all
// visitors after a future change.
const PROD_CLEANUP_KEY = "enfant-sw-cleanup-v1";

function isLocalHost(hostname) {
  const value = String(hostname || "").toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

async function clearServiceWorkerState() {
  // Reload is gated on stale cached assets (not merely a registration): a legacy
  // service worker keeps old bundles in workbox/precache caches, whereas a brand
  // new visitor whose fresh SW just registered has not populated them yet — so
  // this avoids interrupting first-time visitors with a reload.
  let hadStaleCaches = false;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister().catch(() => {})),
    );
  } catch {
    // noop
  }

  if ("caches" in window) {
    try {
      const keys = await window.caches.keys();
      const knownKeys = keys.filter((key) => {
        const value = String(key || "").toLowerCase();
        return (
          value.includes("workbox") ||
          value.includes("next-pwa") ||
          value.includes("precache") ||
          value.includes("pwa")
        );
      });
      if (knownKeys.length > 0) hadStaleCaches = true;
      await Promise.all(knownKeys.map((key) => window.caches.delete(key).catch(() => {})));
    } catch {
      // noop
    }
  }

  return hadStaleCaches;
}

export default function LocalServiceWorkerReset() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const local = isLocalHost(window.location.hostname);
    // Local: per-session (sessionStorage). Production: once per browser (localStorage).
    const storage = local ? window.sessionStorage : window.localStorage;
    const flagKey = local ? LOCAL_RESET_SESSION_KEY : PROD_CLEANUP_KEY;

    if (local) {
      // In embedded/local browser contexts, smooth scroll can jitter or appear
      // as continuous scrolling. Keep local debugging stable.
      document.documentElement.style.scrollBehavior = "auto";
    }

    let alreadyDone = false;
    try {
      alreadyDone = storage.getItem(flagKey) === "1";
    } catch {
      // Storage blocked (private mode / cookies disabled) — skip; nothing to clean safely.
      return;
    }
    if (alreadyDone) return;

    let cancelled = false;

    void (async () => {
      const hadStale = await clearServiceWorkerState();
      if (cancelled) return;

      // Mark done BEFORE any reload so the post-reload load skips this and lets
      // next-pwa register a fresh service worker normally (no reload loop).
      try {
        storage.setItem(flagKey, "1");
      } catch {
        // noop
      }

      // Only reload when we actually removed stale state, so first-time/new
      // visitors are never interrupted.
      if (hadStale) window.location.reload();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
