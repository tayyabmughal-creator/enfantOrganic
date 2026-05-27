import Link from "next/link";
import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import PaymentOrderLink from "@/components/store/payment/PaymentOrderLink";
import { getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront";

export default async function PaymentSuccessPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  if (localeParam !== locale) notFound();

  const resolvedSearchParams = await searchParams;
  const region = resolveServerRegion(resolvedSearchParams);
  const orderNumber =
    resolvedSearchParams?.merchant_order_id ||
    resolvedSearchParams?.order_number ||
    resolvedSearchParams?.cart_id ||
    resolvedSearchParams?.cartId ||
    "";
  const lookupToken =
    resolvedSearchParams?.lookup_token ||
    resolvedSearchParams?.t ||
    resolvedSearchParams?.token ||
    "";
  const emailOrPhone = resolvedSearchParams?.email_or_phone || "";
  const navigation = await getNavigationData(locale, region);
  const isAr = locale === "ar";

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section-shell">
        <div className="payment-page-card">
          <div className="payment-page-icon success" aria-hidden="true">✓</div>

          <div>
            <h1>{isAr ? "تمّت عملية الدفع بنجاح" : "Payment Successful"}</h1>
            <p style={{ marginTop: "8px" }}>
              {isAr
                ? "شكراً لطلبك! سنبدأ في تجهيز طلبك في أقرب وقت."
                : "Thank you for your order! We will start preparing it right away."}
            </p>
          </div>

          {orderNumber ? (
            <div
              style={{
                padding: "14px 18px",
                borderRadius: "14px",
                background: "var(--surface-soft)",
                border: "1px solid var(--line)",
              }}
            >
              <p style={{ margin: "0 0 4px", fontSize: "0.84rem", color: "var(--text-soft)", fontWeight: 700 }}>
                {isAr ? "رقم الطلب" : "Order number"}
              </p>
              <strong style={{ fontFamily: "monospace", fontSize: "1.1rem", letterSpacing: "0.04em" }}>
                {orderNumber}
              </strong>
            </div>
          ) : null}

          <p style={{ fontSize: "0.9rem" }}>
            {isAr
              ? "ستصلك رسالة تأكيد بتفاصيل طلبك قريباً."
              : "You will receive a confirmation with your order details shortly."}
          </p>

          <div className="payment-page-actions">
            {orderNumber ? (
              <PaymentOrderLink
                href={buildStorePath(locale, `/thank-you/${orderNumber}`, region)}
                orderNumber={orderNumber}
                lookupToken={lookupToken}
                emailOrPhone={emailOrPhone}
                className="primary-action"
              >
                {isAr ? "عرض تفاصيل الطلب" : "View Order Details"}
              </PaymentOrderLink>
            ) : null}
            <Link href={buildStorePath(locale, "/collections", region)} className="secondary-action">
              {isAr ? "متابعة التسوق" : "Continue Shopping"}
            </Link>
          </div>
        </div>
      </section>
    </StorefrontShell>
  );
}
