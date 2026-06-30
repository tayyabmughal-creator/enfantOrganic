from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.core.validators import MinValueValidator
from django.db import migrations, models


COST_QUANTIZER = Decimal("0.001")

POLICY_LINKS = [
    {"label_en": "Privacy Policy", "label_ar": "سياسة الخصوصية", "href": "/privacy-policy"},
    {"label_en": "Cookie Policy", "label_ar": "سياسة ملفات تعريف الارتباط", "href": "/cookie-policy"},
    {"label_en": "Payment Options", "label_ar": "خيارات الدفع", "href": "/payment-options"},
    {"label_en": "Terms of Service", "label_ar": "شروط الخدمة", "href": "/terms"},
    {"label_en": "Return & Refund Policy", "label_ar": "سياسة الإرجاع والاسترداد", "href": "/return-policy"},
    {"label_en": "Shipping Policy", "label_ar": "سياسة الشحن", "href": "/shipping-policy"},
]

POLICY_PAGES = [
    {
        "slug": "privacy-policy",
        "title_en": "Privacy Policy",
        "title_ar": "سياسة الخصوصية",
        "body_en": "<p>We collect the information needed to process orders, deliver purchases, respond to support requests, and send updates you opted into. Payment details are processed by approved payment partners and are not stored by Enfant Organics.</p>",
        "body_ar": "<p>نجمع المعلومات اللازمة لمعالجة الطلبات وتوصيل المشتريات والرد على طلبات الدعم وإرسال التحديثات التي اشتركتِ بها. تتم معالجة بيانات الدفع عبر شركاء دفع معتمدين ولا نخزنها لدى إنفانت أورجانيك.</p>",
    },
    {
        "slug": "cookie-policy",
        "title_en": "Cookie Policy",
        "title_ar": "سياسة ملفات تعريف الارتباط",
        "body_en": "<p>We use essential cookies for cart, checkout, account, region, and language preferences. You can control cookies from your browser settings, but blocking essential cookies may affect checkout.</p>",
        "body_ar": "<p>نستخدم ملفات تعريف ارتباط أساسية للسلة والدفع والحساب وتفضيلات المنطقة واللغة. يمكنك التحكم بها من إعدادات المتصفح، لكن حظر الملفات الأساسية قد يؤثر على الدفع.</p>",
    },
    {
        "slug": "payment-options",
        "title_en": "Payment Options",
        "title_ar": "خيارات الدفع",
        "body_en": "<p>Available payment methods are shown at checkout based on your delivery region. Online payments are handled through trusted payment partners, and payment availability may vary by market.</p>",
        "body_ar": "<p>تظهر طرق الدفع المتاحة عند الدفع حسب منطقة التوصيل. تتم المدفوعات الإلكترونية عبر شركاء موثوقين وقد تختلف طرق الدفع حسب السوق.</p>",
    },
    {
        "slug": "terms",
        "title_en": "Terms & Conditions",
        "title_ar": "الشروط والأحكام",
        "body_en": "<p>By using this storefront and placing an order, you agree to our product availability, pricing, delivery, payment, and support terms. Orders are confirmed once an order number is issued.</p>",
        "body_ar": "<p>باستخدام هذا المتجر وتقديم طلب، فإنك توافقين على شروط توفر المنتجات والأسعار والتوصيل والدفع والدعم. يتم تأكيد الطلب عند إصدار رقم الطلب.</p>",
    },
    {
        "slug": "return-policy",
        "title_en": "Return & Refund Policy",
        "title_ar": "سياسة الإرجاع والاسترداد",
        "body_en": "<p>Unopened and undamaged products may be returned within 7 days of delivery. Contact support with your order number. Opened products cannot be returned for hygiene and safety reasons.</p>",
        "body_ar": "<p>يمكن إرجاع المنتجات غير المفتوحة وغير التالفة خلال 7 أيام من التسليم. تواصلي مع الدعم برقم الطلب. لا يمكن إرجاع المنتجات المفتوحة لأسباب صحية وأمان.</p>",
    },
    {
        "slug": "shipping-policy",
        "title_en": "Shipping Policy",
        "title_ar": "سياسة الشحن",
        "body_en": "<p>We deliver across supported GCC regions. Delivery timelines, shipping fees, and free-shipping thresholds are shown during checkout for your selected region.</p>",
        "body_ar": "<p>نوصل إلى مناطق الخليج المدعومة. تظهر مدد التوصيل ورسوم الشحن وحدود الشحن المجاني أثناء الدفع حسب منطقتك المختارة.</p>",
    },
]


