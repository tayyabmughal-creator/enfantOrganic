import { normalizeLocale } from "./routing";

export function formatMoney(pricing, locale) {
  if (!pricing) {
    return "";
  }

  const localeMap = {
    en: {
      om: "en-OM",
      ae: "en-AE",
      sa: "en-SA",
    },
    ar: {
      om: "ar-OM",
      ae: "ar-AE",
      sa: "ar-SA",
    },
  };

  const normalizedLocale = normalizeLocale(locale);
  // Force Western/Latin digits (0-9) even in Arabic locales so prices read
  // consistently across the storefront (the brand uses ASCII numerals).
  const numberFormatter = new Intl.NumberFormat(
    localeMap[normalizedLocale][pricing.region_code] || "en-US",
    {
      style: "currency",
      currency: pricing.currency_code,
      numberingSystem: "latn",
    },
  );

  const formatted = numberFormatter.format(pricing.amount);
  return pricing.prefix ? `${pricing.prefix} ${formatted}` : formatted;
}
