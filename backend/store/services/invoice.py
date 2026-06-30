import base64
import logging
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from django.utils import timezone

from ..models import Order

logger = logging.getLogger(__name__)

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether,
    )
    from reportlab.graphics.barcode import code128
    from reportlab.graphics.shapes import Drawing

    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    ARABIC_SHAPING_AVAILABLE = True
except ImportError:
    ARABIC_SHAPING_AVAILABLE = False


MONEY_QUANTIZER = Decimal("0.001")   # 3 dp for OMR-style display
AR_FONT_NAME = "InvoiceArabic"
AR_BOLD_FONT_NAME = "InvoiceArabicBold"

# Shopify palette
BRAND_GREEN = colors.HexColor("#5a8a2f")
LIGHT_GREY = colors.HexColor("#f5f5f5")
MID_GREY = colors.HexColor("#e0e0e0")
BLACK = colors.HexColor("#1a1a1a")
TEXT_GREY = colors.HexColor("#555555")

# Logo shipped with the frontend static assets (copy lives alongside Django)
_LOGO_CANDIDATES = [
    Path(__file__).resolve().parent.parent.parent.parent
    / "frontend/public/enfant/enfant-logo-original.png",
    Path(__file__).resolve().parent.parent.parent.parent
    / "frontend/public/enfant/enfant-logo.png",
    Path("/app/logo/enfant-logo-original.png"),   # Docker container path
    Path("/app/logo/enfant-logo.png"),
]


def _money(value, dp=3):
    """Format money with dp decimal places (3 for OMR, 2 for others)."""
    q = Decimal("0." + "0" * dp)
    return Decimal(value or "0").quantize(q, rounding=ROUND_HALF_UP)


def _money_str(value, currency_code="OMR"):
    dp = 3 if str(currency_code).upper() in ("OMR", "KWD", "BHD", "JOD") else 2
    return str(_money(value, dp))


def _shape_ar(text):
    value = str(text or "")
    if not value or not ARABIC_SHAPING_AVAILABLE:
        return value
    return get_display(arabic_reshaper.reshape(value))


def _candidate_font_paths():
    return (
        ("/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
         "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf"),
        ("/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
         "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf"),
        ("/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.ttf",
         "/usr/share/fonts/opentype/noto/NotoSansArabic-Bold.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        ("/System/Library/Fonts/Supplemental/Arial.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    )


def _register_invoice_fonts():
    if AR_FONT_NAME in pdfmetrics.getRegisteredFontNames():
        return
    for regular_path, bold_path in _candidate_font_paths():
        regular_font = Path(regular_path)
        bold_font = Path(bold_path)
        if not regular_font.exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont(AR_FONT_NAME, str(regular_font)))
            if bold_font.exists():
                pdfmetrics.registerFont(TTFont(AR_BOLD_FONT_NAME, str(bold_font)))
            else:
                pdfmetrics.registerFont(TTFont(AR_BOLD_FONT_NAME, str(regular_font)))
            return
        except Exception:
            continue


def _get_logo_image(width_mm=38):
    for candidate in _LOGO_CANDIDATES:
        if candidate.exists():
            try:
                return Image(str(candidate), width=width_mm * mm, height=width_mm * mm)
            except Exception:
                continue
    return None


def _get_barcode_flowable(text, width_mm=52, height_mm=14):
    """Return a Code128 barcode as a vector Drawing (works without renderPM)."""
    try:
        bc = code128.Code128(
            text,
            barWidth=0.55,
            barHeight=height_mm * mm,
            humanReadable=False,
            quiet=False,
        )
        bc_w = bc.width
        d = Drawing(bc_w, height_mm * mm)
        d.add(bc)
        return d
    except Exception:
        return None


