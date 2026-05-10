import Link from "next/link";
import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import { getBlogBySlug, getNavigationData } from "@/lib/api";
import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront";

export default async function BlogDetailPage({ params, searchParams }) {
  const { locale: localeParam, slug } = await params;
  const locale = normalizeLocale(localeParam);
  if (localeParam !== locale) notFound();

  const resolvedSearchParams = await searchParams;
  const region = normalizeRegion(resolvedSearchParams?.region || "om");
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

  const paragraphs = (post.body || post.excerpt || "").split("\n").filter(Boolean);

  return (
    <StorefrontShell locale={locale} navigation={navigation_}>
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
              <img src={post.image} alt={post.title} />
            </div>
          ) : null}

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

          <div className="blog-detail-footer">
            <Link href={buildStorePath(locale, "/blog", region)} className="section-link">
              {isAr ? "← العودة إلى المدونة" : "← Back to Blog"}
            </Link>
          </div>
        </div>
      </article>
    </StorefrontShell>
  );
}
