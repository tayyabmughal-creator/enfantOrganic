"use client";

import { useEffect } from "react";

const RESET_SESSION_KEY = "enfant-local-sw-reset-v1";

function isLocalHost(hostname) {
  const value = String(hostname || "").toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

export default function LocalServiceWorkerReset() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isLocalHost(window.location.hostname)) return;
    // In embedded/local browser contexts, smooth scroll can jitter or appear
    // as continuous scrolling. Keep local debugging stable.
    document.documentElement.style.scrollBehavior = "auto";
    if (!("serviceWorker" in navigator)) return;

    try {
      if (window.sessionStorage.getItem(RESET_SESSION_KEY) === "1") {
        return;
      }
    } catch {
      return;
    }

    let cancelled = false;

    const clearLocalServiceWorkerState = async () => {
      let hadRegistrations = false;
      let hadKnownCaches = false;

      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) {
          hadRegistrations = true;
        }
        await Promise.all(
          registrations.map(async (registration) => {
            try {
              await registration.unregister();
            } catch {
              // noop
            }
          }),
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
          if (knownKeys.length > 0) {
            hadKnownCaches = true;
          }
          await Promise.all(
            knownKeys.map(async (key) => {
              try {
                await window.caches.delete(key);
              } catch {
                // noop
              }
            }),
          );
        } catch {
          // noop
        }
      }

      if (cancelled) return;

      try {
        window.sessionStorage.setItem(RESET_SESSION_KEY, "1");
      } catch {
        // noop
      }

      if (hadRegistrations || hadKnownCaches) {
        window.location.reload();
      }
    };

    void clearLocalServiceWorkerState();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
