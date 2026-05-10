"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useStore } from "@/components/store/cart/StoreProvider";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

const PAYMENT_METHODS = [
  {
    value: "cod",
    label: "Cash on Delivery",
    labelAr: "الدفع عند الاستلام",
    description: "Pay when your order arrives at your door",
    descriptionAr: "ادفع عند وصول طلبك",
  },
  {
    value: "online",
    label: "Pay Online",
    labelAr: "الدفع الإلكتروني",
    description: "Secure card payment via Paymob",
    descriptionAr: "دفع آمن بالبطاقة عبر Paymob",
    badge: "Secure",
  },
  {
    value: "whatsapp",
    label: "WhatsApp Confirmation",
    labelAr: "تأكيد عبر واتساب",
    description: "Place order and confirm via WhatsApp",
    descriptionAr: "اطلب وأكد عبر واتساب",
  },
  {
    value: "bank_transfer",
    label: "Bank Transfer",
    labelAr: "تحويل بنكي",
    description: "Transfer to our bank account — details sent after order",
    descriptionAr: "حوّل إلى حسابنا البنكي — التفاصيل تُرسل بعد الطلب",
  },
];

function getCountryName(region) {
  if (region === "ae" || region === "uae") return "United Arab Emirates";
  if (region === "sa") return "Saudi Arabia";
  return "Oman";
}

