"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { buildStorePath } from "@/lib/storefront";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

export default function TrackOrderClient({ locale, region }) {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitHandler(event) {
    event.preventDefault();

    const cleanOrderNumber = orderNumber.trim();
    const cleanEmailOrPhone = emailOrPhone.trim();

    if (!cleanOrderNumber || !cleanEmailOrPhone) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/orders/lookup/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_number: cleanOrderNumber,
          email_or_phone: cleanEmailOrPhone,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Order not found.");
      }

      router.push(`${buildStorePath(locale, `/thank-you/${data.order_number}`, region)}&email_or_phone=${encodeURIComponent(cleanEmailOrPhone)}`);
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
            required
          />
        </label>

        <label>
          Email or phone
          <input
            value={emailOrPhone}
            onChange={(event) => setEmailOrPhone(event.target.value)}
            placeholder="Use the same email or phone from checkout"
            required
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
