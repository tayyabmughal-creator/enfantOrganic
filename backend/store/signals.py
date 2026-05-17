from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Product, BlogPost, Category
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
