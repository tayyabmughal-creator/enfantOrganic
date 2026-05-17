from functools import lru_cache

from django.contrib.auth.models import Group, Permission


ROLE_OWNER = "Owner/Super Admin"
ROLE_MANAGER = "Manager"
ROLE_PRODUCT_EDITOR = "Product Editor"
ROLE_ORDER_SUPPORT = "Order Support"
ROLE_FINANCE = "Finance"
ROLE_MARKETING = "Marketing"

ROLE_NAMES = (
    ROLE_OWNER,
    ROLE_MANAGER,
    ROLE_PRODUCT_EDITOR,
    ROLE_ORDER_SUPPORT,
    ROLE_FINANCE,
    ROLE_MARKETING,
)

CAP_DASHBOARD_VIEW = "dashboard.view"
CAP_MODERATION_VIEW = "moderation.view"
CAP_PRODUCTS_VIEW = "products.view"
CAP_PRODUCTS_EDIT = "products.edit"
CAP_CATEGORIES_VIEW = "categories.view"
CAP_CATEGORIES_EDIT = "categories.edit"
CAP_CONTENT_VIEW = "content.view"
CAP_CONTENT_EDIT = "content.edit"
CAP_ORDERS_VIEW = "orders.view"
CAP_ORDERS_EDIT = "orders.edit"
CAP_RETURNS_VIEW = "returns.view"
CAP_RETURNS_EDIT = "returns.edit"
CAP_PAYMENTS_VIEW = "payments.view"
CAP_PAYMENTS_EDIT = "payments.edit"
CAP_REFUNDS_VIEW = "refunds.view"
CAP_REFUNDS_EDIT = "refunds.edit"
CAP_COUPONS_VIEW = "coupons.view"
CAP_COUPONS_EDIT = "coupons.edit"
CAP_GIFTCARDS_VIEW = "giftcards.view"
CAP_GIFTCARDS_EDIT = "giftcards.edit"
CAP_ABANDONED_VIEW = "abandoned.view"
CAP_ABANDONED_EDIT = "abandoned.edit"
CAP_REPORTS_VIEW = "reports.view"
CAP_AUDIT_VIEW = "audit.view"
CAP_REVIEWS_VIEW = "reviews.view"
CAP_REVIEWS_EDIT = "reviews.edit"
CAP_CUSTOMERS_VIEW = "customers.view"
CAP_CUSTOMERS_EDIT = "customers.edit"
CAP_SHIPPING_VIEW = "shipping.view"
CAP_SHIPPING_EDIT = "shipping.edit"
CAP_INVENTORY_VIEW = "inventory.view"
CAP_INVENTORY_EDIT = "inventory.edit"
CAP_REGIONS_VIEW = "regions.view"
CAP_REGIONS_EDIT = "regions.edit"
CAP_STAFF_MANAGE = "staff.manage"

ALL_CAPABILITIES = {
    CAP_DASHBOARD_VIEW,
    CAP_MODERATION_VIEW,
    CAP_PRODUCTS_VIEW,
    CAP_PRODUCTS_EDIT,
    CAP_CATEGORIES_VIEW,
    CAP_CATEGORIES_EDIT,
    CAP_CONTENT_VIEW,
    CAP_CONTENT_EDIT,
    CAP_ORDERS_VIEW,
    CAP_ORDERS_EDIT,
    CAP_RETURNS_VIEW,
    CAP_RETURNS_EDIT,
    CAP_PAYMENTS_VIEW,
    CAP_PAYMENTS_EDIT,
    CAP_REFUNDS_VIEW,
    CAP_REFUNDS_EDIT,
    CAP_COUPONS_VIEW,
    CAP_COUPONS_EDIT,
    CAP_GIFTCARDS_VIEW,
    CAP_GIFTCARDS_EDIT,
    CAP_ABANDONED_VIEW,
    CAP_ABANDONED_EDIT,
    CAP_REPORTS_VIEW,
    CAP_AUDIT_VIEW,
    CAP_REVIEWS_VIEW,
    CAP_REVIEWS_EDIT,
    CAP_CUSTOMERS_VIEW,
    CAP_CUSTOMERS_EDIT,
    CAP_SHIPPING_VIEW,
    CAP_SHIPPING_EDIT,
    CAP_INVENTORY_VIEW,
    CAP_INVENTORY_EDIT,
    CAP_REGIONS_VIEW,
    CAP_REGIONS_EDIT,
    CAP_STAFF_MANAGE,
}

