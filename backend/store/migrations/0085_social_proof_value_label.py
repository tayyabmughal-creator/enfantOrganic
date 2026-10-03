from django.db import migrations, models

import store.domain_models.catalog

OLD_TEXTS = {
    "300,000+ Happy parents",
    "4.7 Average rating",
    "1M+ products sold worldwide",
    "ECOCERT Certified \u00b7 Dermatologically tested",
}


def upgrade_untouched_defaults(apps, schema_editor):
    """Rows still holding the original four text-only items get the value/label version."""
    SiteSettings = apps.get_model("store", "SiteSettings")
    new_items = store.domain_models.catalog.default_social_proof_items()
    for settings in SiteSettings.objects.all():
        items = settings.social_proof_items
        if (
            isinstance(items, list)
            and len(items) == 4
            and all(isinstance(item, dict) for item in items)
            and {item.get("text_en") for item in items} == OLD_TEXTS
            and not any(item.get("value_en") for item in items)
        ):
            settings.social_proof_items = new_items
            settings.save(update_fields=["social_proof_items"])


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0084_sitesettings_reviews_showcase"),
    ]

    operations = [
        migrations.AlterField(
            model_name="sitesettings",
            name="social_proof_items",
            field=models.JSONField(blank=True, default=store.domain_models.catalog.default_social_proof_items, help_text="Scrolling proof ticker on product pages. Each item: {value_en, label_en, value_ar, label_ar} (big number + small caption); {text_en, text_ar} still works. Leave empty to hide."),
        ),
        migrations.RunPython(upgrade_untouched_defaults, migrations.RunPython.noop),
    ]