export default function CheckoutClient({ locale, region }) {
  const router = useRouter();
  const t = uiText(locale);
  const { cartItems, subtotal, clearCart } = useStore();
  const isAr = locale === "ar";

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    country: getCountryName(region),
    coupon_code: "",
    notes: "",
    payment_method: "cod",
  });

  const [submitting, setSubmitting] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponPreview, setCouponPreview] = useState(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((current) => ({ ...current, country: getCountryName(region) }));
  }, [region]);

  const summaryPricing = useMemo(() => {
    if (!cartItems[0]) return null;
    return { ...cartItems[0].pricing, amount: subtotal, prefix: "" };
  }, [cartItems, subtotal]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (name === "coupon_code") {
      setCouponPreview(null);
      setCouponMessage("");
    }
  }

  function setPaymentMethod(value) {
    setForm((current) => ({ ...current, payment_method: value }));
  }

  function checkoutItemsPayload() {
    return cartItems.map((item) => ({
      slug: item.slug,
      quantity: item.quantity,
      selected_options_text: item.selectedOptionsText || "",
    }));
  }

  function previewMoney(amount) {
    return formatMoney(
      {
        ...(summaryPricing || {}),
        amount: Number(amount || 0),
        currency_code: couponPreview?.currency_code || summaryPricing?.currency_code,
        region_code: summaryPricing?.region_code || region,
        prefix: "",
      },
      locale,
    );
  }

  async function validateCouponCode() {
    const couponCode = form.coupon_code.trim();
    if (!couponCode) {
      setCouponPreview(null);
      setCouponMessage("");
      return true;
    }
    if (!cartItems.length) {
      setCouponMessage("Add products before applying a coupon.");
      return false;
    }
    setValidatingCoupon(true);
    setCouponMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/coupons/validate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region, coupon_code: couponCode, items: checkoutItemsPayload() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));
      if (!data.valid) {
        setCouponPreview(null);
        setCouponMessage(data.error || data.message || "Coupon is not valid.");
        return false;
      }
      setCouponPreview(data);
      setCouponMessage(data.message || "Coupon applied.");
      return true;
    } catch (err) {
      setCouponPreview(null);
      setCouponMessage(err.message || "Unable to validate coupon.");
      return false;
    } finally {
      setValidatingCoupon(false);
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    setError("");
    if (!cartItems.length) {
      setError("Your cart is empty.");
      return;
    }
    setSubmitting(true);
    try {
      const couponIsValid = await validateCouponCode();
      if (!couponIsValid) {
        setSubmitting(false);
        return;
      }

      const payload = {
        region,
        locale,
        customer: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          address_line_1: form.address_line_1,
          address_line_2: form.address_line_2,
          city: form.city,
          country: form.country,
        },
        payment_method: form.payment_method,
        coupon_code: form.coupon_code,
        notes: form.notes,
        items: checkoutItemsPayload(),
      };

      const response = await fetch(`${API_BASE_URL}/checkout/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));

      clearCart();

      if (form.payment_method === "online") {
        const payRes = await fetch(`${API_BASE_URL}/payments/initiate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_number: data.order_number }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.error || "Payment initiation failed. Please try again.");
        window.location.href = payData.iframe_url;
        return;
      }

      const contact = encodeURIComponent(form.email || form.phone);
      router.push(`${buildStorePath(locale, `/thank-you/${data.order_number}`, region)}&email_or_phone=${contact}`);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = useMemo(() => {
    if (submitting) {
      if (form.payment_method === "online") return isAr ? "جارٍ التحضير..." : "Preparing payment...";
      return isAr ? "جارٍ تقديم الطلب..." : "Placing order...";
    }
    if (form.payment_method === "online") return isAr ? "المتابعة للدفع" : "Continue to Payment";
    return isAr ? "تقديم الطلب" : "Place Order";
  }, [submitting, form.payment_method, isAr]);

  return (
    <section className="checkout-page section-shell">
      <div className="section-heading">
        <div>
          <p style={{ margin: "0 0 4px", color: "var(--text-soft)", fontSize: "0.9rem" }}>{t.cart}</p>
          <h1 style={{ margin: 0, fontSize: "clamp(1.8rem, 3vw, 2.6rem)", letterSpacing: "-0.04em" }}>
            {t.checkout}
          </h1>
        </div>
      </div>

      {cartItems.length === 0 ? (
        <div className="empty-checkout-card">
          <h2>{isAr ? "سلة التسوق فارغة" : "Your cart is empty"}</h2>
          <p>{isAr ? "أضف منتجات قبل الدفع." : "Add some products before checkout."}</p>
          <a href={buildStorePath(locale, "/collections", region)} className="primary-action">
            {isAr ? "متابعة التسوق" : "Continue Shopping"}
          </a>
        </div>
      ) : (
        <div className="checkout-grid">
          <form className="checkout-form" onSubmit={submitOrder}>
            {/* Customer details */}
            <div className="form-card">
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 750 }}>
                {isAr ? "بيانات العميل" : "Customer Details"}
              </h2>

              <label>
                {isAr ? "الاسم الكامل *" : "Full name *"}
                <input name="name" value={form.name} onChange={updateField} required autoComplete="name" />
              </label>

              <label>
                {isAr ? "البريد الإلكتروني" : "Email"}
                <input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" />
              </label>

              <label>
                {isAr ? "رقم الهاتف *" : "Phone *"}
                <input name="phone" type="tel" value={form.phone} onChange={updateField} required autoComplete="tel" />
              </label>

              <label>
                {isAr ? "العنوان *" : "Address line 1 *"}
                <input
                  name="address_line_1"
                  value={form.address_line_1}
                  onChange={updateField}
                  required
                  autoComplete="address-line1"
                />
              </label>

              <label>
                {isAr ? "تفاصيل إضافية" : "Address line 2"}
                <input
                  name="address_line_2"
                  value={form.address_line_2}
                  onChange={updateField}
                  autoComplete="address-line2"
                />
              </label>

              <div className="form-row">
                <label>
                  {isAr ? "المدينة *" : "City *"}
                  <input name="city" value={form.city} onChange={updateField} required autoComplete="address-level2" />
                </label>
                <label>
                  {isAr ? "البلد *" : "Country *"}
                  <input name="country" value={form.country} onChange={updateField} required autoComplete="country-name" />
                </label>
              </div>

              {/* Coupon */}
              <div className="coupon-field">
                <label htmlFor="coupon_code">{isAr ? "كود الخصم" : "Coupon code"}</label>
                <div className="coupon-row">
                  <input
                    id="coupon_code"
                    name="coupon_code"
                    value={form.coupon_code}
                    onChange={updateField}
                    placeholder={isAr ? "أدخل كود الخصم" : "Enter coupon code"}
                  />
                  <button type="button" onClick={validateCouponCode} disabled={validatingCoupon}>
                    {validatingCoupon ? "..." : isAr ? "تطبيق" : "Apply"}
                  </button>
                </div>
                {couponMessage ? (
                  <p className={couponPreview?.valid ? "form-success" : "form-error"} style={{ margin: 0 }}>
                    {couponMessage}
                  </p>
                ) : null}
              </div>

              {/* Notes */}
              <label>
                {isAr ? "ملاحظات" : "Notes"}
                <textarea name="notes" value={form.notes} onChange={updateField} rows={3} />
              </label>
            </div>

            {/* Payment method */}
            <div className="form-card">
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 750 }}>
                {isAr ? "طريقة الدفع" : "Payment Method"}
              </h2>
              <div className="payment-method-list">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    className={`payment-method-card ${form.payment_method === method.value ? "is-selected" : ""}`}
                    onClick={() => setPaymentMethod(method.value)}
                  >
                    <span className="payment-method-dot" aria-hidden="true" />
                    <span className="payment-method-info">
                      <strong>{isAr ? method.labelAr : method.label}</strong>
                      <span>{isAr ? method.descriptionAr : method.description}</span>
                      {method.badge ? (
                        <span className="payment-method-tag">{method.badge}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>

              {form.payment_method === "online" ? (
                <p className="payment-online-note">
                  {isAr
                    ? "ستُحوَّل إلى صفحة الدفع الآمنة بعد تأكيد الطلب."
                    : "You will be redirected to the secure Paymob payment page after your order is confirmed."}
                </p>
              ) : null}

              {error ? <p className="form-error">{error}</p> : null}

              <button
                type="submit"
                className="primary-action full-width"
                disabled={submitting || cartItems.length === 0}
                style={{ minHeight: "52px", fontSize: "1rem" }}
              >
                {submitting ? <span className="btn-spinner" /> : null}
                {submitLabel}
              </button>
            </div>
          </form>

          {/* Order summary */}
          <aside className="order-summary-card">
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 750 }}>
              {isAr ? "ملخص الطلب" : "Order Summary"}
            </h2>

            <div className="summary-lines">
              {cartItems.map((item) => (
                <div key={item.lineId} className="summary-line">
                  <img src={item.image} alt={item.name} />
                  <div>
                    <strong>{item.name}</strong>
                    {item.selectedOptionsText ? <span>{item.selectedOptionsText}</span> : null}
                    <small>{isAr ? `الكمية: ${item.quantity}` : `Qty: ${item.quantity}`}</small>
                  </div>
                  <b>
                    {formatMoney(
                      { ...item.pricing, amount: item.pricing.amount * item.quantity, prefix: "" },
                      locale,
                    )}
                  </b>
                </div>
              ))}
            </div>

            <div className="subtotal-row">
              <span>{t.subtotal}</span>
              <strong>{formatMoney(summaryPricing, locale)}</strong>
            </div>

            {couponPreview?.valid ? (
              <>
                <div className="subtotal-row">
                  <span>{isAr ? "الخصم" : "Discount"}</span>
                  <strong style={{ color: "var(--success)" }}>
                    -{previewMoney(couponPreview.discount_amount)}
                  </strong>
                </div>
                <div className="subtotal-row">
                  <span>{t.shipping}</span>
                  <strong>
                    {Number(couponPreview.shipping_amount) > 0
                      ? previewMoney(couponPreview.shipping_amount)
                      : isAr ? "مجاناً" : "Free"}
                  </strong>
                </div>
                <div className="subtotal-row order-grand-total">
                  <span>{isAr ? "الإجمالي" : "Total"}</span>
                  <strong>{previewMoney(couponPreview.final_total)}</strong>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, color: "var(--text-soft)", fontSize: "0.9rem" }}>
                {t.shipping}
              </p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
