import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import CheckoutClient from "@/components/store/checkout/CheckoutClient";
import { getNavigationData } from "@/lib/api";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront";

export default async function CheckoutPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const resolvedSearchParams = await searchParams;
  const normalizedLocale = normalizeLocale(localeParam);

  if (localeParam !== normalizedLocale) {
    notFound();
  }

  const region = normalizeRegion(resolvedSearchParams?.region || "om");
  const navigation = await getNavigationData(normalizedLocale, region);

  return (
    <StorefrontShell locale={normalizedLocale} navigation={navigation}>
      <CheckoutClient
        locale={normalizedLocale}
        region={region}
        regionConfig={navigation?.current_region || null}
      />
    </StorefrontShell>
  );
}
