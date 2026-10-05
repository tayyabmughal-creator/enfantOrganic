from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0085_social_proof_value_label"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="discount_popup_mobile_image_url",
            field=models.CharField(blank=True, default="", help_text="Optional wide picture for the popup on phones (e.g. 1600x900). Leave empty to use the main popup image.", max_length=500),
        ),
    ]