def _fetch_product_image(item, size_mm=14):
    """Try to get product image bytes — local file first, then URL."""
    product = getattr(item, "product", None)
    img_bytes = None

    # 1. Local ImageField
    if product and product.image_file:
        try:
            product.image_file.open("rb")
            img_bytes = product.image_file.read()
            product.image_file.close()
        except Exception:
            img_bytes = None

    # 2. URL field
    if not img_bytes and product and product.image:
        try:
            with urllib.request.urlopen(product.image, timeout=4) as resp:
                img_bytes = resp.read()
        except Exception:
            img_bytes = None

    if not img_bytes:
        return None
    try:
        return Image(BytesIO(img_bytes), width=size_mm * mm, height=size_mm * mm)
    except Exception:
        return None


def _seller_snapshot(order):
    region = order.region
    return {
        "legal_name": region.seller_legal_name or "Enfant Organic",
        "vat_number": region.seller_vat_number or "",
        "cr_number": region.seller_cr_number or "",
        "address_en": region.seller_address_en or region.address_en or "IFZA Business Park - Building A02 - Dubai Silicon Oasis - Industrial Area - Dubai - United Arab Emirates",
        "phone": region.seller_phone or region.contact_phone or "",
        "email": region.seller_email or region.contact_email or "sales@enfant-me.com",
        "website": getattr(region, "website", "") or "www.enfantorganic.com",
    }


def _buyer_snapshot(order):
    return {
        "name": order.customer_name or "",
        "email": order.customer_email or "",
        "phone": order.customer_phone or "",
        "address_line_1": order.address_line_1 or "",
        "address_line_2": order.address_line_2 or "",
        "area": order.area or "",
        "city": order.city or "",
        "country": order.country or "",
    }


def _payment_method_label(order):
    labels = {
        "cod": "Cash on Delivery",
        "whatsapp": "WhatsApp Confirmation",
        "bank_transfer": "Bank Transfer",
        "online": "Online Payment",
    }
    return labels.get(order.payment_method, order.get_payment_method_display())


def _is_ksa_order(order):
    return (order.region.code or "").lower() == "sa"


def _styles(base_font, bold_font):
    styles = getSampleStyleSheet()
    return {
        "section_label": ParagraphStyle(
            "SectionLabel",
            fontName=bold_font,
            fontSize=7.5,
            leading=10,
            textColor=BLACK,
            spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "InvBody",
            fontName=base_font,
            fontSize=8.5,
            leading=12,
            textColor=BLACK,
        ),
        "body_sm": ParagraphStyle(
            "InvBodySm",
            fontName=base_font,
            fontSize=7.5,
            leading=11,
            textColor=TEXT_GREY,
        ),
        "body_bold": ParagraphStyle(
            "InvBodyBold",
            fontName=bold_font,
            fontSize=8.5,
            leading=12,
            textColor=BLACK,
        ),
        "item_name": ParagraphStyle(
            "InvItemName",
            fontName=base_font,
            fontSize=8.5,
            leading=12,
            textColor=BLACK,
        ),
        "total_label": ParagraphStyle(
            "InvTotalLabel",
            fontName=bold_font,
            fontSize=9.5,
            leading=13,
            textColor=BLACK,
        ),
        "grand_total": ParagraphStyle(
            "InvGrandTotal",
            fontName=bold_font,
            fontSize=10,
            leading=14,
            textColor=BLACK,
        ),
        "footer": ParagraphStyle(
            "InvFooter",
            fontName=base_font,
            fontSize=8,
            leading=12,
            textColor=TEXT_GREY,
            alignment=1,  # center
        ),
        "footer_bold": ParagraphStyle(
            "InvFooterBold",
            fontName=bold_font,
            fontSize=9,
            leading=13,
            textColor=BLACK,
            alignment=1,
        ),
        "invoice_ref": ParagraphStyle(
            "InvRef",
            fontName=bold_font,
            fontSize=9,
            leading=13,
            textColor=BLACK,
            alignment=2,  # right
        ),
        "invoice_date": ParagraphStyle(
            "InvDate",
            fontName=base_font,
            fontSize=8.5,
            leading=12,
            textColor=TEXT_GREY,
            alignment=2,
        ),
    }


