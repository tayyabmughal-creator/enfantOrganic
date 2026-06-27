from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0056_update_uae_region_seller_info"),
    ]

    operations = [
        migrations.AddField(
            model_name="review",
            name="images",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
