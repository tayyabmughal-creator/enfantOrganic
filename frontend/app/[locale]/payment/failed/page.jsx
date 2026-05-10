import Link from "next/link";
import { notFound } from "next/navigation";

import StorefrontShell from "@/components/layout/StorefrontShell";
import { getNavigationData } from "@/lib/api";
import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront";

export default async function PaymentFailedPage({ params, searchParams }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  if (localeParam !== locale) notFound();

  const resolvedSearchParams = await searchParams;
  const region = normalizeRegion(resolvedSearchParams?.region || "om");
  const orderNumber = resolvedSearchParams?.merchant_order_id || resolvedSearchParams?.order_number || "";
  const navigation = await getNavigationData(locale, region);
  const isAr = locale === "ar";

  return (
    <StorefrontShell locale={locale} navigation={navigation}>
      <section className="section-shell">
        <div className="payment-page-card">
          <div className="payment-page-icon failed" aria-hidden="true">✕</div>

          <div>
            <h1>{isAr ? "فشلت عملية الدفع" : "Payment Failed"}</h1>
            <p style={{ marginTop: "8px" }}>
              {isAr
                ? "لم تتم عملية الدفع. يُرجى المحاولة مرة أخرى أو اختيار طريقة دفع مختلفة."
                : "Your payment could not be processed. Please try again or choose a different payment method."}
            </p>
          </div>

          {orderNumber ? (
            <div
              style={{
                padding: "14px 18px",
                borderRadius: "14px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
              }}
            >
              <p style={{ margin: "0 0 4px", fontSize: "0.84rem", color: "#991b1b", fontWeight: 700 }}>
                {isAr ? "رقم الطلب" : "Order number"}
              </p>
              <strong style={{ fontFamily: "monospace", fontSize: "1.1rem", letterSpacing: "0.04em" }}>
                {orderNumber}
              </strong>
            </div>
          ) : null}

          <p style={{ fontSize: "0.9rem" }}>
            {isAr
              ? "طلبك محفوظ. يمكنك إعادة محاولة الدفع أو اختيار طريقة دفع أخرى."
              : "Your order is saved. You can retry payment or contact us for assistance."}
          </p>

          <div className="payment-page-actions">
            <Link href={buildStorePath(locale, "/checkout", region)} className="primary-action">
              {isAr ? "إعادة المحاولة" : "Try Again"}
            </Link>
            {orderNumber ? (
              <Link
                href={`${buildStorePath(locale, `/track-order`, region)}&order=${orderNumber}`}
                className="secondary-action"
              >
                {isAr ? "تتبع الطلب" : "Track Order"}
              </Link>
            ) : (
              <Link href={buildStorePath(locale, "/collections", region)} className="secondary-action">
                {isAr ? "متابعة التسوق" : "Continue Shopping"}
              </Link>
            )}
          </div>
        </div>
      </section>
    </StorefrontShell>
  );
}
