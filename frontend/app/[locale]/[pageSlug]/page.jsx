import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import { getNavigationData } from "@/lib/api";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront";

const STATIC_CONTENT = {
  about: {
    en: {
      title: "About EnfhantOrganic",
      body: "Premium, gentle care essentials curated for babies, kids, and families across the Gulf.",
    },
    ar: {
      title: "عن إنفانت أورجانيك",
      body: "أساسيات عناية لطيفة ومميزة للأطفال والعائلات في دول الخليج.",
    },
  },
  contact: {
    en: {
      title: "Contact",
      body: "Reach our care team for product guidance, order support, and regional delivery questions.",
    },
    ar: {
      title: "تواصل معنا",
      body: "تواصل مع فريق العناية لأسئلة المنتجات والطلبات والتوصيل.",
    },
  },
  faq: {
    en: {
      title: "FAQ",
      body: "Find quick answers about products, delivery, payment methods, and order tracking.",
    },
    ar: {
      title: "الأسئلة الشائعة",
      body: "إجابات سريعة حول المنتجات والتوصيل وطرق الدفع وتتبع الطلبات.",
    },
  },
  "shipping-policy": {
    en: {
      title: "Shipping Policy",
      body: "Shipping fees and free-shipping thresholds are configured by region for Saudi Arabia, Oman, and UAE.",
    },
    ar: {
      title: "سياسة الشحن",
      body: "رسوم الشحن وحدود الشحن المجاني مضبوطة حسب السعودية وعمان والإمارات.",
    },
  },
  "return-policy": {
    en: {
      title: "Return Policy",
      body: "Eligible unopened products can be reviewed by our support team according to regional policy.",
    },
    ar: {
      title: "سياسة الاسترجاع",
      body: "يمكن مراجعة المنتجات المؤهلة وغير المفتوحة مع فريق الدعم حسب سياسة كل منطقة.",
    },
  },
  "privacy-policy": {
    en: {
      title: "Privacy Policy",
      body: "Customer data is used only for account, order, delivery, and support workflows.",
    },
    ar: {
      title: "سياسة الخصوصية",
      body: "تستخدم بيانات العملاء فقط للحسابات والطلبات والتوصيل والدعم.",
    },
  },
  terms: {
    en: {
      title: "Terms",
      body: "Using this storefront means accepting the regional order, delivery, and payment terms.",
    },
    ar: {
      title: "الشروط والأحكام",
      body: "استخدام المتجر يعني قبول شروط الطلب والتوصيل والدفع حسب المنطقة.",
    },
  },
};

export default async function StaticPage({ params, searchParams }) {
  const { locale: localeParam, pageSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale || !STATIC_CONTENT[pageSlug]) {
    notFound();
  }

  const region = normalizeRegion(resolvedSearchParams?.region || "om");
  const navigation = await getNavigationData(locale, region);
  const content = STATIC_CONTENT[pageSlug][locale];

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <main className="section container">
        <article className="checkout-card static-page-card">
          <p className="eyebrow">EnfhantOrganic</p>
          <h1>{content.title}</h1>
          <p>{content.body}</p>
        </article>
      </main>
    </StorefrontShell>
  );
}
