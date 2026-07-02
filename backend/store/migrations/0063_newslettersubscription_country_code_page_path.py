from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0062_sitesettings_cogs_include_unpaid"),
    ]

    operations = [
        migrations.AddField(
            model_name="newslettersubscription",
            name="country_code",
            field=models.CharField(blank=True, db_index=True, default="", max_length=8),
        ),
        migrations.AddField(
            model_name="newslettersubscription",
            name="page_path",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
