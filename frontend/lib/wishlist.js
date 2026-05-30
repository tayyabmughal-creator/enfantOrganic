import { API_BASE_URL, CUSTOMER_TOKEN_KEY } from "@/lib/config";
import { normalizeLocale, normalizeRegion } from "@/lib/storefront-core/routing";

const WISHLIST_EVENT = "enfant:wishlist-updated";

const wishlistCache = new Map();
const inflightLoads = new Map();

function regionKey(region) {
  return normalizeRegion(region || "om");
}

function getToken() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function buildWishlistPath(region, locale) {
  const params = new URLSearchParams();
  params.set("region", regionKey(region));
  params.set("locale", normalizeLocale(locale || "en"));
  return `/account/wishlist/?${params.toString()}`;
}

function emitWishlistUpdate(region, slugs) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WISHLIST_EVENT, { detail: { region: regionKey(region), slugs: Array.from(slugs) } }));
}

async function wishlistRequest(region, locale, options = {}) {
  const token = getToken();
  if (!token) {
    const error = new Error("Authentication required.");
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  const response = await fetch(`${API_BASE_URL}${buildWishlistPath(region, locale)}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    const error = new Error("Authentication required.");
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.detail || "Wishlist request failed.");
    error.code = "REQUEST_FAILED";
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function hasWishlistSession() {
  return Boolean(getToken());
}

export function subscribeWishlist(listener) {
  if (typeof window === "undefined") return () => {};
  const handler = (event) => listener(event?.detail || { region: "om", slugs: [] });
  window.addEventListener(WISHLIST_EVENT, handler);
  return () => window.removeEventListener(WISHLIST_EVENT, handler);
}

export async function fetchWishlistItems({ region = "om", locale = "en" } = {}) {
  const normalizedRegion = regionKey(region);
  const items = await wishlistRequest(normalizedRegion, locale);
  const slugs = new Set((items || []).map((item) => item?.product?.slug).filter(Boolean));
  wishlistCache.set(normalizedRegion, slugs);
  emitWishlistUpdate(normalizedRegion, slugs);
  return items || [];
}

export async function ensureWishlistSlugs({ region = "om", locale = "en" } = {}) {
  const normalizedRegion = regionKey(region);
  const cached = wishlistCache.get(normalizedRegion);
  if (cached) {
    return cached;
  }

  if (inflightLoads.has(normalizedRegion)) {
    return inflightLoads.get(normalizedRegion);
  }

  const requestPromise = fetchWishlistItems({ region: normalizedRegion, locale })
    .then((items) => new Set(items.map((item) => item?.product?.slug).filter(Boolean)))
    .finally(() => inflightLoads.delete(normalizedRegion));

  inflightLoads.set(normalizedRegion, requestPromise);
  return requestPromise;
}

export async function addWishlistProduct(slug, { region = "om", locale = "en" } = {}) {
  const normalizedRegion = regionKey(region);
  await wishlistRequest(normalizedRegion, locale, {
    method: "POST",
    body: JSON.stringify({ product_slug: slug }),
  });
  const current = wishlistCache.get(normalizedRegion) || new Set();
  current.add(slug);
  wishlistCache.set(normalizedRegion, current);
  emitWishlistUpdate(normalizedRegion, current);
}

export async function removeWishlistProduct(slug, { region = "om", locale = "en" } = {}) {
  const normalizedRegion = regionKey(region);
  await wishlistRequest(normalizedRegion, locale, {
    method: "DELETE",
    body: JSON.stringify({ product_slug: slug }),
  });
  const current = wishlistCache.get(normalizedRegion) || new Set();
  current.delete(slug);
  wishlistCache.set(normalizedRegion, current);
  emitWishlistUpdate(normalizedRegion, current);
}

