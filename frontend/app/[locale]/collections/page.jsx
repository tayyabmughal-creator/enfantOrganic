import { notFound } from "next/navigation";

export const revalidate = 86400; // 24 hours

import StorefrontShell from "@/components/layout/StorefrontShell";
import ProductCollectionClient from "@/components/store/catalog/ProductCollectionClient";
import { getCatalogData, getNavigationData } from "@/lib/api";
import { buildSeoMetadata } from "@/lib/seo";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront";

function pickParam(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}

function buildCatalogFilters(searchParams) {
  return {
    search: pickParam(searchParams?.search),
    category: pickParam(searchParams?.category),
    brand: pickParam(searchParams?.brand),
    tag: pickParam(searchParams?.tag),
    min_price: pickParam(searchParams?.min_price),
    max_price: pickParam(searchParams?.max_price),
    ordering: pickParam(searchParams?.ordering),
  };
}

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const resolvedSearchParams = await searchParams;
  const region = normalizeRegion(resolvedSearchParams?.region || "om");
  const filters = buildCatalogFilters(resolvedSearchParams);
  const isAr = locale === "ar";

  let title = isAr ? "المنتجات | إنفانت أورجانيك" : "Collections | Enfant Organics";
  let description = isAr
    ? "تسوّقي مجموعة منتجات إنفانت أورجانيك للعناية اللطيفة ببشرة الأطفال."
    : "Explore Enfant Organics collections for gentle baby-care essentials.";
  let image = "/enfant/enfant-logo.png";

  try {
    const catalog = await getCatalogData(locale, region, filters);
    if (catalog?.hero?.title) {
      title = `${catalog.hero.title} | Enfant Organics`;
    }
    if (catalog?.hero?.subtitle) {
      description = catalog.hero.subtitle;
    }
    if (catalog?.products?.[0]?.image) {
      image = catalog.products[0].image;
    }
  } catch {
    // Keep fallback metadata when API is unavailable.
  }

  return buildSeoMetadata({
    locale,
    region,
    path: "/collections",
    title,
    description,
    image,
  });
}

export default async function LocalizedCollectionsPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const region = normalizeRegion(pickParam(resolvedSearchParams.region));
  const filters = buildCatalogFilters(resolvedSearchParams);
  const [navigation, catalog] = await Promise.all([
    getNavigationData(locale, region),
    getCatalogData(locale, region, filters),
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
