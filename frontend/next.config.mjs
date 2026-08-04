import withPWA, { runtimeCaching } from "@ducanh2912/next-pwa";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";

// Security headers applied to every route. The full CSP is enforced by nginx
// in production (which sees both frontend and API on the same origin); this
// set covers the cases when Next.js serves directly (dev/preview).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
  // HSTS only when running behind HTTPS — safe default for prod; harmless on http (browsers ignore it).
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]),
];

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      // www is the canonical host and is where media URLs are now built from.
      // app/om/ae/sa stay listed so images stored with an older absolute URL keep
      // going through the optimizer instead of silently falling back to raw <img>.
      { protocol: "https", hostname: "www.enfantorganic.com" },
      { protocol: "https", hostname: "app.enfantorganic.com" },
      { protocol: "https", hostname: "om.enfantorganic.com" },
      { protocol: "https", hostname: "ae.enfantorganic.com" },
      { protocol: "https", hostname: "sa.enfantorganic.com" },
      { protocol: "http",  hostname: "127.0.0.1" },
      { protocol: "http",  hostname: "localhost" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [390, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [32, 64, 96, 128, 256],
  },
  // Keep dev and production builds isolated so running `next build`
  // while local review is open does not corrupt the dev server runtime.
  distDir: isDev ? ".next-dev" : ".next",
  // Keep trace collection scoped to this app by default to avoid expensive
  // parent-directory scans in container/CI builds.
  outputFileTracingRoot: process.env.NEXT_OUTPUT_FILE_TRACING_ROOT
    ? path.resolve(process.env.NEXT_OUTPUT_FILE_TRACING_ROOT)
    : process.cwd(),
  async rewrites() {
    // In development Next.js serves the frontend directly (no nginx), so
    // browser-side fetches to /api/* would hit Next.js routing instead of
    // Django. This proxy makes them transparently reach the Django dev server.
    if (!isDev) return [];
    return [
      // Trailing slash: Next.js strips it (308), Django requires it (301).
      // Adding it in the destination breaks the loop — Django gets the right URL directly.
      { source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*/" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

const pwaRuntimeCaching = [
  // Never cache HTML pages or RSC payloads — content is region-specific and must always be fresh.
  {
    urlPattern: ({ request, sameOrigin }) =>
      sameOrigin &&
      (request.mode === "navigate" ||
        request.headers.get("RSC") === "1" ||
        request.headers.get("Next-Router-State-Tree") != null),
    handler: "NetworkOnly",
    options: {
      cacheName: "navigation-network-only",
    },
  },
  // Customer-specific and transactional traffic must never be served from a cache.
  //
  // Matched on pathname alone, with no origin test. The browser calls the API on
  // a different host from the page (NEXT_PUBLIC_API_BASE_URL points at
  // app.enfantorganic.com while pages come from om|ae|sa.enfantorganic.com), so
  // the previous `sameOrigin &&` guard never matched a single API request and
  // every order, account, auth, checkout and payment response fell through to
  // the cross-origin NetworkFirst handler and sat in the cache for an hour.
  //
  // This predicate MUST stay self-contained: next-pwa stringifies it into sw.js,
  // so any reference to an import or an outer constant becomes a ReferenceError
  // in the service worker. Keep the regex literal inline and in sync with
  // SENSITIVE_PATH_RE in lib/swCacheRules.js (asserted by swCacheRules.test.mjs).
  {
    urlPattern: ({ url }) =>
      /^\/(?:admin(?:\/|$)|(?:en|ar)\/(?:checkout|payment|account)(?:\/|$)|api\/(?:checkout|payments|auth|admin|account|orders|analytics)(?:\/|$))/i.test(
        url.pathname,
      ),
    handler: "NetworkOnly",
    options: {
      cacheName: "sensitive-network-only",
    },
  },
  ...runtimeCaching,
];

const withPWAConfig = withPWA({
  dest: "public",
  disable: isDev,
  register: true,
  reloadOnOnline: true,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: pwaRuntimeCaching,
    navigateFallbackDenylist: [
      /^\/admin(?:\/|$)/i,
      /^\/(?:en|ar)\/(?:checkout|payment|account)(?:\/|$)/i,
      /^\/api\/(?:checkout|payments|auth|admin|account|orders|analytics)(?:\/|$)/i,
    ],
  },
});

export default withPWAConfig(nextConfig);
