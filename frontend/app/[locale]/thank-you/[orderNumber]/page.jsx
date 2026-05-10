import { notFound } from "next/navigation";
import Link from "next/link";

import StorefrontShell from "@/components/layout/StorefrontShell";
import { getNavigationData } from "@/lib/api";
import { buildStorePath, normalizeLocale, normalizeRegion, formatMoney } from "@/lib/storefront";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

async function getOrder(orderNumber, emailOrPhone) {
  const params = new URLSearchParams();
  if (emailOrPhone) params.set("email_or_phone", emailOrPhone);
  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/orders/${orderNumber}/${query ? `?${query}` : ""}`,
    { cache: "no-store" },
  );
  if (!response.ok) return null;
  return response.json();
}

function money(amount, currencyCode, regionCode, locale) {
  return formatMoney(
    { amount: Number(amount), currency_code: currencyCode, region_code: regionCode, prefix: "" },
    locale,
  );
}

const PAYMENT_STATUS_LABELS = {
  unpaid: { label: "Unpaid", labelAr: "غير مدفوع", cls: "status-unpaid" },
  review: { label: "Under Review", labelAr: "قيد المراجعة", cls: "status-review" },
  paid: { label: "Paid", labelAr: "مدفوع", cls: "status-paid" },
  refunded: { label: "Refunded", labelAr: "مسترد", cls: "status-refunded" },
  pending: { label: "Pending", labelAr: "معالجة", cls: "status-pending" },
  failed: { label: "Failed", labelAr: "فاشل", cls: "status-failed" },
};

const ORDER_STATUS_LABELS = {
  pending: { label: "Pending", labelAr: "معلق", cls: "" },
  confirmed: { label: "Confirmed", labelAr: "مؤكد", cls: "status-confirmed" },
  preparing: { label: "Preparing", labelAr: "قيد التحضير", cls: "status-preparing" },
  ready: { label: "Ready", labelAr: "جاهز", cls: "status-ready" },
  out_for_delivery: { label: "Out for Delivery", labelAr: "في الطريق", cls: "status-out_for_delivery" },
  delivered: { label: "Delivered", labelAr: "تم التسليم", cls: "status-delivered" },
  cancelled: { label: "Cancelled", labelAr: "ملغي", cls: "status-cancelled" },
};

const PAYMENT_METHOD_LABELS = {
  cod: { label: "Cash on Delivery", labelAr: "الدفع عند الاستلام" },
  whatsapp: { label: "WhatsApp Confirmation", labelAr: "تأكيد عبر واتساب" },
  bank_transfer: { label: "Bank Transfer", labelAr: "تحويل بنكي" },
  online: { label: "Online Payment", labelAr: "دفع إلكتروني" },
};

export default async function ThankYouPage({ params, searchParams }) {
  const { locale: localeParam, orderNumber } = await params;
  const resolvedSearchParams = await searchParams;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) notFound();

  const isAr = locale === "ar";
  const requestedRegion = normalizeRegion(resolvedSearchParams?.region || "om");
  const emailOrPhone = resolvedSearchParams?.email_or_phone || "";
  const order = await getOrder(orderNumber, emailOrPhone);
  const orderRegion = normalizeRegion(order?.region_code || requestedRegion);
  const navigation = await getNavigationData(locale, orderRegion);

  if (!order) {
    return (
      <StorefrontShell locale={locale} navigation={navigation}>
        <section className="section-shell thank-you-page">
          <div className="payment-page-card" style={{ marginTop: "24px" }}>
            <div className="payment-page-icon failed">404</div>
            <h1>{isAr ? "الطلب غير موجود" : "Order Not Found"}</h1>
            <p>{isAr ? "تعذّر العثور على هذا الطلب." : "We couldn't find this order."}</p>
            <div className="payment-page-actions">
              <Link href={buildStorePath(locale, "/track-order", orderRegion)} className="primary-action">
                {isAr ? "تتبع طلب" : "Track an Order"}
              </Link>
            </div>
          </div>
        </section>
      </StorefrontShell>
    );
  }

  const whatsappPhone = order.region?.whatsapp_phone || process.env.NEXT_PUBLIC_WHATSAPP_PHONE || "";
  const totalFormatted = money(order.grand_total, order.currency_code, orderRegion, locale);
  const message = encodeURIComponent(
    `New order confirmation\n\nOrder: ${order.order_number}\nName: ${order.customer_name}\nPhone: ${order.customer_phone}\nAddress: ${order.address_line_1}, ${order.city}, ${order.country}\nTotal: ${totalFormatted}\n\nItems:\n${order.items
      .map((item) => `- ${item.product_name} x ${item.quantity}`)
      .join("\n")}`,
  );
  const whatsappHref = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${message}` : "";

  const paymentStatusInfo = PAYMENT_STATUS_LABELS[order.payment_status] || {
    label: order.payment_status,
    cls: "",
  };
  const orderStatusInfo = ORDER_STATUS_LABELS[order.status] || { label: order.status, cls: "" };
  const paymentMethodInfo = PAYMENT_METHOD_LABELS[order.payment_method] || { label: order.payment_method };

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section-shell thank-you-page">
        <div className="section-heading">
          <div>
            <p style={{ margin: "0 0 4px", color: "var(--text-soft)", fontSize: "0.9rem" }}>
              {isAr ? "شكراً لك" : "Thank you"}
            </p>
            <h1 style={{ margin: 0, fontSize: "clamp(1.8rem, 3vw, 2.6rem)", letterSpacing: "-0.04em" }}>
              {isAr ? "تم تقديم طلبك" : "Your order has been placed"}
            </h1>
          </div>
          <Link
            href={buildStorePath(locale, "/collections", orderRegion)}
            className="secondary-action"
            style={{ flexShrink: 0 }}
          >
            {isAr ? "متابعة التسوق" : "Continue Shopping"}
          </Link>
        </div>

        <div className="thank-you-card">
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: "0.84rem", color: "var(--text-soft)", fontWeight: 700 }}>
                {isAr ? "رقم الطلب" : "Order number"}
              </p>
              <h2 style={{ margin: 0, fontFamily: "monospace", fontSize: "1.2rem", letterSpacing: "0.04em" }}>
                {order.order_number}
              </h2>
            </div>
            <div className="thank-you-status-row">
              <span className={`order-status-chip ${orderStatusInfo.cls}`}>
                {isAr ? orderStatusInfo.labelAr : orderStatusInfo.label}
              </span>
              <span className={`payment-status-badge ${paymentStatusInfo.cls}`}>
                {isAr ? paymentStatusInfo.labelAr : paymentStatusInfo.label}
              </span>
            </div>
          </div>

          <div className="thank-you-meta">
            <div>
              <span>{isAr ? "طريقة الدفع" : "Payment method"}</span>
              <strong>{isAr ? paymentMethodInfo.labelAr : paymentMethodInfo.label}</strong>
            </div>
            <div>
              <span>{isAr ? "المدينة" : "City"}</span>
              <strong>{order.city}, {order.country}</strong>
            </div>
            <div>
              <span>{isAr ? "الإجمالي" : "Grand total"}</span>
              <strong>{totalFormatted}</strong>
            </div>
          </div>

          {order.status_timeline?.length ? (
            <div className="order-timeline">
              {order.status_timeline.map((step) => (
                <div
                  key={step.key}
                  className={`timeline-step ${step.is_completed ? "completed" : ""} ${step.is_current ? "current" : ""}`}
                >
                  <span className="timeline-dot" />
                  <p>{step.label}</p>
                </div>
              ))}
            </div>
          ) : null}

          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="primary-action full-width thank-you-whatsapp"
              style={{ background: "#25d366", color: "white", borderColor: "#25d366" }}
            >
              {isAr ? "تأكيد عبر واتساب" : "Confirm on WhatsApp"}
            </a>
          ) : null}

          <hr />

          <h3 style={{ margin: "0 0 10px" }}>{isAr ? "بيانات العميل" : "Customer"}</h3>
          <p style={{ margin: "0 0 4px" }}>{order.customer_name}</p>
          <p style={{ margin: "0 0 4px", color: "var(--text-soft)" }}>{order.customer_phone}</p>
          {order.customer_email ? (
            <p style={{ margin: "0 0 4px", color: "var(--text-soft)" }}>{order.customer_email}</p>
          ) : null}
          <p style={{ margin: 0, color: "var(--text-soft)" }}>
            {order.address_line_1} {order.address_line_2}
            <br />
            {order.city}, {order.country}
          </p>

          <hr />

          <h3 style={{ margin: "0 0 10px" }}>{isAr ? "المنتجات" : "Items"}</h3>
          <div className="summary-lines">
            {order.items.map((item) => (
              <div key={`${item.product_slug}-${item.selected_options_text}`} className="summary-line">
                <div />
                <div>
                  <strong>{item.product_name}</strong>
                  {item.selected_options_text ? <span>{item.selected_options_text}</span> : null}
                  <small>{isAr ? `الكمية: ${item.quantity}` : `Qty: ${item.quantity}`}</small>
                </div>
                <b>{money(item.line_total, order.currency_code, orderRegion, locale)}</b>
              </div>
            ))}
          </div>

          <hr />

          <h3 style={{ margin: "0 0 10px" }}>{isAr ? "الإجماليات" : "Order Totals"}</h3>
          <div className="summary-lines">
            <div className="total-line">
              <span>{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
              <b>{money(order.subtotal, order.currency_code, orderRegion, locale)}</b>
            </div>
            {Number(order.discount_total) > 0 ? (
              <div className="total-line">
                <span>
                  {isAr ? "الخصم" : "Discount"}
                  {order.coupon_code ? ` (${order.coupon_code})` : ""}
                </span>
                <b style={{ color: "var(--success)" }}>
                  -{money(order.discount_total, order.currency_code, orderRegion, locale)}
                </b>
              </div>
            ) : null}
            <div className="total-line">
              <span>{isAr ? "الشحن" : "Shipping"}</span>
              <b>
                {Number(order.shipping_total) > 0
                  ? money(order.shipping_total, order.currency_code, orderRegion, locale)
                  : isAr ? "مجاناً" : "Free"}
              </b>
            </div>
            <div className="total-line order-grand-total">
              <strong>{isAr ? "الإجمالي الكلي" : "Grand Total"}</strong>
              <strong>{totalFormatted}</strong>
            </div>
          </div>

          {order.notes ? (
            <>
              <hr />
              <h3 style={{ margin: "0 0 8px" }}>{isAr ? "ملاحظات" : "Notes"}</h3>
              <p style={{ margin: 0, color: "var(--text-soft)" }}>{order.notes}</p>
            </>
          ) : null}
        </div>
      </section>
    </StorefrontShell>
  );
}
