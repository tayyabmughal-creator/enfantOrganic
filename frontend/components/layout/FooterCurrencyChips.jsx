"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { saveSelectedRegion } from "@/lib/regionResolver";
import { replaceRegionInPath } from "@/lib/storefront";

export default function FooterCurrencyChips({ regions, currentRegionCode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  function changeRegion(code) {
    if (code === currentRegionCode) return;
    saveSelectedRegion(code);
    // Region lives in the path, so this is a plain in-app navigation on every
    // host — no subdomain hop and no ?region= duplicate of the same content.
    const query = params.toString();
    router.replace(
      `${replaceRegionInPath(pathname, code)}${query ? `?${query}` : ""}`,
      { scroll: false },
    );
    router.refresh();
  }

  return (
    <>
      {regions.map((region) => (
        <button
          key={region.code}
          type="button"
          className={`footer-currency-chip${region.code === currentRegionCode ? " footer-currency-chip--active" : ""}`}
          onClick={() => changeRegion(region.code)}
          title={region.name || region.code}
        >
          {region.currency_code}
        </button>
      ))}
    </>
  );
}
