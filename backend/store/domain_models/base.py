from django.db import models


class OrderedModel(models.Model):
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        abstract = True
        ordering = ("sort_order", "id")
