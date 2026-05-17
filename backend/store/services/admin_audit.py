from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID
import ipaddress

from django.forms.models import model_to_dict
from django.db.models.fields.files import FieldFile

from ..models import AdminAuditLog


def serialize_for_audit(value):
    if isinstance(value, dict):
        return {str(key): serialize_for_audit(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [serialize_for_audit(item) for item in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, FieldFile):
        try:
            return value.url if value else ""
        except ValueError:
            return ""
    return value


def snapshot_instance(instance, *, fields=None, include_m2m=False):
    if instance is None:
        return None

    data = model_to_dict(instance, fields=fields)
    if include_m2m:
        for field in instance._meta.many_to_many:
            if fields and field.name not in fields:
                continue
            data[field.name] = list(getattr(instance, field.name).values_list("id", flat=True))
    return serialize_for_audit(data)


def _extract_ip_address(request):
    if not request:
        return None

    forwarded_for = str(request.META.get("HTTP_X_FORWARDED_FOR", "")).strip()
    if forwarded_for:
        candidate = forwarded_for.split(",")[0].strip()
    else:
        candidate = str(request.META.get("REMOTE_ADDR", "")).strip()

    if not candidate:
        return None

    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def _extract_user_agent(request):
    if not request:
        return ""
    return str(request.META.get("HTTP_USER_AGENT", "") or "")[:1024]


def log_admin_action(
    *,
    action,
    resource_type,
    resource_id="",
    before_snapshot=None,
    after_snapshot=None,
    request=None,
    actor=None,
):
    actor_user = actor
    if actor_user is None and request is not None:
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            actor_user = user

    return AdminAuditLog.objects.create(
        actor=actor_user if getattr(actor_user, "pk", None) else None,
        action=str(action or "").strip().lower(),
        resource_type=str(resource_type or "").strip().lower(),
        resource_id=str(resource_id or "").strip(),
        before_snapshot=serialize_for_audit(before_snapshot) if before_snapshot is not None else None,
        after_snapshot=serialize_for_audit(after_snapshot) if after_snapshot is not None else None,
        ip_address=_extract_ip_address(request),
        user_agent=_extract_user_agent(request),
    )
