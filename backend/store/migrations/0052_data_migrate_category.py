from django.db import migrations


def copy_category_to_categories(apps, schema_editor):
    Product = apps.get_model("store", "Product")
    for product in Product.objects.select_related("category").iterator():
        if product.category_id:
            product.categories.add(product.category_id)


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0051_categories_m2m_gallery_seo"),
    ]

    operations = [
        migrations.RunPython(
            copy_category_to_categories,
            migrations.RunPython.noop,
        ),
    ]
