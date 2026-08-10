
export const revalidate = 120; // 2 minutes — admin changes reflect quickly

import Link from "next/link";
import StorefrontShell from "@/components/layout/StorefrontShell";
import SiteImage from "@/components/ui/SiteImage";
import { getHomePageData, getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildSeoMetadata } from "@/lib/seo";
import { buildStorePath, normalizeLocale } from "@/lib/storefront";

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const isAr = locale === "ar";

  return buildSeoMetadata({
    locale,
    region,
    path: "/categories",
    title: isAr ? "تسوق حسب الفئة | إنفانت أورجانيك" : "Shop by Category | Enfant Organics",
    description: isAr
      ? "تصفح جميع فئات إنفانت أورجانيك واختر ما يناسب طفلك."
      : "Browse every Enfant Organics category and find what suits your little one.",
    image: "/enfant/enfant-logo.png",
  });
}

// "Shop by Category → View All" used to land on the all-products list, which is
// the one page it should never be: the shopper asked to see the categories.
export default async function CategoriesPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const isAr = locale === "ar";

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const [navigation, home] = await Promise.all([
    getNavigationData(locale, region),
    getHomePageData(locale, region),
  ]);

  const categories = Array.isArray(home?.categories) ? home.categories : [];

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section container">
        <div className="page-hero">
          <h1>{home?.categories_heading?.title || (isAr ? "تسوق حسب الفئة" : "Shop by Category")}</h1>
          <p>
            {home?.categories_heading?.subtitle ||
              (isAr ? "اكتشف مجموعاتنا المميزة" : "Discover our premium collections")}
          </p>
        </div>
      </section>

      <section className="section container">
        {categories.length ? (
          <div className="category-grid">
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={buildStorePath(locale, `/collections?category=${category.slug}`, region)}
                className="category-grid-card"
              >
                <span className="category-grid-image">
                  <SiteImage src={category.image} alt={category.name} fill sizes="(max-width: 640px) 45vw, 220px" />
                </span>
                <span className="category-grid-title">{category.name}</span>
                {category.product_count ? (
                  <span className="category-grid-count">
                    {category.product_count} {isAr ? "منتج" : category.product_count === 1 ? "product" : "products"}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <div className="store-empty-state">
            <strong>{isAr ? "الفئات قيد التحديث" : "Categories are being updated"}</strong>
            <p>
              {isAr
                ? "يمكنك تصفح جميع المنتجات أو التواصل معنا للمساعدة في الاختيار."
                : "Browse all products or contact support if you need help choosing."}
            </p>
            <Link href={buildStorePath(locale, "/collections", region)} className="secondary-action">
              {isAr ? "تصفح جميع المنتجات" : "Browse all products"}
            </Link>
          </div>
        )}
      </section>
    </StorefrontShell>
  );
}
