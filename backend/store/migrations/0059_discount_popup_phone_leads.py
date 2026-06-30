from django.db import migrations, models


POPUP_TEXT = "Enter Phone Number to get exclusive discount updates at very first"
POPUP_IMAGE = "/enfant/hero-gift-box-offer-v2.jpg"


def seed_discount_popup(apps, schema_editor):
    SiteSettings = apps.get_model("store", "SiteSettings")
    SiteSettings.objects.all().update(
        discount_popup_enabled=True,
        discount_popup_text_en=POPUP_TEXT,
        discount_popup_text_ar=POPUP_TEXT,
        discount_popup_image_url=POPUP_IMAGE,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0058_product_cost_and_brand_contact_defaults"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitesettings",
            name="discount_popup_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="discount_popup_text_en",
            field=models.TextField(blank=True, default=POPUP_TEXT),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="discount_popup_text_ar",
            field=models.TextField(blank=True, default=POPUP_TEXT),
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="discount_popup_image_url",
            field=models.CharField(blank=True, default=POPUP_IMAGE, max_length=500),
        ),
        migrations.AlterField(
            model_name="newslettersubscription",
            name="email",
            field=models.EmailField(blank=True, db_index=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="newslettersubscription",
            name="phone",
            field=models.CharField(blank=True, db_index=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="newslettersubscription",
            name="source",
            field=models.CharField(blank=True, default="newsletter", max_length=40),
        ),
        migrations.RunPython(
            seed_discount_popup,
            migrations.RunPython.noop,
        ),
    ]
