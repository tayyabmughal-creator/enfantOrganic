import nh3

# Mirrors the client-side allowlist in frontend/lib/safeHtml.js so admin-authored
# rich text is safe even if a request bypasses the browser editor.
ALLOWED_TAGS = {
    "a", "b", "blockquote", "br", "em", "font", "h2", "h3", "h4",
    "hr", "i", "li", "ol", "p", "span", "strong", "u", "ul",
}
ALLOWED_ATTRIBUTES = {
    "a": {"href"},
    "font": {"size", "color"},
    "*": {"style"},
}
ALLOWED_STYLE_PROPERTIES = {"font-weight", "font-style", "text-decoration", "font-size", "text-align"}
ALLOWED_URL_SCHEMES = {"http", "https", "mailto", "tel"}


def sanitize_rich_text(value):
    """Strip everything except a small safe formatting allowlist from admin-authored HTML."""
    if not value:
        return value
    return nh3.clean(
        str(value),
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        filter_style_properties=ALLOWED_STYLE_PROPERTIES,
        link_rel="noopener noreferrer",
        url_schemes=ALLOWED_URL_SCHEMES,
    )
