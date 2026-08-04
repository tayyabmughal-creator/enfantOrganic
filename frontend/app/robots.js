import { getBaseUrl } from "@/lib/seo";

// Storefront paths are /{locale}-{region}/…, so private areas are disallowed with a
// wildcard rather than by listing all six locale/region prefixes.
const PRIVATE_PATHS = ["account", "checkout", "payment", "thank-you", "wishlist"];

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/django-admin",
          "/api/",
          ...PRIVATE_PATHS.map((path) => `/*/${path}`),
        ],
      },
    ],
    sitemap: `${getBaseUrl()}/sitemap.xml`,
    host: getBaseUrl(),
  };
}

