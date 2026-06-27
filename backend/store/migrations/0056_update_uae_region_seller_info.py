from django.db import migrations


def update_uae_seller_info(apps, schema_editor):
    Region = apps.get_model("store", "Region")
    Region.objects.filter(code__iexact="ae").update(
        seller_legal_name="Enfant Organic",
        seller_email="sales@enfant-me.com",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0055_order_fx_rate_snapshot"),
    ]

    operations = [
        migrations.RunPython(
            update_uae_seller_info,
            migrations.RunPython.noop,
        ),
    ]
