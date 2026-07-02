"use client";

import { useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "@/lib/config";

const DISCOUNT_POPUP_SESSION_KEY = "enfant-discount-popup-dismissed";

// Only the markets this storefront ships to — kept in sync with the backend
// allowlist in backend/store/api_serializers/account.py (NEWSLETTER_COUNTRY_REGION).
const COUNTRY_OPTIONS = [
  { code: "+968", region: "om", labelEn: "Oman", labelAr: "عُمان" },
  { code: "+971", region: "ae", labelEn: "UAE", labelAr: "الإمارات" },
  { code: "+966", region: "sa", labelEn: "Saudi Arabia", labelAr: "السعودية" },
];

function defaultCountryForRegion(region) {
  return COUNTRY_OPTIONS.find((option) => option.region === region) || COUNTRY_OPTIONS[0];
}

// Mirrors the server-side patterns — this is a UX shortcut only; the backend
// re-validates and is the source of truth (see account.py NEWSLETTER_PHONE_PATTERNS).
const PHONE_RULES = {
  "+968": /^[1-9]\d{7}$/, // Oman mobile: 8 digits
  "+971": /^5\d{8}$/, // UAE mobile: 9 digits, starts with 5
  "+966": /^5\d{8}$/, // KSA mobile: 9 digits, starts with 5
};

export default function DiscountPopup({ locale = "en", navigation }) {
  const settings = navigation?.settings?.discount_popup || {};
  const region = navigation?.current_region?.code || "om";
  const enabled = settings.enabled !== false;
  const text = settings.text || "Enter Phone Number to get exclusive discount updates at very first";
  const image = settings.image || "/enfant/hero-gift-box-offer-v2.jpg";
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [countryCode, setCountryCode] = useState(() => defaultCountryForRegion(region).code);
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

  const cleanedDigits = useMemo(() => phone.replace(/\D/g, ""), [phone]);

  function isValidPhone() {
    const rule = PHONE_RULES[countryCode];
    if (!rule) return false;
    const digits = cleanedDigits.startsWith("0") ? cleanedDigits.replace(/^0+/, "") : cleanedDigits;
    return rule.test(digits);
  }

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
    if (!isValidPhone()) {
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
          phone: cleanedDigits,
          country_code: countryCode,
          locale,
          source: "discount_popup",
          page_path: window.location.pathname,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const fieldError = data?.phone?.[0] || data?.country_code?.[0] || data?.detail;
        throw new Error(fieldError || "Unable to save phone lead");
      }
      setStatus({
        type: "success",
        message: isAr ? "تم الاشتراك بنجاح." : "You’re on the list.",
      });
      markDismissedForSession();
      window.setTimeout(() => setOpen(false), 900);
    } catch (err) {
      setStatus({
        type: "error",
        message: err?.message && err.message !== "Unable to save phone lead"
          ? err.message
          : (isAr ? "تعذر الحفظ الآن. حاولي مرة أخرى." : "Could not save it. Please try again."),
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
            <div className="discount-popup-phone-row field-ltr">
              <select
                className="discount-popup-country"
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                aria-label={isAr ? "رمز الدولة" : "Country code"}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {(isAr ? option.labelAr : option.labelEn)} {option.code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={isAr ? "رقم الهاتف" : "Phone number"}
                autoComplete="tel"
                inputMode="numeric"
                required
              />
            </div>
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
