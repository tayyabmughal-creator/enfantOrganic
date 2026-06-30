from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0059_discount_popup_phone_leads"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="terms_policy_en",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="terms_policy_ar",
            field=models.TextField(blank=True, default=""),
        ),
    ]
