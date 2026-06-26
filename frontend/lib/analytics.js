const CONSENT_STORAGE_KEY = "enfant-analytics-consent";
const PURCHASE_STORAGE_PREFIX = "enfant-purchase-event";

export const ANALYTICS_CONSENT_EVENT = "enfant:analytics-consent";
export const CONSENT_STATES = {
  GRANTED: "granted",
  DENIED: "denied",
  UNSET: "unset",
};

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isBrowser() {
  return typeof window !== "undefined";
}

export function ensureDataLayer() {
  if (!isBrowser()) {
    return [];
  }
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

export function getConsentState() {
  if (!isBrowser()) {
    return CONSENT_STATES.UNSET;
  }
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === CONSENT_STATES.GRANTED || stored === CONSENT_STATES.DENIED) {
      return stored;
    }
  } catch {
    return CONSENT_STATES.UNSET;
  }
  return CONSENT_STATES.UNSET;
}

export function hasConsent() {
  return getConsentState() === CONSENT_STATES.GRANTED;
}

export function setConsentState(nextState) {
  if (!isBrowser()) {
    return CONSENT_STATES.UNSET;
  }
  const state =
    nextState === CONSENT_STATES.GRANTED || nextState === CONSENT_STATES.DENIED
      ? nextState
      : CONSENT_STATES.UNSET;

  try {
    if (state === CONSENT_STATES.UNSET) {
      window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, state);
    }
  } catch {
    // Ignore storage access issues.
  }

  window.dispatchEvent(
    new CustomEvent(ANALYTICS_CONSENT_EVENT, {
      detail: { state },
    }),
  );
  return state;
}

export function pushDataLayerEvent(eventName, payload = {}, options = {}) {
  if (!isBrowser() || !eventName) {
    return false;
  }
  const requireConsent = options.requireConsent !== false;
  if (requireConsent && !hasConsent()) {
    return false;
  }
  const dataLayer = ensureDataLayer();
  dataLayer.push({
    event: eventName,
    ...payload,
  });
  return true;
}

export function buildAnalyticsItem(input, extras = {}) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const price = asNumber(
    input.price ??
      input.unit_price ??
      input.pricing?.amount ??
      (input.line_total && input.quantity ? asNumber(input.line_total) / Math.max(asNumber(input.quantity), 1) : 0),
  );
  const quantity = Math.max(asNumber(input.quantity || 1), 1);

  const item = {
    item_id: input.product_slug || input.slug || input.id || "",
    item_name: input.product_name || input.name || "",
    item_brand: input.vendor || input.brand || "Enfant Organic",
    item_category:
      input.category_name ||
      input.category?.name ||
      input.category ||
      "",
    item_variant: input.selected_options_text || input.selectedOptionsText || input.unit || "",
    price,
    quantity,
    ...extras,
  };

  if (!item.item_id && !item.item_name) {
    return null;
  }
  return item;
}

export function buildAnalyticsItems(list, extrasBuilder = null) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((entry, index) => {
      const extras =
        typeof extrasBuilder === "function" ? extrasBuilder(entry, index) : null;
      return buildAnalyticsItem(entry, extras || {});
    })
    .filter(Boolean);
}

function getPurchaseStorageKey(orderNumber) {
  return `${PURCHASE_STORAGE_PREFIX}:${String(orderNumber || "").trim()}`;
}

export function hasPurchaseEventFired(orderNumber) {
  if (!isBrowser() || !orderNumber) {
    return false;
  }
  try {
    return window.localStorage.getItem(getPurchaseStorageKey(orderNumber)) === "1";
  } catch {
    return false;
  }
}

export function markPurchaseEventFired(orderNumber) {
  if (!isBrowser() || !orderNumber) {
    return false;
  }
  try {
    window.localStorage.setItem(getPurchaseStorageKey(orderNumber), "1");
    return true;
  } catch {
    return false;
  }
}

