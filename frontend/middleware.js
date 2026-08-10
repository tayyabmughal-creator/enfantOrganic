import { NextResponse } from "next/server";

import { resolveLegacyShopifyPath } from "@/lib/legacyRedirects";
import { getLocaleDir } from "@/lib/seo";
import {
  DEFAULT_LOCALE,
  DEFAULT_REGION,
  SUPPORTED_REGIONS,
  buildStorePath,
  formatLocaleRegion,
  normalizeLocale,
  parseLocaleRegionFromPath,
} from "@/lib/storefront";

const LOCALE_COOKIE = "enfant-locale";
// Renamed on purpose. `enfant-region` is unusable as a preference: the
// om./ae./sa. middleware wrote it at `.enfantorganic.com`, for a year, with a
// hardcoded `"om"` default for anyone arriving at www or the apex without one.
// Those cookies are still in returning visitors' browsers, they outrank a
// host-only cookie of the same name, and their value records no choice the
// visitor ever made — so the name is retired rather than reused.
const REGION_COOKIE = "enfant-store-region";
const LEGACY_REGION_COOKIE = "enfant-region";

// www is the single canonical host: one domain means one authority pool, and the
// brand's inbound links from the Shopify era all point here.
const CANONICAL_HOST = "www.enfantorganic.com";
const REGION_SUBDOMAIN = /^(om|ae|sa)\.enfantorganic\.com$/i;
const NON_CANONICAL_HOSTS = /^(enfantorganic\.com|app\.enfantorganic\.com)$/i;

// Routes that are not part of the localized storefront and must pass through untouched.
const PASSTHROUGH = /^\/(api|_next|django-admin|admin|checkout\/return|offline|manifest\.webmanifest)(\/|$)/;
// Exempt from host canonicalisation: a stale service worker still calls the
// old API host, and a 301 would drop a POST body on the way.
const API_PASSTHROUGH = /^\/(api|_next|django-admin|admin)(\/|$)/;
// Files that describe the whole site rather than one storefront. A legacy host
// must still be redirected away from them, but to the same path on www.
const SITE_LEVEL_FILE = /^\/(robots\.txt|sitemap\.xml|manifest\.webmanifest|favicon\.ico)$/;

function pickRegion(raw) {
  const value = String(raw || "").toLowerCase().trim();
  return SUPPORTED_REGIONS.includes(value) ? value : "";
}

function regionForRedirect(request) {
  return (
    pickRegion(request.nextUrl.searchParams.get("region")) ||
    pickRegion(request.cookies.get(REGION_COOKIE)?.value) ||
    DEFAULT_REGION
  );
}

function localeForRedirect(request, fallback) {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  return normalizeLocale(cookieLocale || fallback || DEFAULT_LOCALE);
}

/**
 * Expire the retired `enfant-region` cookie at both scopes.
 *
 * The domain-scoped original is the one that pinned returning visitors to
 * Oman; the host-only copy is what the interim code wrote while it still
 * shared the name. Cleared on every response, redirects included — a visitor
 * whose first request is `/` gets redirected before any page could clear it.
 */
