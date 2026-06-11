import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 86400; // 24 hours

import TestimonialCard from "@/components/cards/TestimonialCard";
import Icon from "@/components/icons/Icon";
import JsonLd from "@/components/seo/JsonLd";
import StorefrontShell from "@/components/layout/StorefrontShell";
import CategoryCarousel from "@/components/store/CategoryCarousel";
import NewsletterForm from "@/components/store/NewsletterForm";
import ProductRail from "@/components/store/ProductRail";
import { getHomePageData, getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildSeoMetadata, SITE_NAME, toAbsoluteUrl, buildLocalizedPath } from "@/lib/seo";
import { buildStorePath, normalizeLocale, normalizeRegion, uiText } from "@/lib/storefront";

export async function generateMetadata({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const isAr = locale === "ar";

  let description = isAr
    ? "متجر إنفانت أورجانيك لمنتجات العناية الطبيعية والآمنة بالأطفال في الخليج."
    : "Enfant Organics baby-care essentials across Oman, UAE, and KSA.";
  let image = "/enfant/enfant-logo.png";

  try {
    const home = await getHomePageData(locale, region);
    const primaryHero = home.hero_cards?.find((item) => item.size === "large") || home.hero_cards?.[0];
    if (primaryHero?.subtitle) {
      description = primaryHero.subtitle;
    }
    if (primaryHero?.image) {
      image = primaryHero.image;
    }
  } catch {
    // Keep fallback metadata when API is unavailable.
  }

  const title = isAr
    ? "إنفانت أورجانيك | منتجات عناية طبيعية للأطفال"
    : "Enfant Organics | Natural Baby Care Essentials";

  return buildSeoMetadata({
    locale,
    region,
    path: "",
    title,
    description,
    image,
  });
}

export default async function LocalizedHomePage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const [navigation, home] = await Promise.all([
    getNavigationData(locale, region),
    getHomePageData(locale, region),
  ]);

  const t = uiText(locale);
  const isAr = locale === "ar";
  const categories = Array.isArray(home.categories) ? home.categories : [];
  const homeSections = Array.isArray(home.sections) ? home.sections : [];
  const testimonials = Array.isArray(home.testimonials) ? home.testimonials : [];
  const instagramPosts = Array.isArray(home?.instagram?.posts) ? home.instagram.posts : [];
  const blogPosts = Array.isArray(home?.blog?.posts) ? home.blog.posts : [];

  const OFFER_LABELS = {
    gift:     isAr ? "عرض حصري"       : "Exclusive Offer",
    soft:     isAr ? "الأكثر مبيعاً"  : "Best Seller",
    sets:     isAr ? "مجموعات مختارة" : "Curated Sets",
    moisture: isAr ? "منتج مميز"      : "Top Rated",
    choice:   isAr ? "اختيار الأمهات" : "Mom's Favourite",
    relax:    isAr ? "روتين الليل"    : "Night Routine",
    new:      isAr ? "وصل حديثاً"     : "New Arrival",
    sun:      isAr ? "حماية يومية"    : "Daily Care",
  };

  const heroCards = Array.isArray(home.hero_cards) ? home.hero_cards : [];
  const heroLarge = heroCards.filter((c) => c.size === "large");
  const heroPrimary = heroLarge[0];
  const heroSecondary = heroLarge[1];
  // Extra large cards (3rd+) flow into the chip grid so admins don't lose them.
  const heroChips = [
    ...heroCards.filter((c) => c.size !== "large"),
    ...heroLarge.slice(2),
  ];
  const heroMainCount = (heroPrimary ? 1 : 0) + (heroSecondary ? 1 : 0);
  const heroShowcaseEmpty = !heroPrimary && !heroSecondary && heroChips.length === 0;
  // Mobile 2-col: cards after primary. If odd count → last one gets full-width class.
  const heroRestCount = (heroSecondary ? 1 : 0) + heroChips.length;
  const heroRestOdd = heroRestCount % 2 === 1;
  // Which card is the last in the "rest" group?
  const heroLastIsSecondary = heroRestOdd && heroChips.length === 0 && heroSecondary;
  const heroLastOddChipIdx = heroRestOdd && heroChips.length > 0 ? heroChips.length - 1 : -1;
  const sectionPathByKey = {
    "new-arrivals": "/new-arrivals",
    "top-choices": "/best-sellers",
  };
  const sectionEmptyCopy = {
    "new-arrivals": {
      title: isAr ? "وصلات جديدة قريبًا" : "New arrivals are coming soon",
      message: isAr
        ? "نحدّث التشكيلة باستمرار. تابع العودة لاحقًا لمزيد من الخيارات."
        : "We update this collection regularly. Please check back soon.",
    },
    default: {
      title: isAr ? "يتم تحديث المنتجات لهذه المجموعة" : "Products are being updated for this collection",
      message: isAr
        ? "يمكنك متابعة التسوق أو اختيار مجموعة أخرى."
        : "You can continue shopping or explore another collection.",
    },
  };
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: toAbsoluteUrl(buildLocalizedPath(locale, "", region)),
    logo: toAbsoluteUrl("/enfant/enfant-logo.png"),
    email: navigation?.current_region?.contact_email || undefined,
    telephone: navigation?.current_region?.contact_phone || undefined,
    sameAs: ["https://www.instagram.com/enfant_middle_east/"],
  };

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <JsonLd data={organizationJsonLd} />
      {heroShowcaseEmpty ? null : (
      <section className="section container">
        <div className="offers-showcase">

          {heroMainCount > 0 ? (
          <div className={`offers-main offers-main--${heroMainCount === 1 ? "single" : "dual"}`}>
            {heroPrimary ? (
              <Link
                href={buildStorePath(locale, heroPrimary.href || "/collections", region)}
                className="offer-primary"
              >
                <img
                  src={heroPrimary.image}
                  alt={heroPrimary.title}
                  className="offer-primary-img"
                  loading="eager"
                />
                <div className="offer-copy">
                  <span className="offer-eyebrow">
                    {OFFER_LABELS[heroPrimary.accent] || "Featured"}
                  </span>
                  <h2>{heroPrimary.title}</h2>
                  <p>{heroPrimary.subtitle}</p>
                  {heroPrimary.cta ? (
                    <span className="offer-cta-pill">{heroPrimary.cta}</span>
                  ) : null}
                </div>
              </Link>
            ) : null}

            {heroSecondary ? (
              <Link
                href={buildStorePath(locale, heroSecondary.href || "/collections", region)}
                className={`offer-secondary${heroLastIsSecondary ? " offer-last-odd" : ""}`}
              >
                <img
                  src={heroSecondary.image}
                  alt={heroSecondary.title}
                  className="offer-secondary-img"
                  loading="eager"
                />
                <div className="offer-secondary-copy">
                  <span className="offer-secondary-eyebrow">
                    {OFFER_LABELS[heroSecondary.accent] || "Featured"}
                  </span>
                  <h3>{heroSecondary.title}</h3>
                  <p>{heroSecondary.subtitle}</p>
                  {heroSecondary.cta ? (
                    <span className="offer-secondary-cta">{heroSecondary.cta}</span>
                  ) : null}
                </div>
              </Link>
            ) : null}
          </div>
          ) : null}

          {heroChips.length > 0 ? (
            <div className="offers-grid" data-count={heroChips.length}>
              {heroChips.map((card, idx) => (
                <Link
                  key={card.title}
                  href={buildStorePath(locale, card.href || "/collections", region)}
                  className={`offer-tile${idx === heroLastOddChipIdx ? " offer-last-odd" : ""}`}
                >
                  <div className="offer-tile-img">
                    <img src={card.image} alt={card.title} loading="lazy" />
                  </div>
                  <div className="offer-tile-body">
                    <span className="offer-tile-eyebrow">
                      {OFFER_LABELS[card.accent] || ""}
                    </span>
                    <h4>{card.title}</h4>
                    {card.subtitle ? (
                      <p className="offer-tile-sub">{card.subtitle}</p>
                    ) : null}
                    {card.cta ? (
                      <span className="offer-tile-cta">{card.cta}</span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : null}

        </div>
      </section>
      )}

      <section className="section container">
        <div className="trust-strip">
          <div className="trust-item">
            <div className="trust-icon-wrap"><Icon name="leaf" size={22} /></div>
            <div className="trust-text">
              <strong>{locale === "ar" ? "مكونات طبيعية" : "Natural Ingredients"}</strong>
              <span>{locale === "ar" ? "خالية من المواد الكيميائية الضارة" : "Free from harmful chemicals"}</span>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon-wrap"><Icon name="shield" size={22} /></div>
            <div className="trust-text">
              <strong>{locale === "ar" ? "آمن للأطفال" : "Safe for Babies"}</strong>
              <span>{locale === "ar" ? "معتمد ومختبر طبيًا" : "Certified & dermatologically tested"}</span>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon-wrap"><Icon name="truck" size={22} /></div>
            <div className="trust-text">
              <strong>{t.freeShipping}</strong>
              <span>{locale === "ar" ? "على جميع الطلبات" : "On all orders"}</span>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon-wrap"><Icon name="check" size={22} /></div>
            <div className="trust-text">
              <strong>{t.originalProducts}</strong>
              <span>{locale === "ar" ? "ضمان الجودة 100%" : "100% quality guaranteed"}</span>
            </div>
          </div>
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
        {categories.length ? (
          <CategoryCarousel
            categories={categories}
            href={buildStorePath(locale, "/collections", region)}
            locale={locale}
          />
        ) : (
          <div className="store-empty-state">
            <strong>{isAr ? "الفئات قيد التحديث" : "Categories are being updated"}</strong>
            <p>
              {isAr
                ? "يمكنك تصفح جميع المنتجات أو التواصل معنا للمساعدة في الاختيار."
                : "Browse all products or contact support if you need help choosing."}
            </p>
          </div>
        )}
      </section>

      {homeSections.length ? homeSections.map((section) => {
        const sectionProducts = Array.isArray(section.products) ? section.products : [];
        return (
        <section key={section.key} className="section container">
          <div className="section-heading">
            <div>
              <h3>{section.title}</h3>
              {section.subtitle ? <p>{section.subtitle}</p> : null}
            </div>
            <Link
              href={buildStorePath(locale, sectionPathByKey[section.key] || "/collections", region)}
              className="section-link"
            >
              {t.viewAll}
            </Link>
          </div>
          {sectionProducts.length ? (
            <ProductRail
              products={sectionProducts}
              locale={locale}
              region={region}
              listId={`home_${section.key}`}
              listName={section.title}
            />
          ) : (
            <div className="store-empty-state">
              <strong>{(sectionEmptyCopy[section.key] || sectionEmptyCopy.default).title}</strong>
              <p>{(sectionEmptyCopy[section.key] || sectionEmptyCopy.default).message}</p>
              <div className="store-empty-state-actions">
                <Link href={buildStorePath(locale, "/collections", region)} className="secondary-action">
                  {t.continueShopping}
                </Link>
                <Link href={buildStorePath(locale, "/contact", region)} className="secondary-action">
                  {isAr ? "تواصل مع الدعم" : "Contact support"}
                </Link>
              </div>
            </div>
          )}
        </section>
      );
      }) : (
        <section className="section container">
          <div className="store-empty-state">
            <strong>{isAr ? "يتم تحديث المنتجات لمنطقتك" : "Products are being updated for your region"}</strong>
            <p>
              {isAr
                ? "يمكنك متابعة التصفح الآن أو العودة لاحقًا بعد إضافة منتجات جديدة."
                : "You can continue browsing now or check back soon as new products are added."}
            </p>
            <div className="store-empty-state-actions">
              <Link href={buildStorePath(locale, "/collections", region)} className="secondary-action">
                {t.continueShopping}
              </Link>
              <Link href={buildStorePath(locale, "/contact", region)} className="secondary-action">
                {isAr ? "تواصل مع الدعم" : "Contact support"}
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="section section-muted">
        <div className="container">
          <div className="section-heading">
            <div>
              <h3>{home.reviews_heading}</h3>
            </div>
          </div>
          {testimonials.length ? (
            <div className="review-grid">
              {testimonials.map((testimonial) => (
                <TestimonialCard key={`${testimonial.name}-${testimonial.location}`} testimonial={testimonial} />
              ))}
            </div>
          ) : (
            <div className="store-empty-state">
              <strong>{isAr ? "تجارب العملاء ستظهر هنا قريبًا" : "Customer stories will appear here soon"}</strong>
              <p>
                {isAr
                  ? "نواصل جمع المزيد من التقييمات الموثوقة لمساعدتك في الاختيار."
                  : "We are collecting more verified reviews to help you choose with confidence."}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="section container">
        <div className="instagram-header">
          <h3>{home.instagram.title}</h3>
          <a
            href="https://www.instagram.com/enfant_middle_east/"
            className="instagram-cta"
            target="_blank"
            rel="noopener noreferrer"
          >
            {home.instagram.cta}
          </a>
        </div>
        {instagramPosts.length ? (
          <div className="instagram-grid">
            {instagramPosts.map((post, index) => (
              <a
                key={`${post.href}-${index}`}
                href={post.href}
                className={`instagram-tile${index === 1 ? " instagram-tile-ig" : ""}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={post.image} alt="Enfant Instagram" loading="lazy" />
                {index === 1 && (
                  <div className="instagram-logo-overlay">
                    <div className="instagram-logo-circle">
                      <Icon name="instagram" size={42} />
                    </div>
                  </div>
                )}
              </a>
            ))}
          </div>
        ) : (
          <div className="store-empty-state">
            <strong>{isAr ? "تحديثات إنستغرام قريبًا" : "Instagram updates are coming soon"}</strong>
            <p>
              {isAr
                ? "يمكنك متابعة حسابنا للحصول على أحدث النصائح وإطلاقات المنتجات."
                : "Follow our profile for the latest tips and product launches."}
            </p>
          </div>
        )}
      </section>

      <section className="section container">
        <div className="section-heading">
          <div>
            <h3>{home.blog.title}</h3>
          </div>
          <Link href={buildStorePath(locale, "/blog", region)} className="section-link">
            {home.blog.cta}
          </Link>
        </div>
        {blogPosts.length ? (
          <div className="blog-grid">
            {blogPosts.map((post) => (
              <Link key={post.slug} href={buildStorePath(locale, `/blog/${post.slug}`, region)} className="blog-card">
                <div className="blog-card-image">
                  <img src={post.image} alt={post.title} loading="lazy" />
                </div>
                <div className="blog-card-body">
                  <span className="blog-date">{post.published_at}</span>
                  <h4>{post.title}</h4>
                  <p>{post.excerpt}</p>
                  <span className="blog-card-read-more">
                    {locale === "ar" ? "اقرأ المزيد" : "Read more"} <span aria-hidden="true">{locale === "ar" ? "←" : "→"}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="store-empty-state">
            <strong>{isAr ? "مقالات جديدة قريبًا" : "Fresh articles are coming soon"}</strong>
            <p>
              {isAr
                ? "نشارك نصائح عناية دورية، يمكنك العودة لاحقًا للاطلاع على أحدث المقالات."
                : "We publish baby-care insights regularly. Check back soon for the latest posts."}
            </p>
          </div>
        )}
      </section>

      <section className="section container">
        <div className="newsletter-strip">
          <div>
            <h3>{home.newsletter.title}</h3>
            <p>{home.newsletter.subtitle}</p>
          </div>
          <NewsletterForm
            placeholder={home.newsletter.placeholder || t.newsletterPlaceholder}
            cta={home.newsletter.cta}
            locale={locale}
            region={region}
          />
        </div>
      </section>
    </StorefrontShell>
  );
}
