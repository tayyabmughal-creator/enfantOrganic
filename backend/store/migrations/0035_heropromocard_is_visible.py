from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("store", "0034_paymobregionconfig"),
    ]

    operations = [
        migrations.AddField(
            model_name="heropromocard",
            name="is_visible",
            field=models.BooleanField(default=True),
        ),
    ]