function clearLegacyRegionCookie(response) {
  response.cookies.set(LEGACY_REGION_COOKIE, "", {
    domain: `.${CANONICAL_HOST.replace(/^www\./, "")}`,
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(LEGACY_REGION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

function redirectTo(request, pathWithQuery, status) {
  const target = new URL(pathWithQuery, `https://${CANONICAL_HOST}`);
  // Region now lives in the path segment; a leftover query param would only
  // create a second URL for identical content.
  target.searchParams.delete("region");
  return clearLegacyRegionCookie(NextResponse.redirect(target, { status }));
}

export async function middleware(request) {
  const hostname = (request.headers.get("host") || "").split(":")[0];
  const { pathname, search } = request.nextUrl;

  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(hostname);

  // ── Non-canonical hosts → 301 to www ─────────────────────────────────────
  // This runs BEFORE the passthrough list. A legacy host that answers 200 for
  // its own /robots.txt and /sitemap.xml is a live site as far as Google is
  // concerned, which is why om. and app. kept their own search results long
  // after every page on them started redirecting. Redirecting robots.txt is the
  // right move rather than serving a Disallow there: a blocked host can never be
  // crawled, so the page redirects would never be seen and the old URLs would
  // stay indexed forever.
  //
  // /api is deliberately exempt. app.enfantorganic.com still answers it for PWA
  // installs carrying a stale service worker, and redirecting a POST would lose
  // its body.
  if (!isLocalHost && !API_PASSTHROUGH.test(pathname)) {
    // Site-level files belong to the site, not to a storefront, so they keep
    // their path rather than having a region folded into it — /en-om/robots.txt
    // is not a thing that exists.
    if (SITE_LEVEL_FILE.test(pathname)) {
      if (REGION_SUBDOMAIN.test(hostname) || NON_CANONICAL_HOSTS.test(hostname)) {
        return redirectTo(request, `${pathname}${search}`, 301);
      }
    } else {
      const subdomainMatch = hostname.match(REGION_SUBDOMAIN);
      if (subdomainMatch) {
        const subRegion = subdomainMatch[1].toLowerCase();
        const parsedHost = parseLocaleRegionFromPath(pathname);
        const restHost = parsedHost ? pathname.split("/").slice(2).join("/") : pathname.replace(/^\//, "");
        const localeHost = parsedHost ? parsedHost.locale : localeForRedirect(request);
        return redirectTo(request, `${buildStorePath(localeHost, `/${restHost}`, subRegion)}${search}`, 301);
      }

      if (NON_CANONICAL_HOSTS.test(hostname)) {
        return redirectTo(request, `${pathname}${search}`, 301);
      }
    }
  }

  if (PASSTHROUGH.test(pathname)) {
    return NextResponse.next();
  }

  // ── Legacy Shopify URLs → 301 ────────────────────────────────────────────
  const legacyTarget = resolveLegacyShopifyPath(pathname, regionForRedirect(request));
  if (legacyTarget) {
    return redirectTo(request, legacyTarget, 301);
  }

  const parsed = parseLocaleRegionFromPath(pathname);

  // ── Root → the visitor's storefront ──────────────────────────────────────
  // 302, not 301: the destination depends on a saved preference, and x-default
  // points at /en-om which stays directly crawlable.
  if (pathname === "/") {
    const locale = localeForRedirect(request);
    return redirectTo(request, `${buildStorePath(locale, "", regionForRedirect(request))}${search}`, 302);
  }

  // ── Legacy bare-locale paths (/en/…, /ar/…) → 301 ────────────────────────
  if (parsed && !parsed.canonical) {
    const rest = pathname.split("/").slice(2).join("/");
    return redirectTo(
      request,
      `${buildStorePath(parsed.locale, `/${rest}`, regionForRedirect(request))}${search}`,
      301,
    );
  }

  // Anything that is not a storefront path falls through to Next's own 404.
  if (!parsed) {
    return NextResponse.next();
  }

  // ── Canonical /{locale}-{region}/… ───────────────────────────────────────
  // Region comes from the URL and only the URL — never from IP or cookie — so
  // every visitor and crawler sees identical content at a given address.
  const { locale, region } = parsed;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-enfant-locale", locale);
  requestHeaders.set("x-enfant-dir", getLocaleDir(locale));
  requestHeaders.set("x-enfant-region", region);

  const response = (() => {
    // Page components still read the region from searchParams; inject it internally
    // so the public URL stays clean without touching every page.
    if (request.nextUrl.searchParams.get("region") !== region) {
      const url = request.nextUrl.clone();
      url.searchParams.set("region", region);
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  })();

  clearLegacyRegionCookie(response);

  // Remember the pair so / and legacy links can land the visitor back here.
  response.cookies.set(REGION_COOKIE, region, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // Same URL, same HTML for everyone — but the cookie above varies future
  // redirects, so keep caches from mixing visitors up.
  response.headers.set("Vary", "Cookie");
  response.headers.set("x-enfant-locale-region", formatLocaleRegion(locale, region));

  return response;
}

export const config = {
  matcher: [
    // robots.txt and sitemap.xml are deliberately NOT excluded: the middleware
    // is what stops a legacy host serving its own copy of them.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
