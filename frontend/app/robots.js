import { getBaseUrl } from "@/lib/seo";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/en", "/ar"],
        disallow: [
          "/admin",
          "/en/account",
          "/ar/account",
          "/en/checkout",
          "/ar/checkout",
          "/en/payment",
          "/ar/payment",
          "/en/thank-you",
          "/ar/thank-you",
          "/api/",
        ],
      },
    ],
    sitemap: `${getBaseUrl()}/sitemap.xml`,
    host: getBaseUrl(),
  };
}

