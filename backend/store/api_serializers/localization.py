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
    return {
        "brand_name": settings.brand_name,
        "announcement": getattr(settings, f"announcement_{normalized}") or settings.announcement_en,
        "footer_about": getattr(settings, f"footer_about_{normalized}") or settings.footer_about_en,
        "newsletter_title": getattr(settings, f"newsletter_title_{normalized}") or settings.newsletter_title_en,
        "newsletter_subtitle": getattr(settings, f"newsletter_subtitle_{normalized}") or settings.newsletter_subtitle_en,
        "instagram_title": getattr(settings, f"instagram_title_{normalized}") or settings.instagram_title_en,
        "instagram_cta": getattr(settings, f"instagram_cta_{normalized}") or settings.instagram_cta_en,
        "blog_title": getattr(settings, f"blog_title_{normalized}") or settings.blog_title_en,
        "free_gift_title": getattr(settings, f"free_gift_title_{normalized}") or settings.free_gift_title_en,
        "free_gift_subtitle": getattr(settings, f"free_gift_subtitle_{normalized}") or settings.free_gift_subtitle_en,
        "why_choose_links": localized_link_items(settings.why_choose_links, normalized),
        "policy_links": localized_link_items(settings.policy_links, normalized),
        "static_links": localized_link_items(settings.static_links, normalized),
    }
