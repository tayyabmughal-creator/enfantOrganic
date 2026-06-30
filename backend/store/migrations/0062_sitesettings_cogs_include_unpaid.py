from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0061_orderitem_cost_snapshot_policy_pages"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="cogs_include_unpaid",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "Include unpaid (e.g. COD pending) orders in the Inventory Sold & Cost of "
                    "Goods report. Cancelled, failed and refunded orders are always excluded. "
                    "Turn off to count paid/completed orders only."
                ),
            ),
        ),
    ]
