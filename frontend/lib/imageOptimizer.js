// Hosts whose images may go through the Next.js image optimizer. Must stay in sync
// with images.remotePatterns in next.config.mjs — a host missing from either list
// quietly falls back to the untouched original.
export const OPTIMIZED_HOSTNAMES = [
  "www.enfantorganic.com",
  "app.enfantorganic.com",
  "om.enfantorganic.com",
  "ae.enfantorganic.com",
  "sa.enfantorganic.com",
  "127.0.0.1",
  "localhost",
];

// Only widths declared in next.config.mjs (deviceSizes + imageSizes) are served;
// anything else is rejected by the optimizer.
export const DEVICE_WIDTHS = [390, 640, 750, 828, 1080, 1200, 1920];

const DEFAULT_QUALITY = 82;

// /media is served by Django, not by Next.js. The optimizer resolves a relative
// src against its own origin, where that path does not exist, so a root-relative
// media path comes back as HTTP 400 and the image renders broken. Product images
// arrive absolute from the API but *variant* images arrive relative, which is why
// only variant products were affected.
const EXTERNALLY_SERVED_PREFIX = "/media/";

function siteOrigin() {
  // Read from the env rather than window.location so server and client render the
  // identical URL and hydration stays consistent.
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  return String(raw).replace(/\/+$/, "");
}

/**
 * Absolutises paths the optimizer cannot resolve on its own.
 *
 * Next's own public assets (/enfant, /icons, …) stay relative — those it serves
 * itself and they optimise correctly today.
 */
export function resolveImageSrc(src) {
  if (!src || typeof src !== "string" || !src.startsWith(EXTERNALLY_SERVED_PREFIX)) {
    return src;
  }
  const origin = siteOrigin();
  // With no configured origin, leaving the path relative is the safe outcome:
  // isOptimizable then declines it and the browser resolves it as a plain <img>.
  return origin ? `${origin}${src}` : src;
}

export function isOptimizable(src) {
  if (!src || typeof src !== "string") return false;
  // A media path with no configured origin cannot be optimised — see resolveImageSrc.
  if (src.startsWith(EXTERNALLY_SERVED_PREFIX)) return false;
  // Next.js serves its own public assets, so those are always optimisable.
  if (!src.startsWith("http://") && !src.startsWith("https://")) return true;
  try {
    return OPTIMIZED_HOSTNAMES.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

/**
 * Optimizer URL for a single width.
 *
 * `next/image` cannot be used inside a <picture> element, which the hero needs for
 * art-directed mobile crops. Without this the hero shipped its full-size original —
 * 1.9 MB for a banner that renders at 30 KB once resized, and the single biggest
 * cause of a 22s LCP on mobile.
 */
export function buildOptimizedSrc(src, width, quality = DEFAULT_QUALITY) {
  const resolved = resolveImageSrc(src);
  if (!isOptimizable(resolved)) return resolved;
  return `/_next/image?url=${encodeURIComponent(resolved)}&w=${width}&q=${quality}`;
}

export function buildOptimizedSrcSet(src, widths = DEVICE_WIDTHS, quality = DEFAULT_QUALITY) {
  const resolved = resolveImageSrc(src);
  if (!isOptimizable(resolved)) return undefined;
  return widths
    .filter((width) => DEVICE_WIDTHS.includes(width))
    .map((width) => `${buildOptimizedSrc(resolved, width, quality)} ${width}w`)
    .join(", ");
}
