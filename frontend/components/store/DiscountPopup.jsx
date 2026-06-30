"use client";

import { useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "@/lib/config";

const DISCOUNT_POPUP_SESSION_KEY = "enfant-discount-popup-dismissed";

export default function DiscountPopup({ locale = "en", navigation }) {
  const settings = navigation?.settings?.discount_popup || {};
  const region = navigation?.current_region?.code || "om";
  const enabled = settings.enabled !== false;
  const text = settings.text || "Enter Phone Number to get exclusive discount updates at very first";
  const image = settings.image || "/enfant/hero-gift-box-offer-v2.jpg";
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    try {
      if (window.sessionStorage.getItem(DISCOUNT_POPUP_SESSION_KEY) === "1") {
        return undefined;
      }
    } catch {
      // If storage is unavailable, keep the popup functional for this visit.
    }
    const timer = window.setTimeout(() => setOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  const cleanedPhone = useMemo(() => phone.replace(/[^\d+]/g, "").trim(), [phone]);

  function markDismissedForSession() {
    try {
      window.sessionStorage.setItem(DISCOUNT_POPUP_SESSION_KEY, "1");
    } catch {
      // Storage can be blocked in private browsing; closing should still work.
    }
  }

  function closePopup() {
    markDismissedForSession();
    setOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (cleanedPhone.replace(/\D/g, "").length < 7) {
      setStatus({ type: "error", message: isAr ? "أدخلي رقم هاتف صحيح." : "Enter a valid phone number." });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE_URL}/newsletter/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanedPhone,
          locale,
          region,
          source: "discount_popup",
        }),
      });
      if (!response.ok) {
        throw new Error("Unable to save phone lead");
      }
      setStatus({
        type: "success",
        message: isAr ? "تم الاشتراك بنجاح." : "You’re on the list.",
      });
      markDismissedForSession();
      window.setTimeout(() => setOpen(false), 900);
    } catch {
      setStatus({
        type: "error",
        message: isAr ? "تعذر الحفظ الآن. حاولي مرة أخرى." : "Could not save it. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!enabled || !open) return null;

  return (
    <div className="discount-popup-backdrop" role="presentation">
      <section className="discount-popup" role="dialog" aria-modal="true" aria-label={isAr ? "تحديثات الخصومات" : "Discount updates"}>
        <button
          type="button"
          className="discount-popup-close"
          onClick={closePopup}
          aria-label={isAr ? "إغلاق" : "Close"}
        >
          ×
        </button>
        <div className="discount-popup-copy">
          <p>{text}</p>
          <form className="discount-popup-form" onSubmit={handleSubmit}>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={isAr ? "رقم الهاتف" : "Phone number"}
              autoComplete="tel"
              className="field-ltr"
              required
            />
            <button type="submit" disabled={submitting || !phone.trim()}>
              {submitting ? (isAr ? "..." : "Saving...") : (isAr ? "اشترك" : "Subscribe")}
            </button>
          </form>
          {status ? <span className={`discount-popup-status is-${status.type}`}>{status.message}</span> : null}
        </div>
        <div className="discount-popup-media">
          <img src={image} alt="" loading="lazy" />
        </div>
      </section>
    </div>
  );
}
