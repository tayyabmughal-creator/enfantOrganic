from django.db import migrations, models


SELLER_NAME = "Enfant Organic"
SELLER_EMAIL = "sales@enfant-me.com"
SELLER_ADDRESS = "IFZA Business Park - Building A02 - Dubai Silicon Oasis - Industrial Area - Dubai - United Arab Emirates"
WHATSAPP_PHONE = "+968 7760 1158"


def update_brand_contact_defaults(apps, schema_editor):
    Region = apps.get_model("store", "Region")
    SiteSettings = apps.get_model("store", "SiteSettings")

    region_defaults = {
        "contact_phone": WHATSAPP_PHONE,
        "whatsapp_phone": WHATSAPP_PHONE,
        "seller_legal_name": SELLER_NAME,
        "seller_address_en": SELLER_ADDRESS,
        "seller_address_ar": SELLER_ADDRESS,
        "seller_email": SELLER_EMAIL,
    }
    for region in Region.objects.all():
        changed = []
        for field, value in region_defaults.items():
            if not getattr(region, field, None):
                setattr(region, field, value)
                changed.append(field)
        if changed:
            region.save(update_fields=changed)

    settings_defaults = {
        "announcement_en": "Summer Sale - Upto 40% Off On All Products",
        "announcement_ar": "Summer Sale - Upto 40% Off On All Products",
        "newsletter_title_en": "Don’t Miss Out Any Sale",
        "newsletter_title_ar": "Don’t Miss Out Any Sale",
        "newsletter_subtitle_en": "Subscribe to receive discount updates at very first.",
        "newsletter_subtitle_ar": "Subscribe to receive discount updates at very first.",
        "whatsapp_number": WHATSAPP_PHONE,
        "contact_phone": WHATSAPP_PHONE,
        "contact_email": SELLER_EMAIL,
    }
    for settings in SiteSettings.objects.all():
        changed = []
        for field, value in settings_defaults.items():
            if not getattr(settings, field, None):
                setattr(settings, field, value)
                changed.append(field)
        if changed:
            settings.save(update_fields=changed)


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0057_review_images"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="cost_price",
            field=models.DecimalField(decimal_places=3, default=0, max_digits=10),
        ),
        migrations.RunPython(
            update_brand_contact_defaults,
            migrations.RunPython.noop,
        ),
    ]
