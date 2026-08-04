
import AccountClient from "@/components/store/account/AccountClient";
import StorefrontShell from "@/components/layout/StorefrontShell";
import { getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront";
import { buildPrivatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam } = await params;
  return buildPrivatePageMetadata({
    locale: normalizeLocale(localeParam),
    region: resolveServerRegion(await searchParams),
    path: "/account",
    title: "My Account | Enfant Organics",
    titleAr: "حسابي | إنفانت أورجانيك",
  });
}

export default async function AccountPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const navigation = await getNavigationData(locale, region);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <AccountClient locale={locale} region={region} />
    </StorefrontShell>
  );
}
