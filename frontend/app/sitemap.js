import { getBlogList, getCatalogData } from "@/lib/api";
import {
  buildAlternates,
  buildLocalizedPath,
  SUPPORTED_SEO_LOCALES,
  SUPPORTED_SEO_REGIONS,
  toAbsoluteUrl,
} from "@/lib/seo";

const STATIC_PAGE_SLUGS = [
  "about",
  "contact",
  "faq",
  "cookie-policy",
  "payment-options",
  "shipping",
  "returns",
  "ingredients",
  "certifications",
  "sustainability",
  "our-standards",
  "shipping-policy",
  "return-policy",
  "privacy-policy",
  "terms",
];

const LISTING_PATHS = [
  { path: "/collections", priority: 0.9, changeFrequency: "daily" },
  { path: "/categories", priority: 0.8, changeFrequency: "weekly" },
  { path: "/best-sellers", priority: 0.8, changeFrequency: "daily" },
  { path: "/new-arrivals", priority: 0.8, changeFrequency: "daily" },
  { path: "/blog", priority: 0.7, changeFrequency: "weekly" },
];

/**
 * `lastModified` is deliberately omitted unless the API gives us a real date.
 * Stamping every URL with "now" on each crawl is a signal Google learns to
 * distrust, which is worse than sending no date at all.
 */
function pushEntry(entries, locale, region, path, { priority, changeFrequency, lastModified }) {
  const { languages } = buildAlternates(locale, path, region);
  entries.push({
    url: toAbsoluteUrl(buildLocalizedPath(locale, path, region)),
    changeFrequency,
    priority,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  });
}

async function getCatalogAndBlogSlugs(locale, region) {
  try {
    const [catalog, blogPosts] = await Promise.all([
      getCatalogData(locale, region),
      getBlogList(locale, region),
    ]);
    const productSlugs = Array.isArray(catalog?.products)
      ? [...new Set(catalog.products.map((item) => item.slug).filter(Boolean))]
      : [];
    const posts = Array.isArray(blogPosts)
      ? blogPosts.filter((item) => item?.slug)
      : [];
    return { productSlugs, posts };
  } catch {
    return { productSlugs: [], posts: [] };
  }
}

export default async function sitemap() {
  const entries = [];

  for (const region of SUPPORTED_SEO_REGIONS) {
    for (const locale of SUPPORTED_SEO_LOCALES) {
      pushEntry(entries, locale, region, "", { priority: 1, changeFrequency: "daily" });

      for (const { path, priority, changeFrequency } of LISTING_PATHS) {
        pushEntry(entries, locale, region, path, { priority, changeFrequency });
      }

      for (const slug of STATIC_PAGE_SLUGS) {
        pushEntry(entries, locale, region, `/${slug}`, {
          priority: 0.4,
          changeFrequency: "monthly",
        });
      }

      const { productSlugs, posts } = await getCatalogAndBlogSlugs(locale, region);

      for (const slug of productSlugs) {
        pushEntry(entries, locale, region, `/product/${slug}`, {
          priority: 0.8,
          changeFrequency: "daily",
        });
      }

      for (const post of posts) {
        pushEntry(entries, locale, region, `/blog/${post.slug}`, {
          priority: 0.6,
          changeFrequency: "weekly",
          lastModified: post.published_at ? new Date(post.published_at) : undefined,
        });
      }
    }
  }

  return entries;
}
