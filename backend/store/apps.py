from django.apps import AppConfig
from django.db.models.signals import post_migrate


class StoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "store"

    def ready(self):
        import store.signals  # noqa
        from .services.admin_roles import ensure_default_admin_roles

        def _seed_admin_roles(sender, **kwargs):
            ensure_default_admin_roles()

        post_migrate.connect(
            _seed_admin_roles,
            sender=self,
            dispatch_uid="store.seed_admin_roles",
        )
