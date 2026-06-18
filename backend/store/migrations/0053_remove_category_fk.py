from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0052_data_migrate_category"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="product",
            name="category",
        ),
    ]
