SUPPORTED_LOCALES = {"en", "ar"}


def normalize_locale(locale):
    return locale if locale in SUPPORTED_LOCALES else "en"


def get_image_url(obj, request=None, file_field_name="image_file", url_field_name="image"):
    file_field = getattr(obj, file_field_name, None)

    if file_field:
        try:
            url = file_field.url
            if request:
                return request.build_absolute_uri(url)
            return url
        except ValueError:
            pass

    return getattr(obj, url_field_name, "")


def localized(instance, field_name, locale):
    locale = normalize_locale(locale)
    return getattr(instance, f"{field_name}_{locale}") or getattr(instance, f"{field_name}_en")


def localized_json(instance, field_name, locale):
    locale = normalize_locale(locale)
    return getattr(instance, f"{field_name}_{locale}") or getattr(instance, f"{field_name}_en")


def localized_link_items(items, locale):
    normalized = normalize_locale(locale)
    label_key = f"label_{normalized}"
    fallback_key = "label_en"

    return [
        {
            "label": item.get(label_key) or item.get(fallback_key),
            "href": item.get("href", "#"),
        }
        for item in items
    ]


def serialize_site_settings(settings, locale):
    normalized = normalize_locale(locale)

    def _loc(field):
        return getattr(settings, f"{field}_{normalized}") or getattr(settings, f"{field}_en", "")

    return {
        # Core
        "brand_name": settings.brand_name,
        "announcement": _loc("announcement"),
        "footer_about": _loc("footer_about"),
        # Newsletter
        "newsletter_title": _loc("newsletter_title"),
        "newsletter_subtitle": _loc("newsletter_subtitle"),
        # Content sections
        "instagram_title": _loc("instagram_title"),
        "instagram_cta": _loc("instagram_cta"),
        "blog_title": _loc("blog_title"),
        "free_gift_title": _loc("free_gift_title"),
        "free_gift_subtitle": _loc("free_gift_subtitle"),
        # Link groups
        "why_choose_links": localized_link_items(settings.why_choose_links, normalized),
        "policy_links": localized_link_items(settings.policy_links, normalized),
        "static_links": localized_link_items(settings.static_links, normalized),
        "nav_links": localized_link_items(settings.nav_links, normalized),
        # Branding
        "logo_url": settings.logo_url,
        "favicon_url": settings.favicon_url,
        "tagline": _loc("tagline"),
        "primary_color": settings.primary_color,
        "accent_color": settings.accent_color,
        # Social media
        "facebook_url": settings.facebook_url,
        "instagram_url": settings.instagram_url,
        "twitter_url": settings.twitter_url,
        "youtube_url": settings.youtube_url,
        "tiktok_url": settings.tiktok_url,
        "whatsapp_number": settings.whatsapp_number,
        # Footer
        "copyright": _loc("copyright"),
        # Contact
        "contact_email": settings.contact_email,
        "contact_phone": settings.contact_phone,
        "address": _loc("address"),
        # SEO
        "seo_title": _loc("seo_title"),
        "seo_description": _loc("seo_description"),
        "og_image_url": settings.og_image_url,
        # Legal
        "return_policy": _loc("return_policy"),
        "privacy_policy": _loc("privacy_policy"),
    }
