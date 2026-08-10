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

  const formatted = getCurrencyFormatter(intlLocale, pricing.currency_code || pricing.currency || "USD").format(pricing.amount);
  return pricing.prefix ? `${pricing.prefix} ${formatted}` : formatted;
}

/**
 * What the shopper is saving on a basket, in the basket's own currency.
 *
 * Two things make up a saving and the customer thinks of them as one number:
 * a product sold below its compare-at price, and any discount applied at
 * checkout. Coupon and gift-card amounts are passed in because only the
 * checkout knows them; the cart drawer sees product savings alone.
 */
export function cartSavings(items = [], { discountAmount = 0, giftCardAmount = 0 } = {}) {
  const productSavings = (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const price = Number(item?.pricing?.amount) || 0;
    const compare = Number(item?.pricing?.compare_amount) || 0;
    const quantity = Number(item?.quantity) || 0;
    // A compare-at price below the selling price is bad data, not a saving.
    return compare > price ? sum + (compare - price) * quantity : sum;
  }, 0);

  const total = productSavings + (Number(discountAmount) || 0) + (Number(giftCardAmount) || 0);
  return Math.max(0, Math.round(total * 1000) / 1000);
}
