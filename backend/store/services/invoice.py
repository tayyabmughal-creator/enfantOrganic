import base64
import logging
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
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

try:
    import qrcode

    QRCODE_AVAILABLE = True
except ImportError:
    QRCODE_AVAILABLE = False

try:
    import arabic_reshaper
    from bidi.algorithm import get_display

    ARABIC_SHAPING_AVAILABLE = True
except ImportError:
    ARABIC_SHAPING_AVAILABLE = False


MONEY_QUANTIZER = Decimal("0.01")
AR_FONT_NAME = "InvoiceArabic"
AR_BOLD_FONT_NAME = "InvoiceArabicBold"


def _money(value):
    return Decimal(value or "0").quantize(MONEY_QUANTIZER, rounding=ROUND_HALF_UP)


def _shape_ar(text):
    value = str(text or "")
    if not value:
        return ""
    if not ARABIC_SHAPING_AVAILABLE:
        return value
    return get_display(arabic_reshaper.reshape(value))


def _bilingual(en_text, ar_text):
    return f"{en_text} / {_shape_ar(ar_text)}"


def _candidate_font_paths():
    return (
        ("/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf", "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf"),
        ("/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf", "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf"),
        ("/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.ttf", "/usr/share/fonts/opentype/noto/NotoSansArabic-Bold.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
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
        (4, str(_money(invoice_total))),
        (5, str(_money(vat_total))),
    ]
    payload = bytearray()
    for tag, raw_value in entries:
        value_bytes = str(raw_value or "").encode("utf-8")
        payload.append(tag)
        payload.append(len(value_bytes))
        payload.extend(value_bytes)
    return base64.b64encode(bytes(payload)).decode("ascii")


def _build_qr_image_bytes(data):
    if not QRCODE_AVAILABLE:
        return None
    qr_image = qrcode.make(data)
    stream = BytesIO()
    qr_image.save(stream, format="PNG")
    return stream.getvalue()


def _seller_snapshot(order):
    region = order.region
    return {
        "legal_name": region.seller_legal_name or region.name_en or "",
        "vat_number": region.seller_vat_number or "",
        "cr_number": region.seller_cr_number or "",
        "address_en": region.seller_address_en or region.address_en or "",
        "address_ar": region.seller_address_ar or region.address_ar or "",
        "phone": region.seller_phone or region.contact_phone or "",
        "email": region.seller_email or region.contact_email or "",
    }


def _buyer_snapshot(order):
    return {
        "name": order.customer_name or "",
        "email": order.customer_email or "",
        "phone": order.customer_phone or "",
        "address_line_1": order.address_line_1 or "",
        "address_line_2": order.address_line_2 or "",
        "city": order.city or "",
        "country": order.country or "",
    }


def _is_ksa_order(order):
    region_code = (order.region.code or "").lower()
    return region_code == "sa"


def _invoice_styles(base_font, bold_font):
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "InvoiceTitle",
            parent=styles["Title"],
            fontName=bold_font,
            fontSize=18,
            leading=24,
        ),
        "heading": ParagraphStyle(
            "InvoiceHeading",
            parent=styles["Heading4"],
            fontName=bold_font,
            fontSize=10,
            leading=14,
        ),
        "body": ParagraphStyle(
            "InvoiceBody",
            parent=styles["BodyText"],
            fontName=base_font,
            fontSize=9,
            leading=13,
        ),
        "body_bold": ParagraphStyle(
            "InvoiceBodyBold",
            parent=styles["BodyText"],
            fontName=bold_font,
            fontSize=9,
            leading=13,
        ),
    }


