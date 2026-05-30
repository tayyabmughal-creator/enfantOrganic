import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0037_order_sales_channel"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AnalyticsEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("page_view", "Page View"),
                            ("product_view", "Product View"),
                            ("add_to_cart", "Add to Cart"),
                            ("checkout_initiated", "Checkout Initiated"),
                        ],
                        db_index=True,
                        max_length=32,
                    ),
                ),
                (
                    "session_key",
                    models.CharField(db_index=True, max_length=64),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, db_index=True),
                ),
                (
                    "metadata",
                    models.JSONField(blank=True, default=dict),
                ),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="analytics_events",
                        to="store.product",
                    ),
                ),
                (
                    "region",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="analytics_events",
                        to="store.region",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="analytics_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="analyticsevent",
            index=models.Index(
                fields=["event_type", "created_at"],
                name="store_analy_event_t_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="analyticsevent",
            index=models.Index(
                fields=["session_key", "event_type"],
                name="store_analy_session_idx",
            ),
        ),
    ]
