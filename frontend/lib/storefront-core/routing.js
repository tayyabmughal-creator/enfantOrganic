export const SUPPORTED_LOCALES = ["en", "ar"];
export const SUPPORTED_REGIONS = ["om", "ae", "sa"];

export function normalizeLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : "en";
}

export function normalizeRegion(region) {
  return SUPPORTED_REGIONS.includes(region) ? region : "om";
}

export function isRtl(locale) {
  return normalizeLocale(locale) === "ar";
}

export function buildStorePath(locale, path = "", region = "om") {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedRegion = normalizeRegion(region);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  const basePath = cleanPath === "/" ? "" : cleanPath;
  const sep = basePath.includes("?") ? "&" : "?";
  return `/${normalizedLocale}${basePath}${sep}region=${normalizedRegion}`;
}

export function replaceLocaleInPath(pathname, nextLocale) {
  const normalizedLocale = normalizeLocale(nextLocale);
  return pathname.replace(/^\/(en|ar)(?=\/|$)/, `/${normalizedLocale}`);
}
