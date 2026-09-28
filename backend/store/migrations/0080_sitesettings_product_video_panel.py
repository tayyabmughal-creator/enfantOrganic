from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0079_sitesettings_floating_video_url"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="product_video_panel_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="product_video_1_url",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="product_video_2_url",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="product_video_3_url",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
    ]