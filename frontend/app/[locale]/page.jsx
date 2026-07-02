import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 120; // 2 minutes — admin changes reflect quickly

import SiteImage from "@/components/ui/SiteImage";
import Icon from "@/components/icons/Icon";
import JsonLd from "@/components/seo/JsonLd";
import StorefrontShell from "@/components/layout/StorefrontShell";
import CategoryCarousel from "@/components/store/CategoryCarousel";
import NewsletterForm from "@/components/store/NewsletterForm";
import ProductRail from "@/components/store/ProductRail";
import TestimonialsSlider from "@/components/store/TestimonialsSlider";
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
    "baby-sets": "/collections?collection=baby_sets",
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
      <h1 className="visually-hidden">{isAr ? "متجر إنفانت أورجانيك" : "Enfant Organic Store"}</h1>
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
                <picture>
                  {heroPrimary.image_mobile ? (
                    <source media="(max-width: 639px)" srcSet={heroPrimary.image_mobile} />
                  ) : null}
                  <img
                    src={heroPrimary.image}
                    alt={heroPrimary.title}
                    className="offer-primary-img"
                    loading="eager"
                    fetchPriority="high"
                  />
                </picture>
                <div className="offer-copy">
                  {heroPrimary.eyebrow ? (
                    <span className="offer-eyebrow">
                      {heroPrimary.eyebrow}
                    </span>
                  ) : null}
                  {heroPrimary.title ? <h2>{heroPrimary.title}</h2> : null}
                  {heroPrimary.subtitle ? <p>{heroPrimary.subtitle}</p> : null}
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
                <picture>
                  {heroSecondary.image_mobile ? (
                    <source media="(max-width: 639px)" srcSet={heroSecondary.image_mobile} />
                  ) : null}
                  <img
                    src={heroSecondary.image}
                    alt={heroSecondary.title}
                    className="offer-secondary-img"
                    loading="eager"
                  />
                </picture>
                <div className="offer-secondary-copy">
                  {heroSecondary.eyebrow ? (
                    <span className="offer-secondary-eyebrow">
                      {heroSecondary.eyebrow}
                    </span>
                  ) : null}
                  {heroSecondary.title ? <h3>{heroSecondary.title}</h3> : null}
                  {heroSecondary.subtitle ? <p>{heroSecondary.subtitle}</p> : null}
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
                    <picture>
                      {card.image_mobile ? (
                        <source media="(max-width: 639px)" srcSet={card.image_mobile} />
                      ) : null}
                      <img src={card.image} alt={card.title} loading="lazy" />
                    </picture>
                  </div>
                  <div className="offer-tile-body">
                    {card.eyebrow ? (
                      <span className="offer-tile-eyebrow">
                        {card.eyebrow}
                      </span>
                    ) : null}
                    {card.title ? <h4>{card.title}</h4> : null}
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
        <div className="our-story">
          <div className="our-story-top">
            <div>
              <span className="our-story-eyebrow">{isAr ? "قصتنا" : "Our Story"}</span>
              <h2 className="our-story-headline">
                {isAr
                  ? "أربعة عقود من العناية النقية، وموطن جديد في الخليج."
                  : "Four decades of pure care. One new home in the Gulf."}
              </h2>
            </div>
            <p className="our-story-lede">
              {isAr
                ? "وُلدت في تايلاند عام 1984، ووصلت إلى الخليج عام 2025."
                : "Born in Thailand, 1984. Arrived in the GCC, 2025."}
            </p>
          </div>

          <div className="our-story-strip-wrap">
            <div className="our-story-strip">
              {[
                {
                  year: "1984",
                  image: "/enfant/our-story-1984.webp",
                  en: "Enfant is founded in Thailand with one promise: pure, natural care for baby's delicate skin.",
                  ar: "تأسست إنفانت في تايلاند بوعد واحد: عناية نقية وطبيعية لبشرة الطفل الحساسة.",
                },
                {
                  year: "1986",
                  image: "/enfant/our-story-1986.webp",
                  en: "The brand launches its first toiletry range, made with natural ingredients.",
                  ar: "أطلقت العلامة أول مجموعة عناية لها، مصنوعة من مكونات طبيعية.",
                },
                {
                  year: "2013",
                  image: "/enfant/our-story-2013.webp",
                  en: "Enfant launches an organic toiletry line — same trusted formulas, now free from harsh chemicals.",
                  ar: "أطلقت إنفانت خط عناية عضوي — نفس التركيبات الموثوقة، الآن خالية من المواد الكيميائية القاسية.",
                },
                {
                  year: "2025",
                  launch: true,
                  image: "/enfant/our-story-2025.webp",
                  en: "Enfant Organic arrives in the GCC — organic-certified and dermatologically tested in Germany.",
                  ar: "تصل إنفانت أورجانيك إلى الخليج — معتمدة عضويًا ومختبرة جلديًا في ألمانيا.",
                  badgeEn: "Now Here",
                  badgeAr: "الآن هنا",
                },
              ].map((node) => (
                <div key={node.year} className={`our-story-node${node.launch ? " is-launch" : ""}`}>
                  <span className="our-story-photo">
                    <SiteImage src={node.image} alt="" fill sizes="74px" />
                  </span>
                  <div className="our-story-year">{node.year}</div>
                  <p className="our-story-caption">{isAr ? node.ar : node.en}</p>
                  {node.launch ? (
                    <span className="our-story-badge">{isAr ? node.badgeAr : node.badgeEn}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="our-story-bottom">
            <div className="our-story-trust">
              <span className="our-story-trust-item"><i className="our-story-dot" aria-hidden="true" />{isAr ? "تأسست 1984" : "Est. 1984"}</span>
              <span className="our-story-trust-item"><i className="our-story-dot" aria-hidden="true" />{isAr ? "عضوي ECOCERT" : "ECOCERT Organic"}</span>
              <span className="our-story-trust-item"><i className="our-story-dot" aria-hidden="true" />{isAr ? "مختبر جلديًا في ألمانيا" : "Dermatologically Tested in Germany"}</span>
            </div>
            <Link href={buildStorePath(locale, "/collections", region)} className="our-story-cta">
              {isAr ? "اكتشفي منتجاتنا" : "Discover our products"}
              <span aria-hidden="true">{isAr ? "←" : "→"}</span>
            </Link>
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
            <>
              <ProductRail
                products={sectionProducts}
                locale={locale}
                region={region}
                listId={`home_${section.key}`}
                listName={section.title}
              />
              <div className="section-view-all-mobile">
                <Link
                  href={buildStorePath(locale, sectionPathByKey[section.key] || "/collections", region)}
                  className="section-link"
                >
                  {t.viewAll}
                </Link>
              </div>
            </>
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
            <TestimonialsSlider testimonials={testimonials} locale={locale} />
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
                className="instagram-tile"
                target="_blank"
                rel="noopener noreferrer"
              >
                <SiteImage src={post.image} alt="Enfant Instagram" fill sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw" />
                <div className="instagram-logo-overlay">
                  <div className="instagram-logo-circle">
                    <Icon name="instagram" size={42} />
                  </div>
                </div>
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
                  <SiteImage src={post.image} alt={post.title} fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" />
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
