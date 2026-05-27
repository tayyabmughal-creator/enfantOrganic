import { notFound } from "next/navigation";

import AccountClient from "@/components/store/account/AccountClient";
import StorefrontShell from "@/components/layout/StorefrontShell";
import { getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront";

export default async function AccountPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  if (localeParam !== locale) notFound();

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const navigation = await getNavigationData(locale, region);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <AccountClient locale={locale} region={region} />
    </StorefrontShell>
  );
}
