const API_BASE_URL =
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

async function request(path, locale, region) {
  const params = new URLSearchParams({
    locale,
    region,
  });

  const response = await fetch(`${API_BASE_URL}${path}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${path}: ${response.status}`);
  }

  return response.json();
}

export function getNavigationData(locale, region) {
  return request("/navigation/", locale, region);
}

export function getHomePageData(locale, region) {
  return request("/home/", locale, region);
}

export function getCatalogData(locale, region) {
  return request("/catalog/", locale, region);
}

export function getProductBySlug(slug, locale, region) {
  return request(`/products/${slug}/`, locale, region);
}
