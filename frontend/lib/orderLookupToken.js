const ORDER_LOOKUP_TOKEN_PREFIX = "enfant-order-lookup-token:";

function storageKey(orderNumber) {
  return `${ORDER_LOOKUP_TOKEN_PREFIX}${String(orderNumber || "").trim()}`;
}

export function saveOrderLookupToken(orderNumber, lookupToken) {
  const cleanOrderNumber = String(orderNumber || "").trim();
  const cleanToken = String(lookupToken || "").trim();
  if (!cleanOrderNumber || !cleanToken || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(cleanOrderNumber), cleanToken);
  } catch {
    // Non-fatal: explicit token URLs and order emails still work.
  }
}

export function readOrderLookupToken(orderNumber) {
  const cleanOrderNumber = String(orderNumber || "").trim();
  if (!cleanOrderNumber || typeof window === "undefined") {
    return "";
  }
  try {
    return String(window.localStorage.getItem(storageKey(cleanOrderNumber)) || "").trim();
  } catch {
    return "";
  }
}

export function lookupSuffix({ lookupToken = "", emailOrPhone = "" } = {}) {
  const cleanToken = String(lookupToken || "").trim();
  const cleanContact = String(emailOrPhone || "").trim();
  if (cleanToken) {
    return `&lookup_token=${encodeURIComponent(cleanToken)}`;
  }
  if (cleanContact) {
    return `&email_or_phone=${encodeURIComponent(cleanContact)}`;
  }
  return "";
}
