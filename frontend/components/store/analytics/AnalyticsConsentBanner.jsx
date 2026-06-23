"use client";

import { useEffect, useState } from "react";

import {
  ANALYTICS_CONSENT_EVENT,
  CONSENT_STATES,
  getConsentState,
  setConsentState,
} from "@/lib/analytics";

const COPY = {
  en: {
    title: "Cookie and Marketing Preferences",
    body: "We use analytics and marketing tags to improve your shopping experience. You can update this later in browser settings.",
    accept: "Accept",
    decline: "Decline",
  },
  ar: {
    title: "تفضيلات ملفات الارتباط والتسويق",
    body: "نستخدم أدوات التحليلات والتسويق لتحسين تجربة التسوق. يمكنك تغيير ذلك لاحقاً من إعدادات المتصفح.",
    accept: "قبول",
    decline: "رفض",
  },
};

export default function AnalyticsConsentBanner({ locale = "en" }) {
  const isAr = locale === "ar";
  const [consentState, setLocalConsentState] = useState(CONSENT_STATES.UNSET);

  useEffect(() => {
    setLocalConsentState(getConsentState());
    const syncState = () => setLocalConsentState(getConsentState());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, syncState);
    window.addEventListener("storage", syncState);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, syncState);
      window.removeEventListener("storage", syncState);
    };
  }, []);

  if (consentState !== CONSENT_STATES.UNSET) {
    return null;
  }

  const text = isAr ? COPY.ar : COPY.en;

  return (
    <div className="consent-banner" dir={isAr ? "rtl" : "ltr"} role="dialog" aria-modal="true" aria-labelledby="consent-banner-title" aria-live="polite">
      <div className="consent-banner-content">
        <strong id="consent-banner-title">{text.title}</strong>
        <p>{text.body}</p>
      </div>
      <div className="consent-banner-actions">
        <button
          type="button"
          className="secondary-action"
          onClick={() => setConsentState(CONSENT_STATES.DENIED)}
        >
          {text.decline}
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => setConsentState(CONSENT_STATES.GRANTED)}
        >
          {text.accept}
        </button>
      </div>
    </div>
  );
}

