import { notFound } from "next/navigation";

export const revalidate = 86400; // 24 hours

import ProductCard from "@/components/cards/ProductCard";
import JsonLd from "@/components/seo/JsonLd";
import StorefrontShell from "@/components/layout/StorefrontShell";
import ProductDetailClient from "@/components/store/product/ProductDetailClient";
import { ApiError, getNavigationData, getProductBySlug } from "@/lib/api";
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
      title = `${productPage.product.name} | Enfant Organics`;
    }
    if (productPage?.product?.short_description) {
      description = productPage.product.short_description;
    }
    if (productPage?.product?.image) {
      image = productPage.product.image;
    }
  } catch {
    // Keep fallback metadata when API is unavailable.
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

  if (localeParam !== locale) {
    notFound();
  }

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
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: (Array.isArray(product.gallery) && product.gallery.length ? product.gallery : [product.image]).filter(Boolean),
    description: product.description || product.short_description || "",
    sku: product.slug,
    brand: {
      "@type": "Brand",
      name: product.brand || product.vendor || SITE_NAME,
    },
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
