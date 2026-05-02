import { notFound } from "next/navigation";

import ProductCard from "@/components/cards/ProductCard";
import StorefrontShell from "@/components/layout/StorefrontShell";
import ProductDetailClient from "@/components/store/product/ProductDetailClient";
import { getNavigationData, getProductBySlug } from "@/lib/api";
import { normalizeLocale, normalizeRegion, uiText } from "@/lib/storefront";

export default async function LocalizedProductPage({ params, searchParams }) {
  const { locale: localeParam, slug } = await params;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const region = normalizeRegion(resolvedSearchParams.region);
  const [navigation, productPage] = await Promise.all([
    getNavigationData(locale, region),
    getProductBySlug(slug, locale, region),
  ]);

  if (!productPage?.product) {
    notFound();
  }

  const t = uiText(locale);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
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
      </section>
    </StorefrontShell>
  );
}
