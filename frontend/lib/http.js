// Safe JSON handling for client-side API calls.
//
// Backend/proxy failures (DisallowedHost, 404, 502/503/504 gateway pages, a
// Next.js HTML shell served for a mis-proxied route, etc.) return HTML, not
// JSON. Calling response.json() on those throws the opaque
// "Unexpected token '<', \"<html>...\" is not valid JSON" SyntaxError, which
// then surfaces to the user as a crash.
//
// readJson() inspects the Content-Type first: genuine JSON bodies (including
// JSON error responses like a 400 with field errors) are parsed and returned so
// callers can display them; anything else raises a clean, localized message.

export function isJsonResponse(response) {
  const contentType = response?.headers?.get?.("content-type") || "";
  return contentType.toLowerCase().includes("application/json");
}

export async function readJson(response, { isAr = false } = {}) {
  if (!isJsonResponse(response)) {
    throw new Error(
      isAr
        ? "تعذّر الاتصال بالخادم، يرجى المحاولة لاحقاً."
        : "The server returned an unexpected response. Please try again shortly.",
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(
      isAr
        ? "تعذّرت قراءة استجابة الخادم، يرجى المحاولة لاحقاً."
        : "Could not read the server response. Please try again.",
    );
  }
}