def _build_invoice_pdf_bytes(order):
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlab is not installed.")

    _register_invoice_fonts()
    # Always use Helvetica for Latin text — NotoSansArabic lacks Latin glyphs.
    base_font = "Helvetica"
    bold_font = "Helvetica-Bold"
    ar_font = AR_FONT_NAME if AR_FONT_NAME in pdfmetrics.getRegisteredFontNames() else None
    st = _styles(base_font, bold_font)
    if ar_font:
        st["ar_body"] = ParagraphStyle(
            "InvArBody",
            fontName=ar_font,
            fontSize=8.5,
            leading=13,
            textColor=BLACK,
            alignment=2,  # right-align RTL text
        )

    seller = _seller_snapshot(order)
    buyer = _buyer_snapshot(order)
    currency = str(order.currency_code or "OMR").upper()
    invoice_date = timezone.localtime(order.invoice_date or timezone.now())
    invoice_number = order.invoice_number or order.order_number or ""
    date_str = invoice_date.strftime("%b %d, %Y")

    # ── ZATCA for KSA ────────────────────────────────────────────────────────
    zatca_qr_payload = None
    if _is_ksa_order(order):
        zatca_qr_payload = build_zatca_phase1_tlv_base64(
            seller_name=seller["legal_name"],
            seller_vat_number=seller["vat_number"],
            timestamp_iso=invoice_date.isoformat(timespec="seconds"),
            invoice_total=order.grand_total,
            vat_total=order.tax_total,
        )

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
    )
    story = []
    page_w = A4[0] - 36 * mm   # usable width

    # ── HEADER: logo left | ref+date+barcode right ────────────────────────────
    logo_img = _get_logo_image(width_mm=36)
    barcode_drawing = _get_barcode_flowable(invoice_number, width_mm=56, height_mm=12)

    right_w = page_w * 0.52
    left_w = page_w - right_w

    right_content = [
        Paragraph(f"Receipt / Tax Invoice #{invoice_number}", st["invoice_ref"]),
        Paragraph(date_str, st["invoice_date"]),
    ]
    if barcode_drawing:
        right_content.append(barcode_drawing)

    logo_cell = logo_img or Paragraph(seller["legal_name"], st["body_bold"])
    header_tbl = Table(
        [[logo_cell, right_content]],
        colWidths=[left_w, right_w],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 8 * mm))

    # ── ADDRESS BLOCK: Shipping Address | Customer | Payment Method ───────────
    def _address_cell(b):
        """Return a list of Paragraphs for an address cell, mixing Latin/Arabic fonts."""
        paras = []
        ar_style = st.get("ar_body")

        # Name: show Arabic-shaped version (right-aligned) then Latin original
        name = b.get("name") or ""
        ar_name = _shape_ar(name) if name else ""
        if ar_style and ar_name and ar_name != name:
            paras.append(Paragraph(ar_name, ar_style))
        if name:
            paras.append(Paragraph(name, st["body"]))

        # Address line (usually Latin)
        addr = ", ".join(filter(None, [
            b.get("address_line_1", ""), b.get("address_line_2", ""), b.get("area", ""),
        ]))
        if addr:
            paras.append(Paragraph(addr, st["body"]))

        # City + Country — may contain Arabic
        city = b.get("city") or ""
        country = b.get("country") or ""
        ar_city = _shape_ar(city) if city else ""
        if ar_style and ar_city and ar_city != city:
            ar_country = _shape_ar(country) if country else country
            city_line = f"{ar_city}، {ar_country}" if ar_country else ar_city
            paras.append(Paragraph(city_line, ar_style))
        else:
            city_country = ", ".join(filter(None, [city, country]))
            if city_country:
                paras.append(Paragraph(city_country, st["body"]))

        if b.get("phone"):
            paras.append(Paragraph(f"Tel. {b['phone']}", st["body"]))

        return paras or [Paragraph("—", st["body"])]

    addr_cell = _address_cell(buyer)
    payment_label = _payment_method_label(order)
    payment_status = order.get_payment_status_display() if hasattr(order, "get_payment_status_display") else ""

    col_w = page_w / 3
    addr_table = Table(
        [
            [
                Paragraph("SHIPPING ADDRESS", st["section_label"]),
                Paragraph("CUSTOMER", st["section_label"]),
                Paragraph("PAYMENT METHOD", st["section_label"]),
            ],
            [
                addr_cell,
                addr_cell,
                [Paragraph(payment_label, st["body"]), Spacer(1, 6), Paragraph(payment_status, st["body"])],
            ],
        ],
        colWidths=[col_w, col_w, col_w],
    )
    addr_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, MID_GREY),
    ]))
    story.append(addr_table)
    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MID_GREY))
    story.append(Spacer(1, 4 * mm))

    # ── ITEMS TABLE ──────────────────────────────────────────────────────────
    # Column widths: image | name | price | qty | item_total
    img_w = 14 * mm
    name_w = page_w - img_w - 28 * mm - 16 * mm - 26 * mm
    price_w = 28 * mm
    qty_w = 16 * mm
    total_w = 26 * mm

    header_row = [
        "",
        Paragraph("ITEMS", st["section_label"]),
        Paragraph("PRICE", st["section_label"]),
        Paragraph("QTY", st["section_label"]),
        Paragraph("ITEM TOTAL", st["section_label"]),
    ]
    item_rows = [header_row]

    for item in order.items.all():
        prod_img = _fetch_product_image(item, size_mm=13)
        name_text = item.product_name or item.product_slug or "—"
        if item.selected_options_text:
            name_text += f"\n{item.selected_options_text}"
        unit_price = _money_str(item.unit_price, currency)
        line_total = _money_str(item.line_total, currency)
        item_rows.append([
            prod_img or "",
            Paragraph(name_text, st["item_name"]),
            Paragraph(unit_price, st["body"]),
            Paragraph(str(item.quantity), st["body"]),
            Paragraph(line_total, st["body"]),
        ])

    items_table = Table(
        item_rows,
        colWidths=[img_w, name_w, price_w, qty_w, total_w],
    )
    items_table.setStyle(TableStyle([
        # Header row
        ("FONTNAME", (0, 0), (-1, 0), bold_font),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, MID_GREY),
        # All rows
        ("FONTNAME", (0, 1), (-1, -1), base_font),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        # Align price/qty/total right
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        # Separator between each item row
        ("LINEBELOW", (0, 1), (-1, -2), 0.3, colors.HexColor("#eeeeee")),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MID_GREY))
    story.append(Spacer(1, 3 * mm))

    # ── TOTALS ───────────────────────────────────────────────────────────────
    subtotal = _money_str(order.subtotal, currency)
    discount = _money(order.discount_total)
    shipping = _money_str(order.shipping_total, currency)
    grand = _money_str(order.grand_total, currency)
    vat_total = _money(order.tax_total)
    vat_rate_pct = (_money(order.tax_rate, 4) * 100).quantize(Decimal("0.01"))

    totals_rows = []
    totals_rows.append(["", Paragraph("Subtotal", st["body"]), Paragraph(subtotal, st["body"])])
    if discount > 0:
        coupon_code = getattr(order, "coupon_code", "") or ""
        discount_label = f"Discount ({coupon_code})" if coupon_code else "Discount"
        totals_rows.append(["", Paragraph(discount_label, st["body"]),
                            Paragraph(f"- {_money_str(discount, currency)}", st["body"])])
    totals_rows.append(["", Paragraph("Shipping", st["body"]), Paragraph(shipping, st["body"])])
    if vat_total > 0:
        vat_label = order.tax_label or f"VAT ({vat_rate_pct}%)"
        totals_rows.append(["", Paragraph(vat_label, st["body"]),
                            Paragraph(_money_str(vat_total, currency), st["body"])])

    # Grand total row — bold and slightly larger
    totals_rows.append([
        "",
        Paragraph(f"TOTAL ({currency})", st["total_label"]),
        Paragraph(f"<b>{grand}</b>", st["grand_total"]),
    ])
    totals_rows.append(["", Paragraph("Total due", st["body"]), Paragraph(grand, st["body"])])

    label_w = page_w * 0.55
    value_w = page_w * 0.28
    totals_table = Table(
        totals_rows,
        colWidths=[page_w - label_w - value_w, label_w, value_w],
    )
    grand_row_idx = len(totals_rows) - 2  # second-to-last
    totals_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), base_font),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        # Grand total row highlight
        ("FONTNAME", (1, grand_row_idx), (2, grand_row_idx), bold_font),
        ("LINEABOVE", (1, grand_row_idx), (2, grand_row_idx), 0.5, MID_GREY),
        ("LINEBELOW", (1, grand_row_idx), (2, grand_row_idx), 0.5, MID_GREY),
    ]))
    story.append(totals_table)

    # ── KSA ZATCA QR (only for Saudi orders) ─────────────────────────────────
    if _is_ksa_order(order) and zatca_qr_payload:
        story.append(Spacer(1, 6 * mm))
        try:
            import qrcode as _qrcode
            qr_img = _qrcode.make(zatca_qr_payload)
            qr_buf = BytesIO()
            qr_img.save(qr_buf, format="PNG")
            qr_buf.seek(0)
            qr_flowable = Image(qr_buf, width=28 * mm, height=28 * mm)
            story.append(qr_flowable)
        except Exception:
            pass

    # ── FOOTER ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 12 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MID_GREY))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Thank you for shopping with us!", st["footer"]))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(f"<b>{seller['legal_name']}</b>", st["footer_bold"]))
    footer_lines = list(filter(None, [
        seller["address_en"],
        seller["email"],
        seller.get("website", "www.enfantorganic.com"),
    ]))
    if footer_lines:
        story.append(Paragraph("<br/>".join(footer_lines), st["footer"]))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue(), zatca_qr_payload