def quantize_cost(value):
    try:
        return Decimal(str(value or 0)).quantize(COST_QUANTIZER, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.000")


def _raw_options(raw):
    options = raw.get("options") if isinstance(raw, dict) else None
    return options if isinstance(options, dict) else {}


def _identity(raw):
    if not isinstance(raw, dict):
        return set()
    return {
        str(value).strip()
        for value in (raw.get("id"), raw.get("sku"))
        if str(value or "").strip()
    }


def _snapshot_identity(snapshot, variant_id):
    identity = {str(variant_id or "").strip()} if str(variant_id or "").strip() else set()
    if isinstance(snapshot, dict):
        identity.update(
            str(value).strip()
            for value in (snapshot.get("id"), snapshot.get("sku"))
            if str(value or "").strip()
        )
    return identity


def _matches(raw, snapshot, variant_id):
    raw_identity = _identity(raw)
    snapshot_identity = _snapshot_identity(snapshot, variant_id)
    if raw_identity and snapshot_identity and raw_identity.intersection(snapshot_identity):
        return True
    raw_options = _raw_options(raw)
    snapshot_options = _raw_options(snapshot)
    return bool(raw_options and snapshot_options and raw_options == snapshot_options)


def _variant_cost(raw):
    if not isinstance(raw, dict):
        return None
    nested = raw.get("cost") if isinstance(raw.get("cost"), dict) else {}
    for value in (
        raw.get("cost_price"),
        raw.get("unit_cost"),
        raw.get("base_cost"),
        raw.get("cost"),
        nested.get("amount"),
        nested.get("cost_price"),
    ):
        if value in (None, ""):
            continue
        try:
            return max(Decimal(str(value)).quantize(COST_QUANTIZER, rounding=ROUND_HALF_UP), Decimal("0.000"))
        except (InvalidOperation, TypeError, ValueError):
            continue
    return None


def _find_variant(product, snapshot, variant_id):
    rows = getattr(product, "variants", None)
    if not isinstance(rows, list):
        return None
    for raw in rows:
        if _matches(raw, snapshot, variant_id):
            return raw
    return None


def backfill_order_item_costs(apps, schema_editor):
    OrderItem = apps.get_model("store", "OrderItem")

    for item in OrderItem.objects.select_related("product").iterator(chunk_size=1000):
        product = item.product
        snapshot = item.price_snapshot if isinstance(item.price_snapshot, dict) else {}
        variant_snapshot = snapshot.get("variant") if isinstance(snapshot.get("variant"), dict) else None
        variant_id = snapshot.get("variant_id", "")
        raw_variant = _find_variant(product, variant_snapshot, variant_id) if product else None
        variant_unit_cost = _variant_cost(raw_variant)
        unit_cost = variant_unit_cost if variant_unit_cost is not None else quantize_cost(getattr(product, "cost_price", 0))
        line_cost = quantize_cost(unit_cost * int(item.quantity or 0))

        sku = ""
        if isinstance(variant_snapshot, dict):
            sku = str(variant_snapshot.get("sku") or "").strip()
        if not sku and isinstance(raw_variant, dict):
            sku = str(raw_variant.get("sku") or raw_variant.get("id") or "").strip()

        item.sku = sku
        item.unit_cost_price = unit_cost
        item.line_cost_total = line_cost
        item.save(update_fields=["sku", "unit_cost_price", "line_cost_total"])


def seed_policy_pages(apps, schema_editor):
    CmsPage = apps.get_model("store", "CmsPage")
    SiteSettings = apps.get_model("store", "SiteSettings")

    for payload in POLICY_PAGES:
        page, created = CmsPage.objects.get_or_create(
            slug=payload["slug"],
            region=None,
            defaults={**payload, "is_published": True},
        )
        if created:
            continue
        changed = []
        for field in ("title_en", "title_ar", "body_en", "body_ar"):
            if not getattr(page, field, ""):
                setattr(page, field, payload[field])
                changed.append(field)
        if changed:
            page.save(update_fields=changed)

    desired_by_href = {link["href"]: link for link in POLICY_LINKS}
    aliases = {"/returns": "/return-policy", "/shipping": "/shipping-policy"}
    for settings in SiteSettings.objects.all():
        current = settings.policy_links if isinstance(settings.policy_links, list) else []
        merged = []
        seen = set()
        for link in current:
            if not isinstance(link, dict):
                continue
            next_link = dict(link)
            href = aliases.get(str(next_link.get("href") or "").strip(), str(next_link.get("href") or "").strip())
            next_link["href"] = href
            merged.append(next_link)
            if href in desired_by_href:
                seen.add(href)
        for href, link in desired_by_href.items():
            if href not in seen:
                merged.append(dict(link))
        if merged != current:
            settings.policy_links = merged
            settings.save(update_fields=["policy_links"])


class Migration(migrations.Migration):

    dependencies = [
        ("store", "0060_sitesettings_terms_policy"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderitem",
            name="sku",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="unit_cost_price",
            field=models.DecimalField(decimal_places=3, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="line_cost_total",
            field=models.DecimalField(decimal_places=3, default=0, max_digits=12),
        ),
        migrations.AlterField(
            model_name="product",
            name="cost_price",
            field=models.DecimalField(decimal_places=3, default=0, max_digits=10, validators=[MinValueValidator(0)]),
        ),
        migrations.RunPython(backfill_order_item_costs, migrations.RunPython.noop),
        migrations.RunPython(seed_policy_pages, migrations.RunPython.noop),
    ]
