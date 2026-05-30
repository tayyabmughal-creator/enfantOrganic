"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import { useLocale } from "@/contexts/LocaleContext";
import { API_BASE_URL, safeRedirectUrl } from "@/lib/config";
import { buildStorePath, formatMoney, normalizeRegion, uiText } from "@/lib/storefront";
import { saveOrderLookupToken } from "@/lib/orderLookupToken";

const PAYMOB_APPLE_PAY_INTEGRATION_ID = process.env.NEXT_PUBLIC_PAYMOB_APPLE_PAY_INTEGRATION_ID || "";

const REGION_COUNTRY_NAMES = {
  om: "Oman",
  ae: "United Arab Emirates",
  sa: "Saudi Arabia",
};

function canUseApplePay() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.ApplePaySession && window.ApplePaySession.canMakePayments());
  } catch {
    return false;
  }
}

function CartApplePayButtonInner() {
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const region = normalizeRegion(searchParams.get("region") || "om");
  const isAr = locale === "ar";

  const { cartItems, subtotal, closeCart } = useStore();
  const [available, setAvailable] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address_line_1: "", area: "", city: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentRecovery, setPaymentRecovery] = useState(null);

  useEffect(() => {
    setAvailable(Boolean(PAYMOB_APPLE_PAY_INTEGRATION_ID) && canUseApplePay());
  }, []);

  const openModal = useCallback(() => {
    setError("");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setError("");
  }, []);

  const updateField = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      let createdOrderContext = null;
      if (submitting) return;
      setError("");
      setPaymentRecovery(null);
      setSubmitting(true);
      try {
        const checkoutPayload = {
          region,
          locale,
          customer: {
            name: form.name,
            phone: form.phone,
            address_line_1: form.address_line_1,
            area: form.area,
            city: form.city,
            country: REGION_COUNTRY_NAMES[region] || "Oman",
            email: "",
            sms_opt_in: false,
            whatsapp_opt_in: false,
            address_line_2: "",
            building: "",
            floor: "",
            apartment: "",
            landmark: "",
            postcode: "",
            lat: null,
            lng: null,
            place_id: "",
            formatted_address: "",
            location_notes: "",
          },
          payment_method: "online",
          coupon_code: "",
          notes: "",
          items: cartItems.map((item) => ({
            slug: item.slug,
            quantity: item.quantity,
            selected_options_text: item.selectedOptionsText || "",
          })),
        };

        const orderRes = await fetch(`${API_BASE_URL}/checkout/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(checkoutPayload),
        });
        const orderData = await orderRes.json();
        if (!orderRes.ok) {
          throw new Error(orderData.detail || (isAr ? "فشل إنشاء الطلب." : "Order creation failed."));
        }
        saveOrderLookupToken(orderData.order_number, orderData.lookup_token);
        createdOrderContext = {
          orderNumber: orderData.order_number,
          lookupToken: orderData.lookup_token || "",
          provider: "paymob",
        };

        const payRes = await fetch(`${API_BASE_URL}/payments/initiate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_number: orderData.order_number,
            region,
            lookup_token: orderData.lookup_token || "",
            provider: "paymob",
            payment_type: "apple_pay",
          }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) {
          setPaymentRecovery({
            orderNumber: orderData.order_number,
            lookupToken: orderData.lookup_token || "",
            provider: "paymob",
          });
          throw new Error(
            payData.error ||
              (isAr
                ? `تعذر بدء الدفع. تم حفظ الطلب ${orderData.order_number} ويمكنك إعادة المحاولة.`
                : `Unable to start payment. Order ${orderData.order_number} is saved and can be retried.`),
          );
        }

        const candidate = payData.redirect_url || payData.iframe_url || "";
        const safe = safeRedirectUrl(candidate);
        if (!safe) {
          setPaymentRecovery({
            orderNumber: orderData.order_number,
            lookupToken: orderData.lookup_token || "",
            provider: "paymob",
          });
          throw new Error(
            isAr
              ? `وجهة الدفع غير موثوقة. تم حفظ الطلب ${orderData.order_number} ويمكنك إعادة المحاولة.`
              : `Untrusted payment redirect. Order ${orderData.order_number} is saved and can be retried.`,
          );
        }

        closeModal();
        closeCart();
        window.location.href = safe;
      } catch (err) {
        if (createdOrderContext) {
          setPaymentRecovery(createdOrderContext);
        }
        const fallbackMessage = createdOrderContext
          ? (
            isAr
              ? `تعذر بدء الدفع. تم حفظ الطلب ${createdOrderContext.orderNumber} ويمكنك إعادة المحاولة.`
              : `Unable to start payment. Order ${createdOrderContext.orderNumber} is saved and can be retried.`
          )
          : (isAr ? "حدث خطأ غير متوقع." : "An unexpected error occurred.");
        setError(err.message || fallbackMessage);
      } finally {
        setSubmitting(false);
      }
    },
    [cartItems, closeCart, closeModal, form, isAr, locale, region, submitting],
  );

  if (!available || cartItems.length === 0) return null;

  const summaryPricing = cartItems[0]
    ? { ...cartItems[0].pricing, amount: subtotal, prefix: "" }
    : null;

  return (
    <>
      <button
        type="button"
        className="cart-apple-pay-button"
        onClick={openModal}
        aria-label={isAr ? "ادفع بـ Apple Pay" : "Pay with Apple Pay"}
      />

      {modalOpen ? (
        <>
          <button
            type="button"
            className="overlay is-open apple-pay-overlay"
            onClick={closeModal}
            aria-label={isAr ? "إغلاق" : "Close"}
          />
          <div className="apple-pay-quick-modal" role="dialog" aria-modal="true" aria-label={isAr ? "الدفع السريع" : "Quick Checkout"}>
            <div className="apple-pay-quick-panel">
              <div className="apple-pay-quick-header">
                <div className="apple-pay-quick-logo" aria-hidden="true" />
                <button
                  type="button"
                  className="icon-link"
                  onClick={closeModal}
                  aria-label={isAr ? "إغلاق" : "Close"}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>

              {summaryPricing ? (
                <div className="apple-pay-quick-total">
                  <span>{isAr ? "الإجمالي" : "Total"}</span>
                  <strong>{formatMoney(summaryPricing, locale)}</strong>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="apple-pay-quick-form" noValidate>
                <div className="apple-pay-quick-fields">
                  <label>
                    {isAr ? "الاسم الكامل *" : "Full name *"}
                    <input
                      name="name"
                      value={form.name}
                      onChange={updateField}
                      required
                      minLength={2}
                      maxLength={160}
                      placeholder={isAr ? "اسمك الكامل" : "Your full name"}
                      autoComplete="name"
                      disabled={submitting}
                    />
                  </label>
                  <label>
                    {isAr ? "رقم الهاتف *" : "Phone *"}
                    <input
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={updateField}
                      required
                      pattern="^\+?[0-9 ()\-]{8,32}$"
                      minLength={8}
                      maxLength={32}
                      placeholder="+968 1234 5678"
                      autoComplete="tel"
                      disabled={submitting}
                      dir="ltr"
                    />
                  </label>
                  <label>
                    {isAr ? "عنوان الشارع *" : "Street address *"}
                    <input
                      name="address_line_1"
                      value={form.address_line_1}
                      onChange={updateField}
                      required
                      maxLength={255}
                      placeholder={isAr ? "مثال: شارع السلطان قابوس" : "e.g. Sultan Qaboos Street"}
                      autoComplete="address-line1"
                      disabled={submitting}
                    />
                  </label>
                  <div className="apple-pay-quick-row">
                    <label>
                      {isAr ? "المنطقة *" : "Area *"}
                      <input
                        name="area"
                        value={form.area}
                        onChange={updateField}
                        required
                        maxLength={100}
                        placeholder={isAr ? "القرم" : "Al Qurum"}
                        disabled={submitting}
                      />
                    </label>
                    <label>
                      {isAr ? "المدينة *" : "City *"}
                      <input
                        name="city"
                        value={form.city}
                        onChange={updateField}
                        required
                        maxLength={100}
                        placeholder={isAr ? "مسقط" : "Muscat"}
                        autoComplete="address-level2"
                        disabled={submitting}
                      />
                    </label>
                  </div>
                </div>

                {error ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <p className="form-error" style={{ margin: 0, fontSize: "0.82rem" }}>
                      {error}
                    </p>
                    {paymentRecovery ? (
                      <a
                        href={`${buildStorePath(locale, "/payment/failed", region)}&order_number=${encodeURIComponent(paymentRecovery.orderNumber)}${paymentRecovery.lookupToken ? `&lookup_token=${encodeURIComponent(paymentRecovery.lookupToken)}` : ""}&provider=${encodeURIComponent(paymentRecovery.provider)}`}
                        className="secondary-action"
                      >
                        {isAr ? "إعادة محاولة الدفع" : "Retry Payment"}
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="cart-apple-pay-button cart-apple-pay-button--buy"
                  disabled={submitting}
                  aria-label={submitting ? (isAr ? "جارٍ المعالجة..." : "Processing...") : (isAr ? "ادفع بـ Apple Pay" : "Pay with Apple Pay")}
                />
              </form>

              <p className="apple-pay-quick-note">
                {isAr
                  ? "ستُحوَّل إلى صفحة الدفع الآمنة. تأكد من تفعيل Apple Pay على جهازك."
                  : "You will be redirected to the secure payment page. Make sure Apple Pay is set up on your device."}
              </p>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

export default function CartApplePayButton() {
  return (
    <Suspense fallback={null}>
      <CartApplePayButtonInner />
    </Suspense>
  );
}
