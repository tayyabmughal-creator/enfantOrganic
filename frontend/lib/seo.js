import { normalizeLocale, normalizeRegion, isRtl } from "@/lib/storefront";

const DEFAULT_BASE_URL = "http://localhost:3001";
const DEFAULT_IMAGE_PATH = "/enfant/enfant-logo.png";

export const SITE_NAME = "Enfant Organics";
export const SUPPORTED_SEO_LOCALES = ["en", "ar"];
export const SUPPORTED_SEO_REGIONS = ["om", "ae", "sa"];

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
  const normalizedLocale = normalizeLocale(locale);
  const normalizedRegion = normalizeRegion(region);
  const cleanPath = path
    ? (String(path).startsWith("/") ? String(path) : `/${String(path)}`)
    : "";
  return `/${normalizedLocale}${cleanPath}?region=${normalizedRegion}`;
}

export function buildAlternates(locale, path = "", region = "om") {
  const canonical = toAbsoluteUrl(buildLocalizedPath(locale, path, region));
  const languages = {
    en: toAbsoluteUrl(buildLocalizedPath("en", path, region)),
    ar: toAbsoluteUrl(buildLocalizedPath("ar", path, region)),
    "x-default": toAbsoluteUrl(buildLocalizedPath("en", path, region)),
  };
  return { canonical, languages };
}

function getOgLocale(locale) {
  return normalizeLocale(locale) === "ar" ? "ar_SA" : "en_US";
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
  type = "website",
}) {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedRegion = normalizeRegion(region);
  const alternates = buildAlternates(normalizedLocale, path, normalizedRegion);
  const imageUrl = getSeoImage(image);

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      type,
      url: alternates.canonical,
      siteName: SITE_NAME,
      locale: getOgLocale(normalizedLocale),
      images: [
        {
          url: imageUrl,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

