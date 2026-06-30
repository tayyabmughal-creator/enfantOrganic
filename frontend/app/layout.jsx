import { headers } from "next/headers";
import { Noto_Sans_Arabic } from "next/font/google";
import LocaleHtmlAttributes from "@/components/seo/LocaleHtmlAttributes";
import ChunkLoadRecovery from "@/components/system/ChunkLoadRecovery";
import LocalServiceWorkerReset from "@/components/system/LocalServiceWorkerReset";
import RegionResolver from "@/components/system/RegionResolver";
import GtmScript from "@/components/store/analytics/GtmScript";
import StorefrontPageViewTracker from "@/components/store/analytics/StorefrontPageViewTracker";
import StoreProvider from "@/components/store/cart/StoreProvider";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { getBaseUrl, getLocaleDir } from "@/lib/seo";
import { normalizeLocale } from "@/lib/storefront";

import "./globals.css";

const notoArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
  weight: ["400", "700"],
});

export const metadata = {
  title: "Enfant Organics",
  description: "Regional bilingual baby-care storefront built with Next.js and Django.",
  metadataBase: new URL(getBaseUrl()),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#fbfcf8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function detectLocaleFromNextUrl(nextUrlHeaderValue) {
  if (!nextUrlHeaderValue) {
    return "en";
  }
  const value = String(nextUrlHeaderValue);
  const pathname = value.startsWith("http")
    ? new URL(value).pathname
    : value;
  const match = pathname.match(/^\/(en|ar)(?=\/|$)/i);
  return normalizeLocale(match?.[1]?.toLowerCase());
}

function getRequestLocale(requestHeaders) {
  const middlewareLocale = requestHeaders.get("x-enfant-locale");
  if (middlewareLocale) {
    return normalizeLocale(middlewareLocale.toLowerCase());
  }

  return detectLocaleFromNextUrl(
    requestHeaders.get("next-url") ||
      requestHeaders.get("x-invoke-path") ||
      requestHeaders.get("x-matched-path") ||
      "",
  );
}

export default async function RootLayout({ children }) {
  const requestHeaders = await headers();
  const locale = getRequestLocale(requestHeaders);
  const dir = getLocaleDir(locale);

  return (
    <html lang={locale} dir={dir} className={`${notoArabic.variable}`}>
      <head>
        <meta name="facebook-domain-verification" content="sgzszmn3obmyyaaksxq0a70vd6ssvd" />
      </head>
      <body>
        <GtmScript />
        <ChunkLoadRecovery />
        <LocalServiceWorkerReset />
        <StorefrontPageViewTracker />
        <LocaleProvider initialLocale={locale}>
          <LocaleHtmlAttributes />
          <RegionResolver />
          <StoreProvider>{children}</StoreProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
