"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { detectBackendRegion, saveSelectedRegion } from "@/lib/regionResolver";
import { normalizeLocale, parseLocaleRegionFromPath, replaceRegionInPath } from "@/lib/storefront";

const DISMISS_KEY = "enfant-region-suggestion-dismissed";

const REGION_LABELS = {
  om: { en: "Oman", ar: "عُمان" },
  ae: { en: "United Arab Emirates", ar: "الإمارات العربية المتحدة" },
  sa: { en: "Saudi Arabia", ar: "السعودية" },
};

function copy(locale, currentRegion, suggestedRegion) {
  const isAr = locale === "ar";
  const current = REGION_LABELS[currentRegion]?.[isAr ? "ar" : "en"] || currentRegion;
  const suggested = REGION_LABELS[suggestedRegion]?.[isAr ? "ar" : "en"] || suggestedRegion;

  return isAr
    ? {
        message: `أنت تتصفح متجر ${current}. هل تريد الانتقال إلى متجر ${suggested}؟`,
        confirm: `انتقل إلى ${suggested}`,
        dismiss: "البقاء هنا",
      }
    : {
        message: `You're viewing the ${current} store. Switch to ${suggested} for local prices and delivery?`,
        confirm: `Go to ${suggested}`,
        dismiss: "Stay here",
      };
}

/**
 * Suggests the visitor's own storefront — it never redirects.
 *
 * The previous version rewrote the URL from the detected region, which meant
 * Googlebot (crawling from the US) only ever reached the Oman store and the AE
 * and SA variants could not be indexed at all. Region now comes from the URL
 * alone, so every visitor and crawler sees the same content at a given address
 * and the choice stays with the user.
 */
function RegionSuggestionInner() {
  const pathname = usePathname();
  const router = useRouter();
  const [suggestion, setSuggestion] = useState(null);

  const parsed = parseLocaleRegionFromPath(pathname);
  const currentRegion = parsed?.region || "";
  const locale = normalizeLocale(parsed?.locale);

  useEffect(() => {
    if (!parsed?.canonical) {
      return undefined;
    }

    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Session storage is unavailable in some private/embedded contexts.
    }
    if (dismissed) {
      return undefined;
    }

    let cancelled = false;
    detectBackendRegion({ locale }).then((detected) => {
      if (!cancelled && detected && detected !== currentRegion) {
        setSuggestion(detected);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentRegion, locale, parsed?.canonical]);

  const dismiss = useCallback(() => {
    setSuggestion(null);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Non-fatal: the banner simply reappears next navigation.
    }
  }, []);

  const accept = useCallback(() => {
    if (!suggestion) {
      return;
    }
    saveSelectedRegion(suggestion);
    setSuggestion(null);
    router.push(replaceRegionInPath(pathname, suggestion));
  }, [pathname, router, suggestion]);

  if (!suggestion) {
    return null;
  }

  const text = copy(locale, currentRegion, suggestion);

  return (
    <div className="region-suggestion" role="region" aria-live="polite">
      <p className="region-suggestion__message">{text.message}</p>
      <div className="region-suggestion__actions">
        <button type="button" className="region-suggestion__confirm" onClick={accept}>
          {text.confirm}
        </button>
        <button type="button" className="region-suggestion__dismiss" onClick={dismiss}>
          {text.dismiss}
        </button>
      </div>
    </div>
  );
}

export default function RegionResolver() {
  return (
    <Suspense fallback={null}>
      <RegionSuggestionInner />
    </Suspense>
  );
}
