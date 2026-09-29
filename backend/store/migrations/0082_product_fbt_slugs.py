from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0081_sitesettings_trust_bar_items"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="fbt_slugs",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text=(
                    "Frequently Bought Together — list of product slugs to show as "
                    "bundle upsells on this product page. "
                    'e.g. ["complete-care-cream", "baby-shampoo"]. Leave empty to hide the section.'
                ),
            ),
        ),
    ]
