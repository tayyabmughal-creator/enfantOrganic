import { NextResponse } from "next/server";

import { getLocaleDir } from "@/lib/seo";
import { normalizeLocale } from "@/lib/storefront";

const LOCALE_PATTERN = /^\/(en|ar)(?=\/|$)/i;
const LOCALE_COOKIE = "enfant-locale";

export function middleware(request) {
  const requestHeaders = new Headers(request.headers);

  // Cookie takes priority — set when user switches locale without navigating.
  // URL segment is the fallback for direct links, bookmarks, and initial loads.
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const urlMatch = request.nextUrl.pathname.match(LOCALE_PATTERN);
  const locale = normalizeLocale(cookieLocale || urlMatch?.[1]?.toLowerCase());

  requestHeaders.set("x-enfant-locale", locale);
  requestHeaders.set("x-enfant-dir", getLocaleDir(locale));

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
