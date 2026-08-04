import { notFound } from "next/navigation";

export const revalidate = 120; // 2 minutes — admin changes reflect quickly

import ProductCard from "@/components/cards/ProductCard";
import JsonLd from "@/components/seo/JsonLd";
import StorefrontShell from "@/components/layout/StorefrontShell";
import ProductDetailClient from "@/components/store/product/ProductDetailClient";
import { ApiError, getNavigationData, getProductBySlug } from "@/lib/api";
import { toPlainText } from "@/lib/safeHtml";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildSeoMetadata, buildLocalizedPath, toAbsoluteUrl, SITE_NAME } from "@/lib/seo";
import { normalizeLocale, normalizeRegion, uiText } from "@/lib/storefront";

function getProductAvailability(product) {
  return product?.stock_status?.is_in_stock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
}

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam, slug } = await params;
  const locale = normalizeLocale(localeParam);
  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const isAr = locale === "ar";

  let title = isAr ? "تفاصيل المنتج | إنفانت أورجانيك" : "Product Details | Enfant Organics";
  let description = isAr
    ? "تفاصيل منتج إنفانت أورجانيك مع السعر والتوفر."
    : "Enfant Organics product details with live pricing and availability.";
  let image = "/enfant/enfant-logo.png";

  try {
    const productPage = await getProductBySlug(slug, locale, region);
    if (productPage?.product?.name) {
      title = productPage.product?.seo?.title || productPage.product.seo_title || `${productPage.product.name} | Enfant Organics`;
    }
    const productDescription =
      productPage.product?.seo?.description || productPage.product?.seo_description || productPage.product?.short_description;
    if (productDescription) {
      // Descriptions come from a rich-text admin field; a meta description has to be
      // plain text and short enough that Google shows it rather than rewriting it.
      description = toPlainText(productDescription, { maxLength: 160 });
    }
    image = productPage.product?.seo?.og_image || productPage.product?.image || image;
    return buildSeoMetadata({
      locale,
      region,
      path: `/product/${slug}`,
      title,
      description,
      image,
      canonicalUrl: productPage.product?.seo?.canonical_url,
      ogTitle: productPage.product?.seo?.og_title,
      ogDescription: productPage.product?.seo?.og_description,
      robots: productPage.product?.seo,
    });
  } catch (error) {
    // A missing product has to 404 here rather than in the page body: `loading.jsx`
    // makes this route stream, so by the time the body runs the 200 shell has
    // already been flushed and notFound() can no longer set the status. Metadata
    // resolves before the first flush, so this is the last point a real 404 is
    // still possible.
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    // Any other failure (API down) keeps the fallback metadata below.
  }

  return buildSeoMetadata({
    locale,
    region,
    path: `/product/${slug}`,
    title,
    description,
    image,
  });
}

export default async function LocalizedProductPage({ params, searchParams }) {
  const { locale: localeParam, slug } = await params;
  const locale = normalizeLocale(localeParam);

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  let navigation;
  let productPage;

  try {
    [navigation, productPage] = await Promise.all([
      getNavigationData(locale, region),
      getProductBySlug(slug, locale, region),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  if (!productPage?.product) {
    notFound();
  }

  const t = uiText(locale);
  const canonicalUrl = toAbsoluteUrl(buildLocalizedPath(locale, `/product/${slug}`, region));
  const product = productPage.product;
  const reviewCount = Number(product.review_count) || 0;
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: (Array.isArray(product.gallery) && product.gallery.length ? product.gallery : [product.image]).filter(Boolean),
    // schema.org wants plain text here — the rich-text description would otherwise
    // ship its markup, and any editor cruft in it, into the structured data.
    description: toPlainText(product.description || product.short_description || ""),
    sku: product.sku || product.slug,
    brand: {
      "@type": "Brand",
      name: product.brand || product.vendor || SITE_NAME,
    },
    // Only claim ratings when real approved reviews back them. The model defaults
    // to 5.0 with a count of zero, and publishing that would be a fabricated
    // rating under Google's review-snippet policy.
    ...(reviewCount > 0 && product.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: String(product.rating),
            reviewCount: String(reviewCount),
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: product?.pricing?.currency_code || "",
      price: String(product?.pricing?.amount ?? 0),
      availability: getProductAvailability(product),
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: SITE_NAME,
      },
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: locale === "ar" ? "الرئيسية" : "Home",
        item: toAbsoluteUrl(buildLocalizedPath(locale, "", region)),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: locale === "ar" ? "المنتجات" : "Collections",
        item: toAbsoluteUrl(buildLocalizedPath(locale, "/collections", region)),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <section className="section container product-breadcrumbs">
        {productPage.breadcrumbs.map((item) => (
          <span key={item.href || item.label}>{item.label}</span>
        ))}
      </section>
      <section className="section container">
        <ProductDetailClient locale={locale} product={productPage.product} region={region} />
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <h3>{t.related}</h3>
          </div>
        </div>
        {productPage.related_products.length ? (
          <div className="product-rail">
            {productPage.related_products.map((product) => (
              <ProductCard
                key={product.slug}
                locale={locale}
                product={product}
                region={region}
              />
            ))}
          </div>
        ) : (
          <div className="store-empty-state">
            <strong>{locale === "ar" ? "منتجات مشابهة قريبًا" : "Related products are coming soon"}</strong>
            <p>
              {locale === "ar"
                ? "جرّب متابعة التسوق لاكتشاف منتجات مناسبة أخرى."
                : "Continue shopping to discover more products for your routine."}
            </p>
          </div>
        )}
      </section>
    </StorefrontShell>
  );
}
