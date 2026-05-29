from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0035_heropromocard_is_visible"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="inventory_low_stock_threshold",
            field=models.PositiveIntegerField(default=10),
        ),
    ]
