import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import { getNavigationData } from "@/lib/api";
import { normalizeLocale, normalizeRegion, formatMoney } from "@/lib/storefront";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

async function getOrder(orderNumber, emailOrPhone) {
  const params = new URLSearchParams();
  if (emailOrPhone) {
    params.set("email_or_phone", emailOrPhone);
  }

  const query = params.toString();
  const response = await fetch(`${API_BASE_URL}/orders/${orderNumber}/${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function money(amount, currencyCode, regionCode, locale) {
  return formatMoney(
    { amount: Number(amount), currency_code: currencyCode, region_code: regionCode, prefix: "" },
    locale,
  );
}

export default async function ThankYouPage({ params, searchParams }) {
  const { locale: localeParam, orderNumber } = await params;
  const resolvedSearchParams = await searchParams;
  const locale = normalizeLocale(localeParam);

  if (localeParam !== locale) {
    notFound();
  }

  const requestedRegion = normalizeRegion(resolvedSearchParams?.region || "om");
  const emailOrPhone = resolvedSearchParams?.email_or_phone || "";
  const order = await getOrder(orderNumber, emailOrPhone);
  const orderRegion = normalizeRegion(order?.region_code || requestedRegion);
  const navigation = await getNavigationData(locale, orderRegion);

  if (!order) {
    return (
      <StorefrontShell locale={locale} navigation={navigation}>
        <section className="section-shell thank-you-page">
          <div className="section-heading">
            <p>Order</p>
            <h1>Order not found</h1>
          </div>
        </section>
      </StorefrontShell>
    );
  }

  const whatsappPhone =
    order.region?.whatsapp_phone || process.env.NEXT_PUBLIC_WHATSAPP_PHONE || "";
  const totalFormatted = money(order.grand_total, order.currency_code, orderRegion, locale);
  const message = encodeURIComponent(
    `New order confirmation\n\nOrder: ${order.order_number}\nName: ${order.customer_name}\nPhone: ${order.customer_phone}\nAddress: ${order.address_line_1}, ${order.city}, ${order.country}\nTotal: ${totalFormatted}\n\nItems:\n${order.items
      .map((item) => `- ${item.product_name} x ${item.quantity}`)
      .join("\n")}`,
  );
  const whatsappHref = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${message}` : "";

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section-shell thank-you-page">
        <div className="section-heading">
          <p>Thank you</p>
          <h1>Your order has been placed</h1>
        </div>

        <div className="thank-you-card">
          <h2>Order #{order.order_number}</h2>

          <div className="thank-you-meta">
            <div>
              <span>Status</span>
              <strong>{order.status}</strong>
            </div>
            <div>
              <span>Payment method</span>
              <strong>{order.payment_method}</strong>
            </div>
            <div>
              <span>Payment status</span>
              <strong>{order.payment_status}</strong>
            </div>
          </div>

          {order.status_timeline?.length ? (
            <div className="order-timeline">
              {order.status_timeline.map((step) => (
                <div
                  key={step.key}
                  className={`timeline-step ${
                    step.is_completed ? "completed" : ""
                  } ${step.is_current ? "current" : ""}`}
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
            >
              Confirm on WhatsApp
            </a>
          ) : null}

          <hr />

          <h3>Customer</h3>
          <p>{order.customer_name}</p>
          <p>{order.customer_phone}</p>
          {order.customer_email ? <p>{order.customer_email}</p> : null}
          <p>
            {order.address_line_1} {order.address_line_2}
            <br />
            {order.city}, {order.country}
          </p>

          <hr />

          <h3>Items</h3>
          <div className="summary-lines">
            {order.items.map((item) => (
              <div key={`${item.product_slug}-${item.selected_options_text}`} className="summary-line">
                <div>
                  <strong>{item.product_name}</strong>
                  {item.selected_options_text ? <span>{item.selected_options_text}</span> : null}
                  <small>Qty: {item.quantity}</small>
                </div>
                <b>{money(item.line_total, order.currency_code, orderRegion, locale)}</b>
              </div>
            ))}
          </div>

          <hr />

          <h3>Order totals</h3>
          <div className="summary-lines">
            <div className="total-line">
              <span>Subtotal</span>
              <b>{money(order.subtotal, order.currency_code, orderRegion, locale)}</b>
            </div>

            {Number(order.discount_total) > 0 ? (
              <div className="total-line">
                <span>
                  Discount{order.coupon_code ? ` (${order.coupon_code})` : ""}
                </span>
                <b style={{ color: "var(--color-success, #16a34a)" }}>
                  -{money(order.discount_total, order.currency_code, orderRegion, locale)}
                </b>
              </div>
            ) : null}

            <div className="total-line">
              <span>Shipping</span>
              <b>
                {Number(order.shipping_total) > 0
                  ? money(order.shipping_total, order.currency_code, orderRegion, locale)
                  : "Free"}
              </b>
            </div>

            <div className="total-line order-grand-total">
              <strong>Grand total</strong>
              <strong>{money(order.grand_total, order.currency_code, orderRegion, locale)}</strong>
            </div>
          </div>

          {order.notes ? (
            <>
              <hr />
              <h3>Notes</h3>
              <p>{order.notes}</p>
            </>
          ) : null}
        </div>
      </section>
    </StorefrontShell>
  );
}
