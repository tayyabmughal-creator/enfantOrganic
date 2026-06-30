const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "em",
  "font",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "u",
  "ul",
]);

const VOID_TAGS = new Set(["br", "hr"]);
const ALLOWED_STYLES = new Set(["font-weight", "font-style", "text-decoration", "font-size", "text-align"]);

export function hasHtml(value = "") {
  return /<[a-z][\s\S]*>/i.test(String(value || ""));
}

function escapeAttr(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanHref(value = "") {
  const href = String(value || "").trim();
  if (!href) return "";
  const lower = href.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    return "";
  }
  return href;
}

function cleanStyle(value = "") {
  const rules = String(value || "")
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const [rawName, ...rawValueParts] = rule.split(":");
      const name = String(rawName || "").trim().toLowerCase();
      const rawValue = rawValueParts.join(":").trim();
      if (!ALLOWED_STYLES.has(name) || !rawValue) return "";
      if (/url\s*\(|expression\s*\(|javascript:/i.test(rawValue)) return "";
      return `${name}: ${rawValue}`;
    })
    .filter(Boolean);
  return rules.join("; ");
}

function cleanAttributes(tag, attrs = "") {
  const next = [];
  const attrPattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = attrPattern.exec(attrs))) {
    const name = String(match[1] || "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!name || name.startsWith("on")) continue;

    if (tag === "a" && name === "href") {
      const href = cleanHref(value);
      if (href) next.push(`href="${escapeAttr(href)}"`);
      continue;
    }
    if (tag === "a" && name === "title") {
      next.push(`title="${escapeAttr(value)}"`);
      continue;
    }
    if (tag === "font" && name === "size") {
      next.push(`size="${escapeAttr(value)}"`);
      continue;
    }
    if ((tag === "span" || tag === "p") && name === "style") {
      const style = cleanStyle(value);
      if (style) next.push(`style="${escapeAttr(style)}"`);
    }
  }

  if (tag === "a") {
    next.push('target="_blank"', 'rel="noopener noreferrer"');
  }

  return next.length ? ` ${next.join(" ")}` : "";
}

export function sanitizeHtml(value = "") {
  let html = String(value || "");
  html = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "");

  return html.replace(/<\s*(\/?)([a-z0-9-]+)([^>]*)>/gi, (match, closing, rawName, attrs) => {
    const tag = String(rawName || "").toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
    const cleanedAttrs = cleanAttributes(tag, attrs);
    return VOID_TAGS.has(tag) ? `<${tag}${cleanedAttrs}>` : `<${tag}${cleanedAttrs}>`;
  });
}
