from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0078_region_facebook_pixel_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="floating_video_url",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
    ]