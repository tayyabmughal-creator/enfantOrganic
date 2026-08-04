import NextImage from "next/image";

// Shared with the <picture>-based hero, which cannot use next/image directly.
import { isOptimizable, resolveImageSrc } from "@/lib/imageOptimizer";

/**
 * Drop-in replacement for <img> that uses next/image for known domains.
 * Falls back to a plain <img> for unknown external URLs so images never
 * go blank if a new domain is introduced before the config is updated.
 *
 * Usage (fill mode — parent must have position:relative + explicit size):
 *   <SiteImage src={url} alt="..." fill sizes="100vw" />
 *
 * Usage (fixed size):
 *   <SiteImage src={url} alt="..." width={800} height={600} />
 */
export default function SiteImage({ src, alt = "", fill, sizes, width, height, priority, loading, className, style, quality, ...rest }) {
  if (!src) return null;

  // Variant images come back from the API as root-relative /media paths, which the
  // optimizer cannot resolve on its own — see resolveImageSrc.
  const resolved = resolveImageSrc(src);

  if (isOptimizable(resolved)) {
    const props = { src: resolved, alt, className, style, quality: quality || 82, ...rest };
    if (fill) {
      props.fill = true;
      if (sizes) props.sizes = sizes;
    } else {
      props.width = width;
      props.height = height;
    }
    if (priority) {
      props.priority = true;
    } else {
      props.loading = loading || "lazy";
    }
    return <NextImage {...props} />;
  }

  // Fallback: unknown domain — render plain img so image is never blank
  return (
    <img
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : (loading || "lazy")}
      className={className}
      style={style}
      {...rest}
    />
  );
}
