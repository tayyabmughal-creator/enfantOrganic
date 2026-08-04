
import StorefrontShell from "@/components/layout/StorefrontShell";
import WishlistClient from "@/components/store/wishlist/WishlistClient";
import { getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { normalizeLocale } from "@/lib/storefront";
import { buildPrivatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam } = await params;
  return buildPrivatePageMetadata({
    locale: normalizeLocale(localeParam),
    region: resolveServerRegion(await searchParams),
    path: "/wishlist",
    title: "Wishlist | Enfant Organics",
    titleAr: "قائمة الرغبات | إنفانت أورجانيك",
  });
}

export default async function WishlistPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const navigation = await getNavigationData(locale, region);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <WishlistClient locale={locale} region={region} />
    </StorefrontShell>
  );
}