# ─── ZATCA helper (unchanged) ─────────────────────────────────────────────────

def build_zatca_phase1_tlv_base64(
    *,
    seller_name,
    seller_vat_number,
    timestamp_iso,
    invoice_total,
    vat_total,
):
    entries = [
        (1, seller_name),
        (2, seller_vat_number),
        (3, timestamp_iso),
        (4, str(_money(invoice_total, 2))),
        (5, str(_money(vat_total, 2))),
    ]
    payload = bytearray()
    for tag, raw_value in entries:
        value_bytes = str(raw_value or "").encode("utf-8")
        payload.append(tag)
        payload.append(len(value_bytes))
        payload.extend(value_bytes)
    return base64.b64encode(bytes(payload)).decode("ascii")


# ─── Public API ───────────────────────────────────────────────────────────────

def generate_order_invoice(order, *, force=False):
    if not force and order.invoice_pdf and order.invoice_status == Order.INVOICE_GENERATED:
        return order

    if not order.invoice_date:
        order.invoice_date = timezone.now()
    order.ensure_invoice_number(order.invoice_date)
    order.ensure_invoice_access_token()

    pdf_bytes, zatca_qr_payload = _build_invoice_pdf_bytes(order)
    file_name = f"{order.invoice_number or order.order_number}.pdf"
    order.invoice_pdf.save(file_name, ContentFile(pdf_bytes), save=False)
    order.invoice_status = Order.INVOICE_GENERATED
    updates = [
        "invoice_number",
        "invoice_date",
        "invoice_pdf",
        "invoice_status",
        "invoice_access_token",
        "updated_at",
    ]
    if _is_ksa_order(order):
        breakdown = dict(order.tax_breakdown or {})
        breakdown["zatca_phase_1_qr_payload"] = zatca_qr_payload or ""
        order.tax_breakdown = breakdown
        updates.append("tax_breakdown")
    order.save(update_fields=updates)
    return order


def ensure_paid_order_invoice(order, *, force=False):
    if order.payment_status != Order.PAYMENT_PAID:
        return order
    try:
        return generate_order_invoice(order, force=force)
    except Exception:
        logger.exception("Invoice generation failed for order %s", order.order_number)
        order.invoice_status = Order.INVOICE_FAILED
        order.save(update_fields=["invoice_status", "updated_at"])
        return order
