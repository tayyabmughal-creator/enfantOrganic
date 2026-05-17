import os

from django.conf import settings


class RevalidationNotConfiguredError(RuntimeError):
    pass


def get_revalidation_secret(*, required=False):
    secret = (os.environ.get("REVALIDATION_SECRET") or "").strip()
    if secret:
        return secret
    if required and not settings.DEBUG:
        raise RevalidationNotConfiguredError(
            "REVALIDATION_SECRET must be set when DJANGO_DEBUG is disabled."
        )
    return ""
