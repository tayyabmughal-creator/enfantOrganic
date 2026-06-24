from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0054_optional_fields_blank"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="fx_rate_snapshot",
            field=models.DecimalField(
                max_digits=18,
                decimal_places=8,
                null=True,
                blank=True,
                help_text="Region fx_rate at the time this order was placed (OMR→region). Preserved for historic OMR conversion.",
            ),
        ),
    ]
