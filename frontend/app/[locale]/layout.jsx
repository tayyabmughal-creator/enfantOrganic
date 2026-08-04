import { notFound } from "next/navigation";

import { parseLocaleRegion } from "@/lib/storefront";

/**
 * Gate for the whole localized storefront.
 *
 * `[locale]` is a dynamic segment, so without this check any first path segment
 * matched it and rendered the storefront under a fallback locale — /anything
 * answered 200 with real content. Rejecting unknown segments here, in a layout
 * that runs before the response streams, is what makes those URLs return a
 * genuine 404 instead of a soft one.
 */
export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  const parsed = parseLocaleRegion(locale);

  // Middleware 301s the legacy bare-locale form, so only the canonical
  // {locale}-{region} segment should ever reach here.
  if (!parsed?.canonical) {
    notFound();
  }

  return children;
}
