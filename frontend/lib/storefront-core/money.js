import { normalizeLocale } from "./routing";

const LOCALE_MAP = {
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

// Intl.NumberFormat construction is expensive and product grids format prices
// many times per render. Cache one formatter per (intlLocale + currency) so the
// formatter is built once and reused — output is identical, just far cheaper.
const formatterCache = new Map();

function getCurrencyFormatter(intlLocale, currency) {
  const key = `${intlLocale}|${currency}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency,
      // Force Western/Latin digits (0-9) even in Arabic locales so prices read
      // consistently across the storefront (the brand uses ASCII numerals).
      numberingSystem: "latn",
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

export function formatMoney(pricing, locale) {
  if (!pricing) {
    return "";
  }

  const normalizedLocale = normalizeLocale(locale);
  const intlLocale = LOCALE_MAP[normalizedLocale]?.[pricing.region_code] || "en-US";

  const formatted = getCurrencyFormatter(intlLocale, pricing.currency_code).format(pricing.amount);
  return pricing.prefix ? `${pricing.prefix} ${formatted}` : formatted;
}
