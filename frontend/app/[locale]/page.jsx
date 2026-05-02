import Link from "next/link";
import { notFound } from "next/navigation";

import ProductCard from "@/components/cards/ProductCard";
import TestimonialCard from "@/components/cards/TestimonialCard";
import StorefrontShell from "@/components/layout/StorefrontShell";
import CategoryCarousel from "@/components/store/CategoryCarousel";
import { getHomePageData, getNavigationData } from "@/lib/api";
import { buildStorePath, normalizeLocale, normalizeRegion, uiText } from "@/lib/storefront";

export default async function LocalizedHomePage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const region = normalizeRegion(resolvedSearchParams.region);
  const [navigation, home] = await Promise.all([
    getNavigationData(locale, region),
    getHomePageData(locale, region),
  ]);

  const t = uiText(locale);

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section container">
        <div className="hero-grid">
          {home.hero_cards.map((card, index) => (
            <Link
              key={`${card.title}-${index}`}
              href={buildStorePath(locale, card.href || "/collections", region)}
              className={`hero-card hero-card-${card.size} accent-${card.accent}`}
            >
              <img src={card.image} alt={card.title} />
              <div className="hero-card-overlay" />
              <div className="hero-card-copy">
                <h2>{card.title}</h2>
                <p>{card.subtitle}</p>
                {card.cta ? <span className="hero-card-cta">{card.cta}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section-heading">
          <div>
            <h3>{home.categories_heading.title}</h3>
            <p>{home.categories_heading.subtitle}</p>
          </div>
          <Link href={buildStorePath(locale, "/collections", region)} className="section-link">
            {home.categories_heading.cta}
          </Link>
        </div>
        <CategoryCarousel
          categories={home.categories}
          href={buildStorePath(locale, "/collections", region)}
        />
      </section>

      {home.sections.map((section) => (
        <section key={section.key} className="section container">
          <div className="section-heading">
            <div>
              <h3>{section.title}</h3>
              {section.subtitle ? <p>{section.subtitle}</p> : null}
            </div>
            <Link href={buildStorePath(locale, "/collections", region)} className="section-link">
              {t.viewAll}
            </Link>
          </div>
          <div className="product-rail">
            {section.products.map((product) => (
              <ProductCard
                key={product.slug}
                locale={locale}
                product={product}
                region={region}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="section section-muted">
        <div className="container">
          <div className="section-heading">
            <div>
              <h3>{home.reviews_heading}</h3>
            </div>
          </div>
          <div className="review-grid">
            {home.testimonials.map((testimonial) => (
              <TestimonialCard key={`${testimonial.name}-${testimonial.location}`} testimonial={testimonial} />
            ))}
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="section-heading">
          <div>
            <h3>{home.instagram.title}</h3>
          </div>
          <a href="https://www.instagram.com/enfant_middle_east/" className="section-link">
            {home.instagram.cta}
          </a>
        </div>
        <div className="instagram-grid">
          {home.instagram.posts.map((post, index) => (
            <a key={`${post.href}-${index}`} href={post.href} className="instagram-tile">
              <img src={post.image} alt="Enfant Instagram" loading="lazy" />
            </a>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section-heading">
          <div>
            <h3>{home.blog.title}</h3>
          </div>
          <Link href={buildStorePath(locale, "/collections", region)} className="section-link">
            {home.blog.cta}
          </Link>
        </div>
        <div className="blog-grid">
          {home.blog.posts.map((post) => (
            <article key={post.slug} className="blog-card">
              <div className="blog-card-image">
                <img src={post.image} alt={post.title} loading="lazy" />
              </div>
              <div className="blog-card-body">
                <span className="blog-date">{post.published_at}</span>
                <h4>{post.title}</h4>
                <p>{post.excerpt}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="newsletter-strip">
          <div>
            <h3>{home.newsletter.title}</h3>
            <p>{home.newsletter.subtitle}</p>
          </div>
          <form className="newsletter-form">
            <input type="email" placeholder={home.newsletter.placeholder || t.newsletterPlaceholder} />
            <button type="submit">{home.newsletter.cta}</button>
          </form>
        </div>
      </section>
    </StorefrontShell>
  );
}
