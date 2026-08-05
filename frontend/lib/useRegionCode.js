"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { readStoredRegion, regionFromSearchParams } from "./regionResolver.js";
import { DEFAULT_REGION, parseLocaleRegionFromPath } from "./storefront-core/routing.js";

/**
 * The region of the store the visitor is currently on, resolved the way a
 * *client* component has to resolve it.
 *
 * Server components read `?region=`, which middleware injects by rewriting
 * `/en-ae/…` internally. That rewrite is invisible to the browser: the address
 * bar — and therefore `useSearchParams()` — has no `region` at all. Client
 * components that read the query param alone silently fell back to Oman on
 * every non-Oman store, repricing carts into OMR and, through the cart's
 * Apple Pay button, creating Omani orders for UAE and Saudi shoppers.
 *
 * So the path segment is the source of truth here, exactly as it is for
 * middleware. The rest is fallback for the shapes that segment cannot express:
 * `?region=` for a legacy link the middleware has not redirected yet, and the
 * stored region for the bare `/en/…` form, which carries no region of its own.
 */
export function useRegionCode() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsed = parseLocaleRegionFromPath(pathname);

  // `canonical` is what separates /en-ae (a real region) from /en (a default
  // that would otherwise outrank a perfectly good ?region= or stored value).
  return (
    (parsed?.canonical ? parsed.region : "")
    || regionFromSearchParams(searchParams)
    || readStoredRegion()
    || DEFAULT_REGION
  );
}