ROLE_CAPABILITIES = {
    ROLE_OWNER: set(ALL_CAPABILITIES),
    ROLE_MANAGER: {
        CAP_DASHBOARD_VIEW,
        CAP_MODERATION_VIEW,
        CAP_PRODUCTS_VIEW,
        CAP_PRODUCTS_EDIT,
        CAP_CATEGORIES_VIEW,
        CAP_CATEGORIES_EDIT,
        CAP_CONTENT_VIEW,
        CAP_CONTENT_EDIT,
        CAP_ORDERS_VIEW,
        CAP_ORDERS_EDIT,
        CAP_RETURNS_VIEW,
        CAP_RETURNS_EDIT,
        CAP_PAYMENTS_VIEW,
        CAP_PAYMENTS_EDIT,
        CAP_REFUNDS_VIEW,
        CAP_REFUNDS_EDIT,
        CAP_COUPONS_VIEW,
        CAP_COUPONS_EDIT,
        CAP_GIFTCARDS_VIEW,
        CAP_GIFTCARDS_EDIT,
        CAP_ABANDONED_VIEW,
        CAP_ABANDONED_EDIT,
        CAP_REPORTS_VIEW,
        CAP_AUDIT_VIEW,
        CAP_REVIEWS_VIEW,
        CAP_REVIEWS_EDIT,
        CAP_CUSTOMERS_VIEW,
        CAP_CUSTOMERS_EDIT,
        CAP_SHIPPING_VIEW,
        CAP_SHIPPING_EDIT,
        CAP_INVENTORY_VIEW,
        CAP_INVENTORY_EDIT,
        CAP_REGIONS_VIEW,
        CAP_REGIONS_EDIT,
    },
    ROLE_PRODUCT_EDITOR: {
        CAP_PRODUCTS_VIEW,
        CAP_PRODUCTS_EDIT,
        CAP_CATEGORIES_VIEW,
        CAP_CATEGORIES_EDIT,
        CAP_CONTENT_VIEW,
        CAP_CONTENT_EDIT,
        CAP_INVENTORY_VIEW,
        CAP_INVENTORY_EDIT,
        CAP_REVIEWS_VIEW,
        CAP_REVIEWS_EDIT,
    },
    ROLE_ORDER_SUPPORT: {
        CAP_ORDERS_VIEW,
        CAP_ORDERS_EDIT,
        CAP_RETURNS_VIEW,
        CAP_RETURNS_EDIT,
        CAP_CUSTOMERS_VIEW,
        CAP_SHIPPING_VIEW,
    },
    ROLE_FINANCE: {
        CAP_DASHBOARD_VIEW,
        CAP_ORDERS_VIEW,
        CAP_RETURNS_VIEW,
        CAP_PAYMENTS_VIEW,
        CAP_PAYMENTS_EDIT,
        CAP_REFUNDS_VIEW,
        CAP_REFUNDS_EDIT,
        CAP_REPORTS_VIEW,
    },
    ROLE_MARKETING: {
        CAP_COUPONS_VIEW,
        CAP_COUPONS_EDIT,
        CAP_GIFTCARDS_VIEW,
        CAP_GIFTCARDS_EDIT,
        CAP_ABANDONED_VIEW,
        CAP_ABANDONED_EDIT,
        CAP_CONTENT_VIEW,
        CAP_MODERATION_VIEW,
    },
}

