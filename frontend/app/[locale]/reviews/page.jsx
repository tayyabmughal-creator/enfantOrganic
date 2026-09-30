import StorefrontShell from "@/components/layout/StorefrontShell";
import ReviewsPageClient from "@/components/store/reviews/ReviewsPageClient";
import { ReviewMarquee, StarRow } from "@/components/store/product/ProductReviewShowcase";
import { getAllReviews, getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildSeoMetadata } from "@/lib/seo";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront";

const PAGE_SIZE = 12;

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const region = resolveServerRegion(await searchParams);
  const isAr = locale === "ar";
  return buildSeoMetadata({
    locale,
    region,
    path: "/reviews",
    title: isAr ? "مراجعات العملاء | إنفانت أورجانيك" : "Customer Reviews | Enfant Organics",
    description: isAr
      ? "اقرئي آراء الأمهات الحقيقيات في منتجات إنفانت أورجانيك للعناية بالأطفال."
      : "Read real reviews from parents who use Enfant Organic baby care.",
  });
}

export default async function ReviewsPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const region = normalizeRegion(resolveServerRegion(await searchParams));
  const isAr = locale === "ar";

  const [navigation, initial] = await Promise.all([
    getNavigationData(locale, region),
    getAllReviews(locale, region, { page: 1, page_size: PAGE_SIZE }).catch(() => null),
  ]);
  const showcase = navigation?.settings?.reviews_showcase;
  const total = Number(initial?.total || 0);
  const average = initial?.average_rating;

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section container reviews-page">
        <header className="reviews-page-head">
          <h1>{showcase?.title || (isAr ? "مراجعات حقيقية، عملاء حقيقيون" : "Real Reviews, Real Customers")}</h1>
          {total > 0 && average ? (
            <p className="reviews-page-summary">
              <StarRow rating={average} size={18} />
              <span>
                {isAr
                  ? `${average} من ${total} مراجعة`
                  : `${average} average from ${total} reviews`}
              </span>
            </p>
          ) : null}
          {showcase?.subtitle ? <p className="reviews-page-sub">{showcase.subtitle}</p> : null}
        </header>

        {showcase?.images?.length ? (
          <ReviewMarquee images={showcase.images} label={isAr ? "صور العملاء" : "Customer stories"} />
        ) : null}

        <ReviewsPageClient
          locale={locale}
          region={region}
          initial={initial}
          pageSize={PAGE_SIZE}
        />
      </section>
    </StorefrontShell>
  );
}
