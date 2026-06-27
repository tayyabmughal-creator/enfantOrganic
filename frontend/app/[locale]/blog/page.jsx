import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 120; // 2 minutes — admin changes reflect quickly

import StorefrontShell from "@/components/layout/StorefrontShell";
import { getBlogList, getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront";

export default async function BlogIndexPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  if (localeParam !== locale) notFound();

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const isAr = locale === "ar";

  const [navigation, posts] = await Promise.all([
    getNavigationData(locale, region),
    getBlogList(locale, region),
  ]);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section container">
        <div className="section-heading">
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(1.8rem, 3vw, 2.6rem)", letterSpacing: "-0.04em" }}>
              {isAr ? "المدونة" : "Blog"}
            </h1>
            <p style={{ margin: "6px 0 0", color: "var(--text-soft)" }}>
              {isAr ? "نصائح عناية وصحة لأطفالك" : "Care tips and health insights for your little ones"}
            </p>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="store-empty-state">
            <strong>{isAr ? "مقالات جديدة قريبًا" : "Fresh articles are coming soon"}</strong>
            <p>
              {isAr
                ? "نعمل على إضافة محتوى جديد. يمكنك متابعة التسوق والعودة لاحقًا."
                : "We are preparing new content. You can continue shopping and check back soon."}
            </p>
          </div>
        ) : (
          <div className="blog-grid">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={buildStorePath(locale, `/blog/${post.slug}`, region)}
                className="blog-card"
              >
                <div className="blog-card-image">
                  <img src={post.image} alt={post.title} loading="lazy" />
                </div>
                <div className="blog-card-body">
                  <span className="blog-date">{post.published_at}</span>
                  <h2 style={{ margin: 0, fontSize: "1.08rem", lineHeight: 1.35 }}>{post.title}</h2>
                  <p>{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </StorefrontShell>
  );
}
