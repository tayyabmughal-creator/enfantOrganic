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
  const numberFormatter = new Intl.NumberFormat(
    localeMap[normalizedLocale][pricing.region_code] || "en-US",
    {
      style: "currency",
      currency: pricing.currency_code,
    },
  );

  const formatted = numberFormatter.format(pricing.amount);
  return pricing.prefix ? `${pricing.prefix} ${formatted}` : formatted;
}
