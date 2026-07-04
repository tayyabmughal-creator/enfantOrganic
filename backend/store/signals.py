from django.db.models.signals import post_save, post_delete, pre_delete, pre_save
from django.dispatch import receiver
from .models import Product, BlogPost, Category, Review
from .services.reviews import recalculate_product_review_aggregates
from .tasks import trigger_frontend_revalidate_async

@receiver([post_save, post_delete], sender=Product)
def product_changed_revalidate(sender, instance, **kwargs):
    # Revalidate product page and collections
    trigger_frontend_revalidate_async.delay(path=f"/product/{instance.slug}")
    trigger_frontend_revalidate_async.delay(path="/collections")
    trigger_frontend_revalidate_async.delay(path="/")

@receiver([post_save, post_delete], sender=BlogPost)
def blog_changed_revalidate(sender, instance, **kwargs):
    # Revalidate blog list and specific blog post
    trigger_frontend_revalidate_async.delay(path=f"/blog/{instance.slug}")
    trigger_frontend_revalidate_async.delay(path="/blog")
    trigger_frontend_revalidate_async.delay(path="/")

@receiver([post_save, post_delete], sender=Category)
def category_changed_revalidate(sender, instance, **kwargs):
    trigger_frontend_revalidate_async.delay(path="/collections")
    trigger_frontend_revalidate_async.delay(path="/")


@receiver(pre_save, sender=Review)
def review_capture_previous_product(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_product_id = None
        return
    previous = Review.objects.filter(pk=instance.pk).values("product_id").first()
    instance._previous_product_id = previous["product_id"] if previous else None


@receiver(post_save, sender=Review)
def review_changed_update_product_aggregates(sender, instance, **kwargs):
    recalculate_product_review_aggregates(instance.product_id)
    previous_product_id = getattr(instance, "_previous_product_id", None)
    if previous_product_id and previous_product_id != instance.product_id:
        recalculate_product_review_aggregates(previous_product_id)


@receiver(pre_delete, sender=Review)
def review_deleted_update_product_aggregates(sender, instance, **kwargs):
    instance._deleted_product_id = instance.product_id


@receiver(post_delete, sender=Review)
def review_deleted_recalculate_product(sender, instance, **kwargs):
    recalculate_product_review_aggregates(getattr(instance, "_deleted_product_id", instance.product_id))
