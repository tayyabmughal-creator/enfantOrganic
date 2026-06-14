from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


DEFAULT_MILESTONES = [
    {"threshold": Decimal("20.000"), "reward_type": "free_shipping", "discount_value": 0, "label_en": "Free Shipping", "label_ar": "شحن مجاني", "sort_order": 10},
    {"threshold": Decimal("25.000"), "reward_type": "discount_percent", "discount_value": 10, "label_en": "10% Off", "label_ar": "خصم 10%", "sort_order": 20},
    {"threshold": Decimal("30.000"), "reward_type": "discount_percent", "discount_value": 15, "label_en": "15% Off", "label_ar": "خصم 15%", "sort_order": 30},
]


def seed_milestones(apps, schema_editor):
    Region = apps.get_model("store", "Region")
    CartMilestone = apps.get_model("store", "CartMilestone")
    om_region = Region.objects.filter(code="om").first()
    if not om_region:
        return
    for m in DEFAULT_MILESTONES:
        CartMilestone.objects.get_or_create(
            region=om_region,
            threshold=m["threshold"],
            reward_type=m["reward_type"],
            defaults={
                "discount_value": m["discount_value"],
                "label_en": m["label_en"],
                "label_ar": m["label_ar"],
                "sort_order": m["sort_order"],
                "is_active": True,
            },
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('store', '0044_region_fx_rate'),
    ]

    operations = [
        migrations.CreateModel(
            name='CartMilestone',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('threshold', models.DecimalField(decimal_places=3, max_digits=10, help_text='Cart subtotal required to unlock this reward (in region currency)')),
                ('reward_type', models.CharField(choices=[('free_shipping', 'Free Shipping'), ('discount_percent', 'Discount (%)')], max_length=32)),
                ('discount_value', models.DecimalField(decimal_places=2, default=0, help_text='Discount percentage (e.g. 10 for 10% off). Only used for discount_percent type.', max_digits=5)),
                ('label_en', models.CharField(blank=True, default='', help_text="Short reward label in English (e.g. 'Free Shipping', '10% Off')", max_length=120)),
                ('label_ar', models.CharField(blank=True, default='', help_text='Short reward label in Arabic', max_length=120)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('region', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cart_milestones', to='store.region')),
            ],
            options={
                'ordering': ['sort_order', 'threshold'],
            },
        ),
        migrations.RunPython(seed_milestones, noop),
    ]
