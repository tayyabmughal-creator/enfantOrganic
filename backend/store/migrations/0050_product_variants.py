from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0049_alter_category_image"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="variants",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
