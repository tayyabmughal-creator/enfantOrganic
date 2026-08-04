import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 120; // 2 minutes — admin changes reflect quickly

import JsonLd from "@/components/seo/JsonLd";
import SiteImage from "@/components/ui/SiteImage";
import StorefrontShell from "@/components/layout/StorefrontShell";
import { ApiError, getBlogBySlug, getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { hasHtml, sanitizeHtml } from "@/lib/safeHtml";
import { buildSeoMetadata, buildLocalizedPath, toAbsoluteUrl } from "@/lib/seo";
import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront";

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam, slug } = await params;
  const locale = normalizeLocale(localeParam);
  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const isAr = locale === "ar";

  let title = isAr ? "مقالة | إنفانت أورجانيك" : "Blog Article | Enfant Organics";
  let description = isAr
    ? "اقرئي نصائح العناية وصحة الأطفال من إنفانت أورجانيك."
    : "Read baby-care and parenting insights from Enfant Organics.";
  let image = "/enfant/enfant-logo.png";

  try {
    const post = await getBlogBySlug(slug, locale, region);
    if (post?.title) {
      title = post?.seo?.title || `${post.title} | Enfant Organics`;
    }
    const postDescription = post?.seo?.description || post?.excerpt;
    if (postDescription) {
      description = postDescription;
    }
    image = post?.seo?.og_image || post?.image || image;
    return buildSeoMetadata({
      locale,
      region,
      path: `/blog/${slug}`,
      title,
      description,
      image,
      canonicalUrl: post?.seo?.canonical_url,
      ogTitle: post?.seo?.og_title,
      ogDescription: post?.seo?.og_description,
      robots: post?.seo,
      type: "article",
    });
  } catch (error) {
    // Unknown posts must 404 here — this route streams, so once the body runs the
    // 200 shell is already flushed and notFound() can no longer set the status.
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    // Any other failure (API down) keeps the fallback metadata below.
  }

  return buildSeoMetadata({
    locale,
    region,
    path: `/blog/${slug}`,
    title,
    description,
    image,
    type: "article",
  });
}

export default async function BlogDetailPage({ params, searchParams }) {
  const { locale: localeParam, slug } = await params;
  const locale = normalizeLocale(localeParam);

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const isAr = locale === "ar";

  let post;
  try {
    const [navigation, postData] = await Promise.all([
      getNavigationData(locale, region),
      getBlogBySlug(slug, locale, region),
    ]);
    post = postData;
    var navigation_ = navigation;
  } catch {
    notFound();
  }

  const body = post.body || post.excerpt || "";
  const paragraphs = body.split("\n").filter(Boolean);
  const bodyHasHtml = hasHtml(body);
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: isAr ? "الرئيسية" : "Home",
        item: toAbsoluteUrl(buildLocalizedPath(locale, "", region)),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: isAr ? "المدونة" : "Blog",
        item: toAbsoluteUrl(buildLocalizedPath(locale, "/blog", region)),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: toAbsoluteUrl(buildLocalizedPath(locale, `/blog/${slug}`, region)),
      },
    ],
  };

  return (
    <StorefrontShell locale={locale} navigation={navigation_}>
      <JsonLd data={breadcrumbJsonLd} />
      <article className="section container">
        <div className="blog-detail-layout">
          <nav className="blog-breadcrumb">
            <Link href={buildStorePath(locale, "/", region)}>
              {isAr ? "الرئيسية" : "Home"}
            </Link>
            <span aria-hidden="true"> / </span>
            <Link href={buildStorePath(locale, "/blog", region)}>
              {isAr ? "المدونة" : "Blog"}
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{post.title}</span>
          </nav>

          <header className="blog-detail-header">
            <span className="blog-date">{post.published_at}</span>
            <h1>{post.title}</h1>
            {post.excerpt ? <p className="blog-detail-lead">{post.excerpt}</p> : null}
          </header>

          {post.image ? (
            <div className="blog-detail-image">
              <SiteImage src={post.image} alt={post.title} width={1200} height={630} priority sizes="(max-width: 900px) 100vw, 800px" />
            </div>
          ) : null}

          {bodyHasHtml ? (
            <div className="blog-detail-body rich-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }} />
          ) : (
            <div className="blog-detail-body">
              {paragraphs.map((para, i) => {
                if (para.startsWith("•")) {
                  return <li key={i} style={{ marginBottom: "6px" }}>{para.slice(1).trim()}</li>;
                }
                if (/^\d+[–-]/.test(para) || /^[A-Z0-9].*:/.test(para)) {
                  return <p key={i} className="blog-body-heading">{para}</p>;
                }
                return <p key={i}>{para}</p>;
              })}
            </div>
          )}

          <div className="blog-detail-footer">
            <Link href={buildStorePath(locale, "/blog", region)} className="section-link">
              {isAr ? "→ العودة إلى المدونة" : "← Back to Blog"}
            </Link>
          </div>
        </div>
      </article>
    </StorefrontShell>
  );
}
