from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0036_sitesettings_inventory_low_stock_threshold"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="sales_channel",
            field=models.CharField(
                choices=[
                    ("online_store", "Online store"),
                    ("draft_order", "Draft orders"),
                ],
                default="online_store",
                max_length=32,
            ),
        ),
    ]
