"""Record hero banner artwork dimensions so the carousel can size itself to them.

The banner was a fixed-height strip (400px, 320px on tablets, 220px on phones)
with ``object-fit: cover``, so a tall phone-shaped graphic lost most of its
artwork to the crop. Storing the uploaded size lets the storefront take its
aspect ratio from the image instead.
"""

from django.db import migrations, models


def backfill_dimensions(apps, schema_editor):
    """Fill in sizes for banners uploaded before this migration.

    Without this, Django re-opens the file on every instantiation looking for
    the missing dimensions, and existing slides would keep the old fixed-height
    crop until someone re-uploaded them.
    """
    HeroBannerSlide = apps.get_model("store", "HeroBannerSlide")
    pairs = (
        ("image_file", "image_width", "image_height"),
        ("image_file_mobile", "image_mobile_width", "image_mobile_height"),
    )
    for slide in HeroBannerSlide.objects.all():
        updated = []
        for file_field, width_field, height_field in pairs:
            image = getattr(slide, file_field, None)
            if not image:
                continue
            try:
                width, height = image.width, image.height
            except Exception:
                # A row pointing at a file that is no longer on disk must not
                # take the whole migration down with it.
                continue
            setattr(slide, width_field, width)
            setattr(slide, height_field, height)
            updated.extend([width_field, height_field])
        if updated:
            slide.save(update_fields=updated)


class Migration(migrations.Migration):

    dependencies = [
        ('store', '0074_hero_banner_slide'),
    ]

    operations = [
        migrations.AddField(
            model_name='herobannerslide',
            name='image_height',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='herobannerslide',
            name='image_mobile_height',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='herobannerslide',
            name='image_mobile_width',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='herobannerslide',
            name='image_width',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='herobannerslide',
            name='image_file',
            field=models.ImageField(blank=True, height_field='image_height', null=True, upload_to='hero-banner/', width_field='image_width'),
        ),
        migrations.AlterField(
            model_name='herobannerslide',
            name='image_file_mobile',
            field=models.ImageField(blank=True, height_field='image_mobile_height', null=True, upload_to='hero-banner/', width_field='image_mobile_width'),
        ),
        migrations.RunPython(backfill_dimensions, migrations.RunPython.noop),
    ]
