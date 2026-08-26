// Extension spelled out so node --test can import this module directly.
import { normalizeLocale } from "./routing.js";

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

/**
 * The cart-milestone reward a basket has already unlocked.
 *
 * Mirrors the server's apply_milestone_rewards(): free shipping if any reached
 * milestone grants it, and the single largest percentage among the reached
 * discount milestones — percentages do not stack. The amount is rounded to two
 * decimals half-up, the same quantisation the checkout totals use, so the cart
 * quotes the figure the order summary will.
 *
 * The cart used to promise "10% Off unlocked" on the progress bar and then show
 * a subtotal with no discount in it, so the saving the shopper had been told
 * about only turned into a number once they reached checkout.
 *
 * A coupon or gift card suppresses the reward server-side, which is why this is
 * only ever an estimate: neither can be entered before checkout.
 */
export function milestoneReward(milestones = [], subtotal = 0) {
  let discountPct = 0;
  let freeShipping = false;

  for (const milestone of Array.isArray(milestones) ? milestones : []) {
    if (Number(subtotal) < Number(milestone?.threshold)) continue;
    if (milestone.reward_type === "free_shipping") {
      freeShipping = true;
    } else if (milestone.reward_type === "discount_percent") {
      discountPct = Math.max(discountPct, Number(milestone.discount_value) || 0);
    }
  }

  const discount = discountPct > 0 ? Math.round(Number(subtotal) * discountPct) / 100 : 0;
  return { discountPct, discount, freeShipping };
}
