"use client";

import { useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";

export default function NewsletterForm({ placeholder, cta, locale, region }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/newsletter/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), locale, region }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 400 && data.email) {
          setStatus({ type: "error", message: "This email is already subscribed." });
        } else {
          setStatus({ type: "error", message: "Something went wrong. Please try again." });
        }
        return;
      }

      setStatus({ type: "success", message: locale === "ar" ? "شكراً للاشتراك!" : "Thank you for subscribing!" });
      setEmail("");
    } catch {
      setStatus({ type: "error", message: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="newsletter-form" onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={placeholder}
        required
        aria-label={placeholder}
      />
      <button type="submit" disabled={submitting || !email.trim()}>
        {submitting ? (locale === "ar" ? "..." : "Subscribing...") : cta}
      </button>
      {status ? (
        <p className={status.type === "success" ? "form-success" : "form-error"} style={{ margin: 0 }}>
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
