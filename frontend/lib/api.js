import { normalizeLocale, normalizeRegion } from "@/lib/storefront-core/routing";

const API_BASE_URL =
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const DEFAULT_TIMEOUT_MS = 15000;

class ApiError extends Error {
  constructor(message, status, path) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

function fallbackRegion(code = "om", locale = "en") {
  const normalizedCode = normalizeRegion(code);
  const regionMap = {
    om: {
      code: "om",
      name: locale === "ar" ? "عُمان" : "Oman",
      currency_code: "OMR",
      shipping_threshold: "0.00",
      contact_phone: "",
      contact_email: "",
      address: "",
      is_default: true,
    },
    ae: {
      code: "ae",
      name: locale === "ar" ? "الإمارات" : "UAE",
      currency_code: "AED",
      shipping_threshold: "0.00",
      contact_phone: "",
      contact_email: "",
      address: "",
      is_default: false,
    },
    sa: {
      code: "sa",
      name: locale === "ar" ? "السعودية" : "Saudi Arabia",
      currency_code: "SAR",
      shipping_threshold: "0.00",
      contact_phone: "",
      contact_email: "",
      address: "",
      is_default: false,
    },
  };
  return {
    locale_code: locale,
    whatsapp_phone: "",
    shipping_fee: "0.00",
    free_shipping_threshold: "0.00",
    require_map_pin: false,
    payment_enabled_providers: [],
    default_payment_provider: "",
    payment_supported_methods: [],
    payment_mode: "",
    payment_provider_options: [],
    payment_provider_warnings: [],
    carrier_enabled: false,
    primary_carrier: "",
    fallback_carrier: "",
    carrier_options: [],
    carrier_warnings: [],
    is_active: true,
    ...regionMap[normalizedCode],
  };
}

function fallbackNavigation(locale, region) {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedRegion = normalizeRegion(region);
  const isAr = normalizedLocale === "ar";
  const regions = ["om", "ae", "sa"].map((code) => fallbackRegion(code, normalizedLocale));
  const currentRegion = regions.find((item) => item.code === normalizedRegion) || regions[0];
  const settings = {
    brand_name: "Enfant Organics",
    announcement: isAr ? "عناية طبيعية ولطيفة للأطفال" : "Pure, gentle baby care essentials",
    footer_about: isAr
      ? "منتجات عناية طبيعية ولطيفة للأطفال."
      : "Natural, gentle baby-care essentials for everyday routines.",
    newsletter_title: isAr ? "انضمي إلى نشرتنا" : "Join our newsletter",
    newsletter_subtitle: isAr ? "احصلي على آخر العروض والتحديثات." : "Get the latest offers and product updates.",
    instagram_title: isAr ? "تابعينا على إنستغرام" : "Follow us on Instagram",
    instagram_cta: isAr ? "مشاهدة الحساب" : "View profile",
    blog_title: isAr ? "من المدونة" : "From the Blog",
    logo_url: "/enfant/enfant-logo.png",
    tagline: isAr ? "نقي • لطيف • آمن" : "Pure • Gentle • Safe",
    copyright: "",
    policy_links: [],
    why_choose_links: [],
    static_links: [],
    contact_email: "",
    contact_phone: "",
    address: "",
    facebook_url: "",
    instagram_url: "",
    twitter_url: "",
    youtube_url: "",
    tiktok_url: "",
    whatsapp_number: "",
  };
  return {
    locale: normalizedLocale,
    direction: isAr ? "rtl" : "ltr",
    current_region: currentRegion,
    regions,
    settings,
    menus: {
      product_categories: [],
      why_choose_us: [],
      static_links: [],
    },
    contact: {
      phone: "",
      email: "",
    },
    is_fallback: true,
  };
}

function fallbackHomePage(locale) {
  const normalizedLocale = normalizeLocale(locale);
  const isAr = normalizedLocale === "ar";
  return {
    hero_cards: [],
    categories_heading: {
      title: isAr ? "تسوق حسب الفئة" : "Shop by Category",
      subtitle: isAr ? "سيتم تحميل المجموعات عند اتصال المتجر." : "Collections will load when the store API is available.",
      cta: isAr ? "عرض جميع الفئات" : "View All Categories",
    },
    categories: [],
    sections: [],
    reviews_heading: isAr ? "آراء عملاء إنفانت" : "ENFANT Reviews",
    testimonials: [],
    instagram: {
      title: isAr ? "تابعينا على إنستغرام" : "Follow us on Instagram",
      cta: isAr ? "مشاهدة الحساب" : "View profile",
      posts: [],
    },
    blog: {
      title: isAr ? "من المدونة" : "From the Blog",
      cta: isAr ? "عرض الكل" : "View all",
      posts: [],
    },
    newsletter: {
      title: isAr ? "انضمي إلى نشرتنا" : "Join our newsletter",
      subtitle: isAr ? "احصلي على آخر العروض والتحديثات." : "Get the latest offers and product updates.",
      placeholder: isAr ? "البريد الإلكتروني" : "Email address",
      cta: isAr ? "اشترك في النشرة البريدية" : "Subscribe to newsletter",
    },
    is_fallback: true,
  };
}

async function request(path, locale, region, extraParams = {}) {
  const params = new URLSearchParams();
  params.set("locale", normalizeLocale(locale));
  params.set("region", normalizeRegion(region));

  for (const [key, value] of Object.entries(extraParams)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null || entry === "") continue;
        params.append(key, String(entry));
      }
      continue;
    }
    params.set(key, String(value));
  }

  const url = `${API_BASE_URL}${path}?${params.toString()}`;

  // Timeout via AbortController (works in Node 18+ and all modern browsers)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new ApiError(`API request timed out for ${path}`, 0, path);
    }
    throw new ApiError(`Network error for ${path}: ${err.message}`, 0, path);
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let detail = `API request failed for ${path}: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // Response body is not JSON — use default message
    }
    throw new ApiError(detail, response.status, path);
  }

  // Safe JSON parse
  try {
    const data = await response.json();
    // Handle DRF paginated responses — extract results array if present
    if (data && typeof data === "object" && Array.isArray(data.results) && "count" in data) {
      return data.results;
    }
    return data;
  } catch {
    throw new ApiError(`Invalid JSON response from ${path}`, response.status, path);
  }
}

export function getNavigationData(locale, region) {
  return request("/navigation/", locale, region).catch((error) => {
    console.warn(error.message);
    return fallbackNavigation(locale, region);
  });
}

export function getHomePageData(locale, region) {
  return request("/home/", locale, region).catch((error) => {
    console.warn(error.message);
    return fallbackHomePage(locale);
  });
}

export function getCatalogData(locale, region, filters = {}) {
  return request("/catalog/", locale, region, filters);
}

export function getProductBySlug(slug, locale, region) {
  return request(`/products/${slug}/`, locale, region);
}

export function getBlogList(locale, region) {
  return request("/blog/", locale, region);
}

export function getBlogBySlug(slug, locale, region) {
  return request(`/blog/${slug}/`, locale, region);
}

export async function getCmsPageBySlug(slug, locale, region) {
  try {
    return await request(`/pages/${slug}/`, locale, region);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    console.warn(error?.message || `Failed to load CMS page ${slug}`);
    return null;
  }
}
