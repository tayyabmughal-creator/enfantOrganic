import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0050_product_variants"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="categories",
            field=models.ManyToManyField(blank=True, related_name="category_products", to="store.Category"),
        ),
        migrations.AddField(
            model_name="product",
            name="seo_title_en",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="product",
            name="seo_title_ar",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="product",
            name="seo_description_en",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="product",
            name="seo_description_ar",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="product",
            name="shopify_meta",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.CreateModel(
            name="ProductGalleryImage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("image_file", models.ImageField(blank=True, null=True, upload_to="products/gallery/")),
                ("image_url", models.URLField(blank=True, default="", max_length=500)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="gallery_images",
                        to="store.product",
                    ),
                ),
            ],
            options={"ordering": ("sort_order", "id")},
        ),
    ]
