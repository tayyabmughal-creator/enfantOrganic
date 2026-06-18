import { NextResponse } from "next/server";

import { getLocaleDir } from "@/lib/seo";
import { normalizeLocale } from "@/lib/storefront";

const LOCALE_PATTERN = /^\/(en|ar)(?=\/|$)/i;
const LOCALE_COOKIE = "enfant-locale";
const REGION_COOKIE = "enfant-region";
const SUPPORTED_REGIONS = ["om", "ae", "sa"];
const WWW_HOSTS = new Set(["www.enfantorganic.com", "enfantorganic.com", "app.enfantorganic.com"]);

const IP_COUNTRY_TO_REGION = { OM: "om", AE: "ae", SA: "sa" };

function pickRegion(raw) {
  const v = String(raw || "").toLowerCase().trim();
  return SUPPORTED_REGIONS.includes(v) ? v : "";
}

async function detectRegionFromIp(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return "";
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`,
      { signal: AbortSignal.timeout(1500) },
    );
    if (!res.ok) return "";
    const data = await res.json();
    if (data?.status !== "success") return "";
    return IP_COUNTRY_TO_REGION[data?.countryCode] || "";
  } catch {
    return "";
  }
}

export async function middleware(request) {
  const requestHeaders = new Headers(request.headers);
  const hostname = (request.headers.get("host") || "").split(":")[0];
  const pathname = request.nextUrl.pathname;

  // ── Locale ──────────────────────────────────────────────────────────────
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const urlMatch = pathname.match(LOCALE_PATTERN);
  const locale = normalizeLocale(cookieLocale || urlMatch?.[1]?.toLowerCase());
  requestHeaders.set("x-enfant-locale", locale);
  requestHeaders.set("x-enfant-dir", getLocaleDir(locale));

  // ── Region ──────────────────────────────────────────────────────────────
  // nginxRegion: set by host nginx when request arrives via om/ae/sa subdomain
  const nginxRegion = pickRegion(request.headers.get("x-region"));
  const urlRegion = pickRegion(request.nextUrl.searchParams.get("region"));
  const cookieRegion = pickRegion(request.cookies.get(REGION_COOKIE)?.value);
  const activeRegion = nginxRegion || urlRegion || cookieRegion || "om";
  requestHeaders.set("x-enfant-region", activeRegion);

  // ── www / apex → region-subdomain redirect ───────────────────────────────
  // Skips admin and Next.js internals.
  const isAdminPath = /^\/(django-admin|_next)/.test(pathname);
  const isWww = WWW_HOSTS.has(hostname);

  if (isWww && !isAdminPath) {
    let redirectRegion = urlRegion || cookieRegion;
    if (!redirectRegion) {
      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "";
      redirectRegion = await detectRegionFromIp(clientIp) || "om";
    }
    const redirectUrl = new URL(
      `https://${redirectRegion}.enfantorganic.com${pathname}${request.nextUrl.search}`
    );
    redirectUrl.searchParams.delete("region");
    const response = NextResponse.redirect(redirectUrl, { status: 302 });
    response.cookies.set(REGION_COOKIE, redirectRegion, {
      path: "/",
      domain: ".enfantorganic.com",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: true,
    });
    return response;
  }

  // ── Subdomain: inject ?region= so existing page code works unchanged ─────
  // Host nginx sets X-Region; we rewrite the URL internally so every server
  // component receives the correct region via searchParams — no page changes needed.
  if (nginxRegion && urlRegion !== nginxRegion) {
    const url = request.nextUrl.clone();
    url.searchParams.set("region", nginxRegion);
    return NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
