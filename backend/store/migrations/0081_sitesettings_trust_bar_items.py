from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0080_sitesettings_product_video_panel"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="trust_bar_items",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text=(
                    "Home page trust bar items shown below the banner. "
                    "Each item: {icon, text_en, text_ar}. Leave empty to hide."
                ),
            ),
        ),
    ]
