"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useStore } from "@/components/store/cart/StoreProvider";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

function getCountryName(region) {
  if (region === "ae") {
    return "United Arab Emirates";
  }

  if (region === "sa") {
    return "Saudi Arabia";
  }

  return "Oman";
}

export default function CheckoutClient({ locale, region }) {
  const router = useRouter();
  const t = uiText(locale);
  const { cartItems, subtotal, clearCart } = useStore();

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
    return {
      ...cartItems[0].pricing,
      amount: subtotal,
      prefix: "",
    };
  }, [cartItems, subtotal]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (name === "coupon_code") {
      setCouponPreview(null);
      setCouponMessage("");
    }
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          region,
          coupon_code: couponCode,
          items: checkoutItemsPayload(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || JSON.stringify(data));
      }

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || JSON.stringify(data));
      }

      clearCart();
      const contact = encodeURIComponent(form.email || form.phone);
      router.push(`${buildStorePath(locale, `/thank-you/${data.order_number}`, region)}&email_or_phone=${contact}`);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="checkout-page section-shell">
      <div className="section-heading">
        <p>{t.cart}</p>
        <h1>{t.checkout}</h1>
      </div>

      {cartItems.length === 0 ? (
        <div className="empty-checkout-card">
          <h2>Your cart is empty</h2>
          <p>Add some products before checkout.</p>
          <a href={buildStorePath(locale, "/collections", region)} className="primary-action">
            Continue shopping
          </a>
        </div>
      ) : (
        <div className="checkout-grid">
          <form className="checkout-form" onSubmit={submitOrder}>
            <div className="form-card">
              <h2>Customer details</h2>

              <label>
                Full name *
                <input name="name" value={form.name} onChange={updateField} required />
              </label>

              <label>
                Email
                <input name="email" type="email" value={form.email} onChange={updateField} />
              </label>

              <label>
                Phone *
                <input name="phone" value={form.phone} onChange={updateField} required />
              </label>

              <label>
                Address line 1 *
                <input
                  name="address_line_1"
                  value={form.address_line_1}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Address line 2
                <input
                  name="address_line_2"
                  value={form.address_line_2}
                  onChange={updateField}
                />
              </label>

              <div className="form-row">
                <label>
                  City *
                  <input name="city" value={form.city} onChange={updateField} required />
                </label>

                <label>
                  Country *
                  <input name="country" value={form.country} onChange={updateField} required />
                </label>
              </div>

              <div className="coupon-field">
                <label htmlFor="coupon_code">Coupon code</label>
                <div className="coupon-row">
                <input
                  id="coupon_code"
                  name="coupon_code"
                  value={form.coupon_code}
                  onChange={updateField}
                  placeholder="Enter coupon code"
                />
                  <button type="button" onClick={validateCouponCode} disabled={validatingCoupon}>
                    {validatingCoupon ? "Checking..." : "Apply"}
                  </button>
                </div>
                {couponMessage ? (
                  <p className={couponPreview?.valid ? "form-success" : "form-error"}>
                    {couponMessage}
                  </p>
                ) : null}
              </div>

              <label>
                Payment method
                <select name="payment_method" value={form.payment_method} onChange={updateField}>
                  <option value="cod">Cash on Delivery</option>
                  <option value="whatsapp">WhatsApp Confirmation</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </label>

              <label>
                Notes
                <textarea name="notes" value={form.notes} onChange={updateField} rows={4} />
              </label>

              {error ? <p className="form-error">{error}</p> : null}

              <button
                type="submit"
                className="primary-action full-width"
                disabled={submitting || cartItems.length === 0}
              >
                {submitting ? "Placing order..." : "Place order"}
              </button>
            </div>
          </form>

          <aside className="order-summary-card">
            <h2>Order summary</h2>

            <>
              <div className="summary-lines">
                {cartItems.map((item) => (
                  <div key={item.lineId} className="summary-line">
                    <img src={item.image} alt={item.name} />
                    <div>
                      <strong>{item.name}</strong>
                      {item.selectedOptionsText ? <span>{item.selectedOptionsText}</span> : null}
                      <small>Qty: {item.quantity}</small>
                    </div>
                    <b>
                      {formatMoney(
                        {
                          ...item.pricing,
                          amount: item.pricing.amount * item.quantity,
                          prefix: "",
                        },
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
                    <span>Discount</span>
                    <strong>-{previewMoney(couponPreview.discount_amount)}</strong>
                  </div>
                  <div className="subtotal-row">
                    <span>{t.shipping}</span>
                    <strong>
                      {Number(couponPreview.shipping_amount) > 0
                        ? previewMoney(couponPreview.shipping_amount)
                        : "Free"}
                    </strong>
                  </div>
                  <div className="subtotal-row order-grand-total">
                    <span>Total</span>
                    <strong>{previewMoney(couponPreview.final_total)}</strong>
                  </div>
                </>
              ) : (
                <p>{t.shipping}</p>
              )}
            </>
          </aside>
        </div>
      )}
    </section>
  );
}
