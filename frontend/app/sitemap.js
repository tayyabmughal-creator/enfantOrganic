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

function pushEntry(entries, locale, path, region, priority = 0.6, changeFrequency = "weekly") {
  const alternates = buildAlternates(locale, path, region);
  entries.push({
    url: toAbsoluteUrl(buildLocalizedPath(locale, path, region)),
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: {
      languages: alternates.languages,
    },
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
    const blogSlugs = Array.isArray(blogPosts)
      ? [...new Set(blogPosts.map((item) => item.slug).filter(Boolean))]
      : [];
    return { productSlugs, blogSlugs };
  } catch {
    return { productSlugs: [], blogSlugs: [] };
  }
}

export default async function sitemap() {
  const entries = [];

  for (const region of SUPPORTED_SEO_REGIONS) {
    for (const locale of SUPPORTED_SEO_LOCALES) {
      pushEntry(entries, locale, "", region, 1, "daily");
      pushEntry(entries, locale, "/collections", region, 0.9, "daily");
      pushEntry(entries, locale, "/blog", region, 0.7, "weekly");

      for (const slug of STATIC_PAGE_SLUGS) {
        pushEntry(entries, locale, `/${slug}`, region, 0.4, "monthly");
      }

      const { productSlugs, blogSlugs } = await getCatalogAndBlogSlugs(locale, region);

      for (const slug of productSlugs) {
        pushEntry(entries, locale, `/product/${slug}`, region, 0.8, "daily");
      }

      for (const slug of blogSlugs) {
        pushEntry(entries, locale, `/blog/${slug}`, region, 0.6, "weekly");
      }
    }
  }

  return entries;
}
