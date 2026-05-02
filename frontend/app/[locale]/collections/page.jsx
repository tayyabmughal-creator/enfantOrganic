import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import ProductCollectionClient from "@/components/store/catalog/ProductCollectionClient";
import { getCatalogData, getNavigationData } from "@/lib/api";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront";

export default async function LocalizedCollectionsPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const region = normalizeRegion(resolvedSearchParams.region);
  const [navigation, catalog] = await Promise.all([
    getNavigationData(locale, region),
    getCatalogData(locale, region),
  ]);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section container">
        <div className="page-hero">
          <h1>{catalog.hero.title}</h1>
          <p>{catalog.hero.subtitle}</p>
        </div>
      </section>
      <section className="section container">
        <ProductCollectionClient data={catalog} locale={locale} region={region} />
      </section>
    </StorefrontShell>
  );
}
