import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import WishlistClient from "@/components/store/wishlist/WishlistClient";
import { getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { normalizeLocale } from "@/lib/storefront";

export default async function WishlistPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  if (localeParam !== locale) notFound();

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const navigation = await getNavigationData(locale, region);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <WishlistClient locale={locale} region={region} />
    </StorefrontShell>
  );
}

