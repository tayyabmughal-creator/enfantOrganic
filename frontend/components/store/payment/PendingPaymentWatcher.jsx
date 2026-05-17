"use client";

import { useEffect, useMemo, useState } from "react";

import { buildStorePath } from "@/lib/storefront";
import { API_BASE_URL, safeRedirectUrl } from "@/lib/config";

const FINAL_PROVIDER_STATUSES = new Set(["paid", "failed", "cancelled", "refunded"]);

export default function PendingPaymentWatcher({
  locale,
  region,
  orderNumber,
  lookupToken = "",
  emailOrPhone = "",
  isAr = false,
}) {
  const [message, setMessage] = useState(
    isAr ? "نحن نتحقق من حالة الدفع..." : "We are checking your payment status...",
  );

  const successUrl = useMemo(() => {
    const params = new URLSearchParams({ order_number: orderNumber });
    if (lookupToken) {
      params.set("lookup_token", lookupToken);
    } else if (emailOrPhone) {
      params.set("email_or_phone", emailOrPhone);
    }
    return `${buildStorePath(locale, "/payment/success", region)}&${params.toString()}`;
  }, [emailOrPhone, locale, lookupToken, orderNumber, region]);
  const failedUrl = useMemo(() => {
    const params = new URLSearchParams({ order_number: orderNumber });
    if (lookupToken) {
      params.set("lookup_token", lookupToken);
    } else if (emailOrPhone) {
      params.set("email_or_phone", emailOrPhone);
    }
    return `${buildStorePath(locale, "/payment/failed", region)}&${params.toString()}`;
  }, [emailOrPhone, locale, lookupToken, orderNumber, region]);

  useEffect(() => {
    if (!orderNumber) return undefined;
    let isStopped = false;
    let attempts = 0;

    const navigate = (target) => {
      const safe = safeRedirectUrl(target);
      if (safe) {
        window.location.href = safe;
      }
    };

    const poll = async () => {
      if (isStopped) return;
      attempts += 1;
      try {
        const response = await fetch(`${API_BASE_URL}/payments/status/${encodeURIComponent(orderNumber)}/`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        const data = await response.json();
        const paymentStatus = String(data?.payment_status || "").toLowerCase();
        const providerStatus = String(data?.provider_status?.status || "").toLowerCase();

        if (paymentStatus === "paid" || providerStatus === "paid") {
          navigate(successUrl);
          return;
        }

        if (paymentStatus === "refunded" || providerStatus === "refunded") {
          navigate(failedUrl);
          return;
        }

        if (FINAL_PROVIDER_STATUSES.has(providerStatus) && providerStatus !== "paid") {
          navigate(failedUrl);
          return;
        }

        if (attempts % 3 === 0) {
          setMessage(
            isAr
              ? "ما زلنا بانتظار تأكيد بوابة الدفع..."
              : "Still waiting for the gateway confirmation...",
          );
        }
      } catch {
        if (attempts % 3 === 0) {
          setMessage(
            isAr
              ? "تعذر جلب حالة الدفع حالياً، سنحاول مجدداً."
              : "Unable to fetch payment status right now, retrying...",
          );
        }
      }
    };

    poll();
    const interval = window.setInterval(poll, 4000);
    const timeout = window.setTimeout(() => {
      isStopped = true;
      window.clearInterval(interval);
      setMessage(
        isAr
          ? "استغرق التحقق وقتاً أطول من المتوقع. يمكنك إعادة المحاولة أو تتبع الطلب."
          : "Verification is taking longer than expected. You can retry payment or track your order.",
      );
    }, 120000);

    return () => {
      isStopped = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [failedUrl, isAr, orderNumber, successUrl]);

  return <p style={{ fontSize: "0.9rem", margin: 0 }}>{message}</p>;
}
