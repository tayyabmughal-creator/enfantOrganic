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
  return request("/navigation/", locale, region);
}

export function getHomePageData(locale, region) {
  return request("/home/", locale, region);
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
