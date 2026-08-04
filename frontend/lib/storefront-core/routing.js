export const SUPPORTED_LOCALES = ["en", "ar"];
export const SUPPORTED_REGIONS = ["om", "ae", "sa"];

export const DEFAULT_LOCALE = "en";
export const DEFAULT_REGION = "om";

// Storefront URLs carry locale and region in a single path segment: /en-om, /ar-sa, …
// One segment per hreflang variant keeps every region/language pair on its own
// crawlable, self-canonical URL under the single www host.
export const LOCALE_REGION_SEGMENT = /^(en|ar)-(om|ae|sa)$/i;

// Legacy shape from before region moved into the path: /en/…, /ar/… (region was a
// ?region= query param). Still matched so middleware can 301 it to the new form.
export const LEGACY_LOCALE_SEGMENT = /^(en|ar)$/i;

export function formatLocaleRegion(locale, region) {
  return `${normalizeLocale(locale)}-${normalizeRegion(region)}`;
}

/**
 * Reads a leading storefront segment.
 * Returns null when the segment is not a storefront prefix at all.
 * `canonical` is false for the legacy bare-locale form, which callers redirect.
 */
export function parseLocaleRegion(segment) {
  const value = String(segment || "").toLowerCase();

  const modern = value.match(LOCALE_REGION_SEGMENT);
  if (modern) {
    return { locale: modern[1], region: modern[2], canonical: true };
  }

  const legacy = value.match(LEGACY_LOCALE_SEGMENT);
  if (legacy) {
    return { locale: legacy[1], region: DEFAULT_REGION, canonical: false };
  }

  return null;
}

export function parseLocaleRegionFromPath(pathname) {
  const segment = String(pathname || "").split("/")[1] || "";
  return parseLocaleRegion(segment);
}

export function normalizeLocale(locale) {
  const value = String(locale || "").toLowerCase();
  // Accepts both the bare locale and the combined segment, so page components can
  // pass params.locale straight through without knowing the URL shape.
  const base = value.split("-")[0];
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

export function normalizeRegion(region) {
  const value = String(region || "").toLowerCase();
  if (SUPPORTED_REGIONS.includes(value)) {
    return value;
  }
  const combined = value.match(LOCALE_REGION_SEGMENT);
  return combined ? combined[2] : DEFAULT_REGION;
}

export function isRtl(locale) {
  return normalizeLocale(locale) === "ar";
}

export function buildStorePath(locale, path = "", region = DEFAULT_REGION) {
  const prefix = `/${formatLocaleRegion(locale, region)}`;
  const raw = String(path || "");
  const cleanPath = raw && !raw.startsWith("/") ? `/${raw}` : raw;

  if (!cleanPath || cleanPath === "/") {
    return prefix;
  }
  return `${prefix}${cleanPath}`;
}

function swapLeadingSegment(pathname, nextSegment) {
  const path = String(pathname || "/");
  const parsed = parseLocaleRegionFromPath(path);
  if (!parsed) {
    return `/${nextSegment}`;
  }
  const rest = path.split("/").slice(2).join("/");
  return rest ? `/${nextSegment}/${rest}` : `/${nextSegment}`;
}

export function replaceLocaleInPath(pathname, nextLocale) {
  const parsed = parseLocaleRegionFromPath(pathname);
  const region = parsed ? parsed.region : DEFAULT_REGION;
  return swapLeadingSegment(pathname, formatLocaleRegion(nextLocale, region));
}

export function replaceRegionInPath(pathname, nextRegion) {
  const parsed = parseLocaleRegionFromPath(pathname);
  const locale = parsed ? parsed.locale : DEFAULT_LOCALE;
  return swapLeadingSegment(pathname, formatLocaleRegion(locale, nextRegion));
}
