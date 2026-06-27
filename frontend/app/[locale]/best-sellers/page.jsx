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
    const catalog = await getCatalogData(locale, region, { collection: "best_sellers" });
    if (catalog?.products?.[0]?.image) {
      image = catalog.products[0].image;
    }
  } catch {
    // Keep fallback metadata when API is unavailable.
  }

  return buildSeoMetadata({
    locale,
    region,
    path: "/best-sellers",
    title: isAr ? "الأكثر مبيعًا | إنفانت أورجانيك" : "Best Sellers | Enfant Organics",
    description: isAr
      ? "اكتشف المنتجات الأكثر شراءً بناءً على الطلبات المدفوعة."
      : "Explore products ranked by real paid-order demand.",
    image,
  });
}

export default async function BestSellersPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const [navigation, catalog] = await Promise.all([
    getNavigationData(locale, region),
    getCatalogData(locale, region, { collection: "best_sellers" }),
  ]);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section container">
        <div className="page-hero">
          <h1>{locale === "ar" ? "الأكثر مبيعًا" : "Best Sellers"}</h1>
          <p>
            {locale === "ar"
              ? "منتجات مرتبة وفق طلبات شراء مدفوعة حقيقية."
              : "Products ranked by real paid-order purchases."}
          </p>
        </div>
      </section>
      <section className="section container">
        <ProductCollectionClient
          data={catalog}
          locale={locale}
          region={region}
          listingType="best-sellers"
          emptyState={{
            title: locale === "ar" ? "لا توجد منتجات الأكثر مبيعًا حاليًا" : "No best sellers yet",
            message:
              locale === "ar"
                ? "ما زلنا نجمع بيانات الطلبات لهذه المنطقة. يمكنك تصفح المنتجات المتاحة الآن."
                : "We are still collecting paid-order data for this region. You can browse available products now.",
          }}
        />
      </section>
    </StorefrontShell>
  );
}