def _build_invoice_pdf_bytes(order):
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlab is not installed. Install backend requirements to generate invoices.")

    _register_invoice_fonts()
    base_font = AR_FONT_NAME if AR_FONT_NAME in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    bold_font = AR_BOLD_FONT_NAME if AR_BOLD_FONT_NAME in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    styles = _invoice_styles(base_font=base_font, bold_font=bold_font)

    seller = _seller_snapshot(order)
    buyer = _buyer_snapshot(order)
    invoice_date = timezone.localtime(order.invoice_date or timezone.now())
    vat_rate_percent = (_money(order.tax_rate) * Decimal("100")).quantize(MONEY_QUANTIZER)
    payment_status_label = order.get_payment_status_display() if hasattr(order, "get_payment_status_display") else str(order.payment_status or "")

    zatca_qr_payload = None
    qr_png_bytes = None
    if _is_ksa_order(order):
        zatca_qr_payload = build_zatca_phase1_tlv_base64(
            seller_name=seller["legal_name"],
            seller_vat_number=seller["vat_number"],
            timestamp_iso=invoice_date.isoformat(timespec="seconds"),
            invoice_total=order.grand_total,
            vat_total=order.tax_total,
        )
        qr_png_bytes = _build_qr_image_bytes(zatca_qr_payload)

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )
    story = []

    story.append(Paragraph(_bilingual("Tax Invoice", "فاتورة ضريبية"), styles["title"]))
    story.append(Spacer(1, 4 * mm))

    invoice_meta = Table(
        [
            [
                Paragraph(_bilingual("Invoice Number", "رقم الفاتورة"), styles["body_bold"]),
                Paragraph(order.invoice_number or "—", styles["body"]),
                Paragraph(_bilingual("Invoice Date", "تاريخ الفاتورة"), styles["body_bold"]),
                Paragraph(invoice_date.strftime("%Y-%m-%d %H:%M:%S"), styles["body"]),
            ],
            [
                Paragraph(_bilingual("Order Number", "رقم الطلب"), styles["body_bold"]),
                Paragraph(order.order_number, styles["body"]),
                Paragraph(_bilingual("Region / Currency", "المنطقة / العملة"), styles["body_bold"]),
                Paragraph(f"{(order.region.code or '').upper()} / {order.currency_code}", styles["body"]),
            ],
            [
                Paragraph(_bilingual("Payment Status", "حالة الدفع"), styles["body_bold"]),
                Paragraph(f"{payment_status_label} ({order.payment_status})", styles["body"]),
                Paragraph(_bilingual("Order Status", "حالة الطلب"), styles["body_bold"]),
                Paragraph(order.get_status_display(), styles["body"]),
            ],
        ],
        colWidths=[30 * mm, 56 * mm, 30 * mm, 60 * mm],
        hAlign="LEFT",
    )
    invoice_meta.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), base_font),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d6dad2")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f6ef")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(invoice_meta)
    story.append(Spacer(1, 4 * mm))

    seller_text = "<br/>".join(
        filter(
            None,
            [
                seller["legal_name"],
                f"{_bilingual('VAT No.', 'الرقم الضريبي')}: {seller['vat_number']}" if seller["vat_number"] else "",
                f"{_bilingual('CR No.', 'السجل التجاري')}: {seller['cr_number']}" if seller["cr_number"] else "",
                seller["address_en"],
                _shape_ar(seller["address_ar"]) if seller["address_ar"] else "",
                " · ".join(filter(None, [seller["phone"], seller["email"]])),
            ],
        )
    )
    buyer_address = ", ".join(
        filter(
            None,
            [
                buyer["address_line_1"],
                buyer["address_line_2"],
                buyer["city"],
                buyer["country"],
            ],
        )
    )
    buyer_text = "<br/>".join(
        filter(
            None,
            [
                buyer["name"],
                buyer_address,
                " · ".join(filter(None, [buyer["phone"], buyer["email"]])),
            ],
        )
    )
    party_table = Table(
        [
            [
                Paragraph(_bilingual("Seller", "البائع"), styles["heading"]),
                Paragraph(_bilingual("Buyer", "المشتري"), styles["heading"]),
            ],
            [
                Paragraph(seller_text or "—", styles["body"]),
                Paragraph(buyer_text or "—", styles["body"]),
            ],
        ],
        colWidths=[86 * mm, 86 * mm],
        hAlign="LEFT",
    )
    party_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d6dad2")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8faf6")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(party_table)
    story.append(Spacer(1, 5 * mm))

    item_rows = [
        [
            "#",
            _bilingual("Item", "الصنف"),
            _bilingual("Qty", "الكمية"),
            _bilingual("Unit Price", "سعر الوحدة"),
            _bilingual("Line Total", "الإجمالي"),
        ]
    ]
    for index, item in enumerate(order.items.all(), start=1):
        name_text = item.product_name
        if item.selected_options_text:
            name_text = f"{name_text} ({item.selected_options_text})"
        item_rows.append(
            [
                str(index),
                name_text,
                str(item.quantity),
                f"{_money(item.unit_price)} {order.currency_code}",
                f"{_money(item.line_total)} {order.currency_code}",
            ]
        )
    items_table = Table(
        item_rows,
        colWidths=[8 * mm, 82 * mm, 18 * mm, 30 * mm, 36 * mm],
        hAlign="LEFT",
    )
    items_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), bold_font),
                ("FONTNAME", (0, 1), (-1, -1), base_font),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d6dad2")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#edf2e6")),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 5 * mm))

    totals_rows = [
        [_bilingual("Subtotal", "المجموع الفرعي"), f"{_money(order.subtotal)} {order.currency_code}"],
        [_bilingual("Discount", "الخصم"), f"{_money(order.discount_total)} {order.currency_code}"],
        [_bilingual("Shipping", "الشحن"), f"{_money(order.shipping_total)} {order.currency_code}"],
        [
            f"{order.tax_label or _bilingual('VAT', 'ضريبة القيمة المضافة')} ({vat_rate_percent}%)",
            f"{_money(order.tax_total)} {order.currency_code}",
        ],
        [_bilingual("Grand Total", "الإجمالي الكلي"), f"{_money(order.grand_total)} {order.currency_code}"],
    ]
    totals_table = Table(totals_rows, colWidths=[112 * mm, 60 * mm], hAlign="LEFT")
    totals_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -2), base_font),
                ("FONTNAME", (0, -1), (-1, -1), bold_font),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d6dad2")),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f3f7ed")),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(totals_table)

    if _is_ksa_order(order):
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph(_bilingual("KSA ZATCA Phase 1 QR", "رمز الاستجابة السريعة - زاتكا المرحلة الأولى"), styles["heading"]))
        if qr_png_bytes:
            qr_flowable = Image(BytesIO(qr_png_bytes), width=32 * mm, height=32 * mm)
            qr_table = Table(
                [[qr_flowable, Paragraph(_bilingual("TLV Base64 Payload", "بيانات TLV المشفرة"), styles["body_bold"])]],
                colWidths=[34 * mm, 138 * mm],
            )
            qr_table.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 2),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ]
                )
            )
            story.append(qr_table)
        if zatca_qr_payload:
            story.append(Paragraph(zatca_qr_payload, styles["body"]))

    story.append(Spacer(1, 4 * mm))
    story.append(
        Paragraph(
            _bilingual(
                "This invoice is generated by Enfant Organic platform and is structured for KSA ZATCA Phase 1 QR compliance where applicable.",
                "تم إنشاء هذه الفاتورة عبر منصة إنفانت أورجانيك وهي مهيكلة لتوافق رمز زاتكا للمرحلة الأولى في المملكة عند الاقتضاء.",
            ),
            styles["body"],
        )
    )

    document.build(story)
    buffer.seek(0)
    return buffer.getvalue(), zatca_qr_payload


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
