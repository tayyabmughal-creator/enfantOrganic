"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  regionFromSearchParams,
  resolveBrowserRegion,
  saveSelectedRegion,
  urlWithRegion,
} from "@/lib/regionResolver";
import { normalizeLocale } from "@/lib/storefront";

const LOCALIZED_STOREFRONT_PATH = /^\/(en|ar)(?=\/|$)/i;

const REGION_SUBDOMAIN = /^(om|ae|sa)\.enfantorganic\.com$/;

function RegionResolverInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const localeMatch = pathname?.match(LOCALIZED_STOREFRONT_PATH);
    if (!localeMatch) {
      return undefined;
    }

    // If on a region subdomain, that always wins — no localStorage fallback needed.
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const subdomainMatch = hostname.match(REGION_SUBDOMAIN);
    if (subdomainMatch) {
      const subRegion = subdomainMatch[1];
      saveSelectedRegion(subRegion);
      const urlRegion = regionFromSearchParams(searchParams);
      if (urlRegion !== subRegion) {
        const target = urlWithRegion(pathname, searchParams, subRegion);
        router.replace(target, { scroll: false });
      }
      return undefined;
    }

    const urlRegion = regionFromSearchParams(searchParams);
    if (urlRegion) {
      saveSelectedRegion(urlRegion);
      return undefined;
    }

    let cancelled = false;
    const locale = normalizeLocale(localeMatch[1]?.toLowerCase());

    resolveBrowserRegion({ searchParams, locale }).then((region) => {
      if (cancelled) {
        return;
      }
      const target = urlWithRegion(pathname, searchParams, region);
      router.replace(target, { scroll: false });
      router.refresh();
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  return null;
}

export default function RegionResolver() {
  return (
    <Suspense fallback={null}>
      <RegionResolverInner />
    </Suspense>
  );
}
