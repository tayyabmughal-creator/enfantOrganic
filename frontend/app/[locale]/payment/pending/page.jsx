import Link from "next/link";
import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import PaymentOrderLink from "@/components/store/payment/PaymentOrderLink";
import PendingPaymentWatcher from "@/components/store/payment/PendingPaymentWatcher";
import { getNavigationData } from "@/lib/api";
import { resolveServerRegion } from "@/lib/regionResolver";
import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront";

export default async function PaymentPendingPage({ params, searchParams }) {
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
          <div className="payment-page-icon pending" aria-hidden="true" style={{ fontSize: "2rem" }}>⏳</div>

          <div>
            <h1>{isAr ? "جارٍ معالجة الدفع" : "Processing Payment"}</h1>
            <p style={{ marginTop: "8px" }}>
              {isAr
                ? "دفعتك قيد المعالجة. يُرجى الانتظار ولا تغلق الصفحة."
                : "Your payment is being processed. Please wait and do not close this page."}
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
              ? "ستتلقى تأكيداً بالبريد الإلكتروني أو الرسائل النصية بمجرد اكتمال الدفع."
              : "You will receive a confirmation via email or SMS once the payment is complete."}
          </p>
          {orderNumber ? (
            <PendingPaymentWatcher
              locale={locale}
              region={region}
              orderNumber={orderNumber}
              lookupToken={lookupToken}
              emailOrPhone={emailOrPhone}
              isAr={isAr}
            />
          ) : null}

          <div className="payment-page-actions">
            {orderNumber ? (
              <PaymentOrderLink
                href={buildStorePath(locale, `/thank-you/${orderNumber}`, region)}
                orderNumber={orderNumber}
                lookupToken={lookupToken}
                emailOrPhone={emailOrPhone}
                className="primary-action"
              >
                {isAr ? "عرض الطلب" : "View Order"}
              </PaymentOrderLink>
            ) : null}
            <Link href={buildStorePath(locale, "/track-order", region)} className="secondary-action">
              {isAr ? "تتبع الطلب" : "Track Order"}
            </Link>
          </div>
        </div>
      </section>
    </StorefrontShell>
  );
}
