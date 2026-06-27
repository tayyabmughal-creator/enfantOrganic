"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { saveSelectedRegion } from "@/lib/regionResolver";

export default function FooterCurrencyChips({ regions, currentRegionCode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  function changeRegion(code) {
    if (code === currentRegionCode) return;
    saveSelectedRegion(code);
    const currentHost = typeof window !== "undefined" ? window.location.hostname : "";
    const isProduction = currentHost.endsWith(".enfantorganic.com") || currentHost === "enfantorganic.com";
    if (isProduction) {
      window.location.href = `https://${code}.enfantorganic.com${pathname}`;
    } else {
      const updated = new URLSearchParams(params.toString());
      updated.set("region", code);
      router.replace(`${pathname}?${updated.toString()}`, { scroll: false });
    }
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
