"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { buildStorePath } from "@/lib/storefront";
import { API_BASE_URL } from "@/lib/config";
import { saveOrderLookupToken } from "@/lib/orderLookupToken";

export default function TrackOrderClient({ locale, region }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState("");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [lookupToken, setLookupToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill from order confirmation email link: /track-order?o=EO-...&t=TOKEN
  useEffect(() => {
    if (!searchParams) return;
    const o = searchParams.get("o") || searchParams.get("order_number") || searchParams.get("order") || "";
    const t = searchParams.get("t") || searchParams.get("lookup_token") || searchParams.get("token") || "";
    const contact = searchParams.get("email_or_phone") || "";
    if (o) setOrderNumber(o);
    if (t) setLookupToken(t);
    if (contact) setEmailOrPhone(contact);

    // If both are present, look the order up immediately so the user lands on
    // their order detail without re-typing anything.
    if (o && t) {
      void lookupWithToken(o, t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookupWithToken(o, t) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/orders/lookup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_number: o, lookup_token: t, region }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Order not found.");
      }
      saveOrderLookupToken(data.order_number, t);
      router.push(
        `${buildStorePath(locale, `/thank-you/${data.order_number}`, region)}&t=${encodeURIComponent(t)}`,
      );
    } catch (err) {
      setError(err.message || "Order not found.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitHandler(event) {
    event.preventDefault();

    const cleanOrderNumber = orderNumber.trim();
    const cleanEmailOrPhone = emailOrPhone.trim();
    const cleanToken = lookupToken.trim();

    if (!cleanOrderNumber) return;
    if (!cleanToken && !cleanEmailOrPhone) return;

    setSubmitting(true);
    setError("");

    try {
      const body = { order_number: cleanOrderNumber, region };
      if (cleanToken) body.lookup_token = cleanToken;
      if (cleanEmailOrPhone) body.email_or_phone = cleanEmailOrPhone;

      const response = await fetch(`${API_BASE_URL}/orders/lookup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Order not found.");
      }
      if (cleanToken) {
        saveOrderLookupToken(data.order_number, cleanToken);
      }

      const suffix = cleanToken
        ? `&t=${encodeURIComponent(cleanToken)}`
        : `&email_or_phone=${encodeURIComponent(cleanEmailOrPhone)}`;
      router.push(`${buildStorePath(locale, `/thank-you/${data.order_number}`, region)}${suffix}`);
    } catch (err) {
      setError(err.message || "Order not found.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section-shell track-order-page">
      <div className="section-heading">
        <p>Track</p>
        <h1>Track your order</h1>
      </div>

      <form className="track-order-card" onSubmit={submitHandler}>
        <label>
          Order number
          <input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="Example: EO-20260426-0001"
            className="field-ltr"
            required
            pattern="EO-\d{8}-\d{4}"
            title="Order numbers look like EO-20260426-0001"
            maxLength={24}
          />
        </label>

        <label>
          Email or phone
          <input
            value={emailOrPhone}
            onChange={(event) => setEmailOrPhone(event.target.value)}
            placeholder="Use the same email or phone from checkout"
            className="field-ltr"
            maxLength={120}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button type="submit" className="primary-action full-width" disabled={submitting}>
          {submitting ? "Checking..." : "Track order"}
        </button>
      </form>
    </section>
  );
}
