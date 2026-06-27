import { notFound } from "next/navigation";

export const revalidate = 120; // 2 minutes — admin changes reflect quickly

import StorefrontShell from "@/components/layout/StorefrontShell";
import ProductCollectionClient from "@/components/store/catalog/ProductCollectionClient";
import { getCatalogData, getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildSeoMetadata } from "@/lib/seo";
import { normalizeLocale } from "@/lib/storefront";

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const isAr = locale === "ar";

  let image = "/enfant/enfant-logo.png";
  try {
    const catalog = await getCatalogData(locale, region, { collection: "new_arrivals" });
    if (catalog?.products?.[0]?.image) {
      image = catalog.products[0].image;
    }
  } catch {
    // Keep fallback metadata when API is unavailable.
  }

  return buildSeoMetadata({
    locale,
    region,
    path: "/new-arrivals",
    title: isAr ? "وصل حديثًا | إنفانت أورجانيك" : "New Arrivals | Enfant Organics",
    description: isAr
      ? "اكتشف أحدث إضافات إنفانت أورجانيك المناسبة لمنطقتك."
      : "Discover the latest Enfant Organics additions available in your region.",
    image,
  });
}

export default async function NewArrivalsPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const [navigation, catalog] = await Promise.all([
    getNavigationData(locale, region),
    getCatalogData(locale, region, { collection: "new_arrivals" }),
  ]);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section container">
        <div className="page-hero">
          <h1>{locale === "ar" ? "وصل حديثًا" : "New Arrivals"}</h1>
          <p>
            {locale === "ar"
              ? "اكتشف أحدث الإضافات المتاحة حاليًا لمنطقتك."
              : "Explore the latest additions currently available in your region."}
          </p>
        </div>
      </section>
      <section className="section container">
        <ProductCollectionClient
          data={catalog}
          locale={locale}
          region={region}
          listingType="new-arrivals"
          emptyState={{
            title: locale === "ar" ? "قريبًا المزيد من المنتجات الجديدة" : "New arrivals are coming soon",
            message:
              locale === "ar"
                ? "نحدّث تشكيلتنا باستمرار. تصفح مجموعاتنا الحالية أو تواصل معنا للمساعدة."
                : "We update this collection often. Browse our current collections or contact support for help.",
          }}
        />
      </section>
    </StorefrontShell>
  );
}
