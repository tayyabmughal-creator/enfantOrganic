import withPWA, { runtimeCaching } from "@ducanh2912/next-pwa";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";

const SENSITIVE_PATH_PATTERN =
  /^\/(?:admin(?:\/|$)|(?:en|ar)\/(?:checkout|payment|account)(?:\/|$)|api\/(?:checkout|payments|auth|admin|account|orders)(?:\/|$))/i;

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
  outputFileTracingRoot: path.join(process.cwd(), ".."),
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
  {
    urlPattern: ({ sameOrigin, url }) =>
      sameOrigin && SENSITIVE_PATH_PATTERN.test(url.pathname),
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
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: pwaRuntimeCaching,
    navigateFallbackDenylist: [
      /^\/admin(?:\/|$)/i,
      /^\/(?:en|ar)\/(?:checkout|payment|account)(?:\/|$)/i,
      /^\/api\/(?:checkout|payments|auth|admin|account|orders)(?:\/|$)/i,
    ],
  },
});

export default withPWAConfig(nextConfig);