CAPABILITY_TO_PERMISSION_SLUGS = {
    CAP_DASHBOARD_VIEW: {"store.view_order"},
    CAP_MODERATION_VIEW: {"store.view_review", "store.view_notificationlog"},
    CAP_PRODUCTS_VIEW: {"store.view_product"},
    CAP_PRODUCTS_EDIT: {"store.change_product"},
    CAP_CATEGORIES_VIEW: {"store.view_category"},
    CAP_CATEGORIES_EDIT: {"store.change_category"},
    CAP_CONTENT_VIEW: {"store.view_sitesettings", "store.view_blogpost", "store.view_heropromocard"},
    CAP_CONTENT_EDIT: {"store.change_sitesettings", "store.change_blogpost", "store.change_heropromocard"},
    CAP_ORDERS_VIEW: {"store.view_order"},
    CAP_ORDERS_EDIT: {"store.change_order"},
    CAP_RETURNS_VIEW: {"store.view_returnrequest"},
    CAP_RETURNS_EDIT: {"store.change_returnrequest"},
    CAP_PAYMENTS_VIEW: {"store.view_paymenttransaction"},
    CAP_PAYMENTS_EDIT: {"store.change_paymenttransaction"},
    CAP_REFUNDS_VIEW: {"store.view_paymenttransaction", "store.view_returnrequest"},
    CAP_REFUNDS_EDIT: {"store.change_paymenttransaction", "store.change_order"},
    CAP_COUPONS_VIEW: {"store.view_coupon"},
    CAP_COUPONS_EDIT: {"store.change_coupon"},
    CAP_GIFTCARDS_VIEW: {"store.view_giftcard"},
    CAP_GIFTCARDS_EDIT: {"store.change_giftcard"},
    CAP_ABANDONED_VIEW: {"store.view_abandonedcart"},
    CAP_ABANDONED_EDIT: {"store.change_abandonedcart"},
    CAP_REPORTS_VIEW: {"store.view_order"},
    CAP_REVIEWS_VIEW: {"store.view_review"},
    CAP_REVIEWS_EDIT: {"store.change_review"},
    CAP_CUSTOMERS_VIEW: {"auth.view_user"},
    CAP_CUSTOMERS_EDIT: {"auth.change_user"},
    CAP_SHIPPING_VIEW: {"store.view_shippingrule"},
    CAP_SHIPPING_EDIT: {"store.change_shippingrule"},
    CAP_INVENTORY_VIEW: {"store.view_productstock", "store.view_warehouse"},
    CAP_INVENTORY_EDIT: {"store.change_productstock", "store.change_warehouse"},
    CAP_REGIONS_VIEW: {"store.view_region"},
    CAP_REGIONS_EDIT: {"store.change_region"},
    CAP_STAFF_MANAGE: {"auth.change_user", "auth.view_group"},
    CAP_AUDIT_VIEW: {"store.view_adminauditlog"},
}

MODULE_PERMISSION_MAP = {
    "dashboard": {"view": CAP_DASHBOARD_VIEW, "edit": None},
    "orders": {"view": CAP_ORDERS_VIEW, "edit": CAP_ORDERS_EDIT},
    "customers": {"view": CAP_CUSTOMERS_VIEW, "edit": CAP_CUSTOMERS_EDIT},
    "products": {"view": CAP_PRODUCTS_VIEW, "edit": CAP_PRODUCTS_EDIT},
    "categories": {"view": CAP_CATEGORIES_VIEW, "edit": CAP_CATEGORIES_EDIT},
    "inventory": {"view": CAP_INVENTORY_VIEW, "edit": CAP_INVENTORY_EDIT},
    "content": {"view": CAP_CONTENT_VIEW, "edit": CAP_CONTENT_EDIT},
    "promotions": {"view": CAP_COUPONS_VIEW, "edit": CAP_COUPONS_EDIT},
    "giftcards": {"view": CAP_GIFTCARDS_VIEW, "edit": CAP_GIFTCARDS_EDIT},
    "abandoned": {"view": CAP_ABANDONED_VIEW, "edit": CAP_ABANDONED_EDIT},
    "payments": {"view": CAP_PAYMENTS_VIEW, "edit": CAP_PAYMENTS_EDIT},
    "refunds": {"view": CAP_REFUNDS_VIEW, "edit": CAP_REFUNDS_EDIT},
    "returns": {"view": CAP_RETURNS_VIEW, "edit": CAP_RETURNS_EDIT},
    "reviews": {"view": CAP_REVIEWS_VIEW, "edit": CAP_REVIEWS_EDIT},
    "reports": {"view": CAP_REPORTS_VIEW, "edit": None},
    "audit_logs": {"view": CAP_AUDIT_VIEW, "edit": None},
    "shipping": {"view": CAP_SHIPPING_VIEW, "edit": CAP_SHIPPING_EDIT},
    "regions": {"view": CAP_REGIONS_VIEW, "edit": CAP_REGIONS_EDIT},
    "staff": {"view": CAP_STAFF_MANAGE, "edit": CAP_STAFF_MANAGE},
}


