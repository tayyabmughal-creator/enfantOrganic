import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import TrackOrderClient from "@/components/store/order/TrackOrderClient";
import { getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront";
import { buildPrivatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam } = await params;
  return buildPrivatePageMetadata({
    locale: normalizeLocale(localeParam),
    region: resolveServerRegion(await searchParams),
    path: "/track-order",
    title: "Track Your Order | Enfant Organics",
    titleAr: "تتبع طلبك | إنفانت أورجانيك",
  });
}

export default async function TrackOrderPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const resolvedSearchParams = await searchParams;
  const normalizedLocale = normalizeLocale(localeParam);

  if (localeParam !== normalizedLocale) {
    notFound();
  }

  const region = resolveServerRegion(resolvedSearchParams);
  const navigation = await getNavigationData(normalizedLocale, region);

  return (
    <StorefrontShell locale={normalizedLocale} navigation={navigation}>
      <TrackOrderClient locale={normalizedLocale} region={region} />
    </StorefrontShell>
  );
}
