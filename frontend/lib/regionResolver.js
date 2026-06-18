import { API_BASE_URL } from "./config.js";
import { SUPPORTED_REGIONS, normalizeRegion } from "./storefront-core/routing.js";

export const SELECTED_REGION_STORAGE_KEY = "selectedRegion";

export function pickRegionParam(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }
  return value || "";
}

export function normalizeOptionalRegion(value) {
  const code = String(pickRegionParam(value) || "").trim().toLowerCase();
  return SUPPORTED_REGIONS.includes(code) ? code : "";
}

export function regionFromSearchParams(searchParams) {
  if (!searchParams) {
    return "";
  }
  if (typeof searchParams.get === "function") {
    return normalizeOptionalRegion(searchParams.get("region"));
  }
  return normalizeOptionalRegion(searchParams.region);
}

export function resolveServerRegion(searchParams) {
  return regionFromSearchParams(searchParams) || "om";
}

export function readStoredRegion() {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return normalizeOptionalRegion(window.localStorage.getItem(SELECTED_REGION_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function saveSelectedRegion(region) {
  const normalized = normalizeOptionalRegion(region);
  if (!normalized || typeof window === "undefined") {
    return "";
  }
  try {
    window.localStorage.setItem(SELECTED_REGION_STORAGE_KEY, normalized);
    // Sync to cookie so the server-side middleware can redirect www → correct subdomain.
    // domain=.enfantorganic.com is shared across all subdomains; silently ignored on localhost.
    document.cookie = `enfant-region=${normalized}; path=/; domain=.enfantorganic.com; max-age=${60 * 60 * 24 * 365}; samesite=lax; secure`;
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
  return normalized;
}

export async function detectBackendRegion({ locale = "en", fetchImpl = fetch } = {}) {
  const params = new URLSearchParams();
  if (locale) {
    params.set("locale", locale);
  }
  try {
    const response = await fetchImpl(`${API_BASE_URL}/regions/detect/?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return "om";
    }
    const data = await response.json();
    return normalizeOptionalRegion(data?.region_code || data?.region?.code) || "om";
  } catch {
    return "om";
  }
}

export async function resolveBrowserRegion({ searchParams, locale = "en" } = {}) {
  const urlRegion = regionFromSearchParams(searchParams);
  if (urlRegion) {
    saveSelectedRegion(urlRegion);
    return urlRegion;
  }

  const storedRegion = readStoredRegion();
  if (storedRegion) {
    return storedRegion;
  }

  const detectedRegion = await detectBackendRegion({ locale });
  saveSelectedRegion(detectedRegion);
  return detectedRegion;
}

export function urlWithRegion(pathname, searchParams, region) {
  const params =
    searchParams instanceof URLSearchParams
      ? new URLSearchParams(searchParams.toString())
      : new URLSearchParams(searchParams || "");
  params.set("region", normalizeRegion(region));
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export function appendRegionQuery(url, region) {
  const normalizedRegion = normalizeRegion(region);
  const [base, query = ""] = String(url || "").split("?");
  const params = new URLSearchParams(query);
  params.set("region", normalizedRegion);
  const nextQuery = params.toString();
  return `${base}${nextQuery ? `?${nextQuery}` : ""}`;
}
