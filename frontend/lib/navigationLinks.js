import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront-core/routing";

const PLACEHOLDER_ROUTE_MAP = {
  "#about": "/about",
  "#contact": "/contact",
  "#cookie": "/cookie-policy",
  "#ingredients": "/ingredients",
  "#payments": "/payment-options",
  "#privacy": "/privacy-policy",
  "#promise": "/our-standards",
  "#returns": "/returns",
  "#shipping": "/shipping",
  "#story": "/our-standards",
  "#terms": "/terms",
  "#tested": "/certifications",
};

const EXTERNAL_SCHEME = /^(https?:|mailto:|tel:|sms:|whatsapp:)/i;

function isExternalHref(href) {
  return EXTERNAL_SCHEME.test(href) || href.startsWith("//");
}

export function resolveNavigationHref(href, { locale = "en", region = "om" } = {}) {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedRegion = normalizeRegion(region);
  const rawHref = String(href || "").trim();

  if (!rawHref) {
    return buildStorePath(normalizedLocale, "", normalizedRegion);
  }

  if (isExternalHref(rawHref)) {
    return rawHref;
  }

  const mappedHref = PLACEHOLDER_ROUTE_MAP[rawHref.toLowerCase()] || rawHref;
  if (mappedHref.startsWith("#")) {
    return PLACEHOLDER_ROUTE_MAP[mappedHref.toLowerCase()] || mappedHref;
  }

  let pathnameWithQuery = mappedHref.startsWith("/") ? mappedHref : `/${mappedHref}`;
  let hash = "";
  const hashIndex = pathnameWithQuery.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathnameWithQuery.slice(hashIndex);
    pathnameWithQuery = pathnameWithQuery.slice(0, hashIndex);
  }

  let pathname = pathnameWithQuery;
  let query = "";
  const queryIndex = pathnameWithQuery.indexOf("?");
  if (queryIndex >= 0) {
    pathname = pathnameWithQuery.slice(0, queryIndex);
    query = pathnameWithQuery.slice(queryIndex + 1);
  }

  // Admin-managed hrefs may arrive bare (/collections), legacy-prefixed (/en/collections)
  // or already current (/en-om/collections). Strip any existing prefix and re-apply the
  // active one so every nav link lands on the current region/locale variant.
  const withoutPrefix = pathname.replace(/^\/(en|ar)(-(om|ae|sa))?(?=\/|$)/i, "");
  const localizedPath = buildStorePath(normalizedLocale, withoutPrefix, normalizedRegion);

  const queryString = new URLSearchParams(query).toString();
  return `${localizedPath}${queryString ? `?${queryString}` : ""}${hash}`;
}

