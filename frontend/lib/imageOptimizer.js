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

export function isOptimizable(src) {
  if (!src || typeof src !== "string") return false;
  // Relative paths are always served by this app, so the optimizer can handle them.
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
  if (!isOptimizable(src)) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

export function buildOptimizedSrcSet(src, widths = DEVICE_WIDTHS, quality = DEFAULT_QUALITY) {
  if (!isOptimizable(src)) return undefined;
  return widths
    .filter((width) => DEVICE_WIDTHS.includes(width))
    .map((width) => `${buildOptimizedSrc(src, width, quality)} ${width}w`)
    .join(", ");
}
