import secrets

from django.db import migrations, models


def populate_lookup_tokens(apps, schema_editor):
    Order = apps.get_model("store", "Order")
    for order in Order.objects.filter(lookup_token=""):
        order.lookup_token = secrets.token_urlsafe(24)
        order.save(update_fields=["lookup_token"])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0025_blogpost_admin_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="lookup_token",
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.RunPython(populate_lookup_tokens, reverse_noop),
    ]
