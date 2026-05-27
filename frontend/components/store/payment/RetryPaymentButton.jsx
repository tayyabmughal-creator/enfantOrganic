"use client";

import { useEffect, useState } from "react";

import { API_BASE_URL, safeRedirectUrl } from "@/lib/config";
import { readOrderLookupToken } from "@/lib/orderLookupToken";

export default function RetryPaymentButton({
  orderNumber,
  provider = "",
  region = "om",
  lookupToken = "",
  isAr = false,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [storedLookupToken, setStoredLookupToken] = useState("");
  const effectiveLookupToken = lookupToken || storedLookupToken;

  useEffect(() => {
    if (!lookupToken && orderNumber) {
      setStoredLookupToken(readOrderLookupToken(orderNumber));
    }
  }, [lookupToken, orderNumber]);

  async function retryPayment() {
    if (!orderNumber || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/payments/retry/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_number: orderNumber,
          region,
          lookup_token: effectiveLookupToken,
          ...(provider ? { provider } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.error ||
            (isAr ? "تعذرت إعادة محاولة الدفع حالياً." : "Unable to retry payment right now."),
        );
      }

      // Verify the redirect target is on our allowlist of trusted payment origins.
      // Refuses javascript:, data:, protocol-relative, and any third-party origin.
      const candidate = data.redirect_url || data.iframe_url || "";
      const safe = safeRedirectUrl(candidate);
      if (!safe) {
        throw new Error(
          isAr
            ? "وجهة الدفع غير موثوقة. يرجى التواصل مع الدعم."
            : "Untrusted payment redirect. Please contact support.",
        );
      }
      window.location.href = safe;
    } catch (err) {
      setError(err.message || (isAr ? "حدث خطأ أثناء إعادة المحاولة." : "Retry failed."));
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <button
        type="button"
        className="primary-action"
        disabled={loading}
        onClick={retryPayment}
      >
        {loading ? (isAr ? "جارٍ التحويل..." : "Redirecting...") : isAr ? "إعادة محاولة الدفع" : "Retry Payment"}
      </button>
      {error ? <p className="form-error" style={{ margin: 0 }}>{error}</p> : null}
    </div>
  );
}
