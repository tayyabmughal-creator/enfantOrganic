import { headers } from "next/headers";
import Script from "next/script";
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

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
const SNAPCHAT_PIXEL_ID = process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID || "";

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
        {META_PIXEL_ID && (
          <>
            <Script id="meta-pixel" strategy="afterInteractive">{`
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
              fbq('init','${META_PIXEL_ID}');
            `}</Script>
            <noscript>
              <img height="1" width="1" style={{display:"none"}}
                src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        )}
        {SNAPCHAT_PIXEL_ID && (
          <Script id="snapchat-pixel" strategy="afterInteractive">{`
            (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script',r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');
            snaptr('init','${SNAPCHAT_PIXEL_ID}',{});
            snaptr('track','PAGE_VIEW');
          `}</Script>
        )}
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