def _resolve_permissions(permission_slugs):
    if not permission_slugs:
        return Permission.objects.none()
    q = Permission.objects.none()
    for slug in sorted(set(permission_slugs)):
        if "." not in slug:
            continue
        app_label, codename = slug.split(".", 1)
        q = q | Permission.objects.filter(content_type__app_label=app_label, codename=codename)
    return q.distinct()


def _role_permission_slugs(role_name):
    capabilities = ROLE_CAPABILITIES.get(role_name, set())
    slugs = set()
    for capability in capabilities:
        slugs.update(CAPABILITY_TO_PERMISSION_SLUGS.get(capability, set()))
    return slugs


def ensure_default_admin_roles():
    for role_name in ROLE_NAMES:
        group, _ = Group.objects.get_or_create(name=role_name)
        permission_slugs = _role_permission_slugs(role_name)
        if role_name == ROLE_OWNER:
            permissions_qs = Permission.objects.filter(
                content_type__app_label__in={"store", "auth"}
            ).distinct()
        else:
            permissions_qs = _resolve_permissions(permission_slugs)
        group.permissions.set(permissions_qs)


@lru_cache(maxsize=1)
def _capability_permission_lookup():
    return {
        capability: tuple(sorted(permission_slugs))
        for capability, permission_slugs in CAPABILITY_TO_PERMISSION_SLUGS.items()
    }


def get_user_role_names(user):
    if not user or not user.is_authenticated:
        return []
    user_role_names = set(user.groups.values_list("name", flat=True))
    return [role for role in ROLE_NAMES if role in user_role_names]


def get_user_admin_capabilities(user):
    if not user or not user.is_authenticated or not user.is_staff:
        return set()
    if user.is_superuser:
        return set(ALL_CAPABILITIES)
    capabilities = set()
    role_names = set(get_user_role_names(user))
    for role_name in role_names:
        capabilities.update(ROLE_CAPABILITIES.get(role_name, set()))
    return capabilities


def has_admin_capability(user, capability):
    if not capability:
        return True
    if not user or not user.is_authenticated or not user.is_staff:
        return False
    if user.is_superuser:
        return True
    if capability in get_user_admin_capabilities(user):
        return True

    permission_lookup = _capability_permission_lookup()
    permission_slugs = permission_lookup.get(capability, ())
    if not permission_slugs:
        return False
    return any(user.has_perm(permission_slug) for permission_slug in permission_slugs)


def build_admin_me_payload(user):
    capabilities = sorted(get_user_admin_capabilities(user))
    modules = {}
    for module_key, caps in MODULE_PERMISSION_MAP.items():
        view_cap = caps.get("view")
        edit_cap = caps.get("edit")
        modules[module_key] = {
            "view": has_admin_capability(user, view_cap) if view_cap else True,
            "edit": has_admin_capability(user, edit_cap) if edit_cap else False,
        }
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.get_full_name() or user.username or user.email or "",
        "is_staff": bool(user.is_staff),
        "is_superuser": bool(user.is_superuser),
        "roles": get_user_role_names(user),
        "capabilities": capabilities,
        "modules": modules,
    }
