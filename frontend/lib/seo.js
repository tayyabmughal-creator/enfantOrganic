import { buildStorePath, normalizeLocale, normalizeRegion, isRtl } from "@/lib/storefront";

const DEFAULT_BASE_URL = "https://www.enfantorganic.com";
const DEFAULT_IMAGE_PATH = "/enfant/enfant-logo.png";

export const SITE_NAME = "Enfant Organics";
export const SUPPORTED_SEO_LOCALES = ["en", "ar"];
export const SUPPORTED_SEO_REGIONS = ["om", "ae", "sa"];

// x-default gets the English Oman variant: Oman is the home market and English is
// the wider-reach language, so it is the safest landing for unmatched locales.
const XDEFAULT_LOCALE = "en";
const XDEFAULT_REGION = "om";

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function getBaseUrl() {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    DEFAULT_BASE_URL;
  return trimTrailingSlash(envUrl) || DEFAULT_BASE_URL;
}

export function toAbsoluteUrl(path) {
  const base = getBaseUrl();
  const safePath = String(path || "").startsWith("/") ? path : `/${String(path || "")}`;
  return new URL(safePath, `${base}/`).toString();
}

export function buildLocalizedPath(locale, path = "", region = "om") {
  return buildStorePath(locale, path, region);
}

/**
 * Self-canonical plus the full reciprocal hreflang cluster.
 *
 * Every region/language variant of a page lists all six siblings (including
 * itself) and an x-default. Reciprocity is required — if a variant omits one of
 * its siblings, Google discards annotations for the whole cluster, which is what
 * previously left the AE and SA stores unable to rank in their own markets.
 */
export function buildAlternates(locale, path = "", region = "om") {
  const canonical = toAbsoluteUrl(buildLocalizedPath(locale, path, region));

  const languages = {};
  for (const seoRegion of SUPPORTED_SEO_REGIONS) {
    for (const seoLocale of SUPPORTED_SEO_LOCALES) {
      // hreflang wants ISO 639-1 language + ISO 3166-1 alpha-2 region: en-OM, ar-SA, …
      languages[`${seoLocale}-${seoRegion.toUpperCase()}`] = toAbsoluteUrl(
        buildLocalizedPath(seoLocale, path, seoRegion),
      );
    }
  }
  languages["x-default"] = toAbsoluteUrl(
    buildLocalizedPath(XDEFAULT_LOCALE, path, XDEFAULT_REGION),
  );

  return { canonical, languages };
}

function getOgLocale(locale, region) {
  return `${normalizeLocale(locale)}_${normalizeRegion(region).toUpperCase()}`;
}

export function getLocaleDir(locale) {
  return isRtl(locale) ? "rtl" : "ltr";
}

export function getSeoImage(image) {
  if (image && /^https?:\/\//i.test(String(image))) {
    return String(image);
  }
  const candidate = image || DEFAULT_IMAGE_PATH;
  return toAbsoluteUrl(candidate);
}

export function buildSeoMetadata({
  locale,
  region,
  path = "",
  title,
  description,
  image,
  canonicalUrl = "",
  ogTitle = "",
  ogDescription = "",
  robots = null,
  type = "website",
}) {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedRegion = normalizeRegion(region);
  const alternates = buildAlternates(normalizedLocale, path, normalizedRegion);
  if (canonicalUrl) {
    alternates.canonical = toAbsoluteUrl(canonicalUrl);
  }
  const imageUrl = getSeoImage(image);
  const resolvedOgTitle = ogTitle || title;
  const resolvedOgDescription = ogDescription || description;

  const metadata = {
    title,
    description,
    alternates,
    openGraph: {
      title: resolvedOgTitle,
      description: resolvedOgDescription,
      type,
      url: alternates.canonical,
      siteName: SITE_NAME,
      locale: getOgLocale(normalizedLocale, normalizedRegion),
      images: [
        {
          url: imageUrl,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedOgTitle,
      description: resolvedOgDescription,
      images: [imageUrl],
    },
  };
  if (robots) {
    metadata.robots = {
      index: robots.index !== false,
      follow: robots.follow !== false,
    };
  }
  return metadata;
}

/**
 * Metadata for account, cart, and post-checkout pages.
 *
 * These are per-visitor, have no search value, and in the case of order pages can
 * expose order details, so they are explicitly noindex rather than relying on
 * robots.txt alone — a disallowed URL can still be indexed from external links.
 */
export function buildPrivatePageMetadata({ locale, region, path, title, titleAr }) {
  return buildSeoMetadata({
    locale,
    region,
    path,
    title: normalizeLocale(locale) === "ar" ? titleAr : title,
    description: "",
    robots: { index: false, follow: false },
  });
}
