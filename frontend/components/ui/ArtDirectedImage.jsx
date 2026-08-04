import { buildOptimizedSrc, buildOptimizedSrcSet } from "@/lib/imageOptimizer";

// Phone-sized crops never need more than ~828px; the wide crop covers up to 2x
// desktop. Both lists must only contain widths declared in next.config.mjs.
const MOBILE_WIDTHS = [390, 640, 828];
const WIDE_WIDTHS = [828, 1080, 1200, 1920];

// Fallback width used for the plain src attribute on browsers that ignore srcSet.
const FALLBACK_WIDTH = 1200;

/**
 * A <picture> with an art-directed mobile crop, served through the image optimizer.
 *
 * next/image cannot express a separate mobile source, so these were previously
 * plain <img> tags pointing straight at the uploaded original. The hero banner was
 * shipping 1.9 MB of untouched JPEG to phones — the same image is ~30 KB once
 * resized, and it was the single biggest contributor to a 22s mobile LCP.
 */
export default function ArtDirectedImage({
  src,
  mobileSrc = "",
  alt = "",
  className,
  priority = false,
  sizes = "100vw",
  mobileSizes = "100vw",
}) {
  if (!src) {
    return null;
  }

  return (
    <picture>
      {mobileSrc ? (
        <source
          media="(max-width: 639px)"
          srcSet={buildOptimizedSrcSet(mobileSrc, MOBILE_WIDTHS) || mobileSrc}
          sizes={mobileSizes}
        />
      ) : null}
      <img
        src={buildOptimizedSrc(src, FALLBACK_WIDTH)}
        srcSet={buildOptimizedSrcSet(src, WIDE_WIDTHS)}
        sizes={sizes}
        alt={alt}
        className={className}
        // The hero is the LCP element, so it must not be lazy and should outrank
        // the rest of the page's requests.
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
      />
    </picture>
  );
}
