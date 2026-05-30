"use client";

import { useEffect } from "react";

import { useStore } from "@/components/store/cart/StoreProvider";
import { API_BASE_URL } from "@/lib/config";
import { readOrderLookupToken } from "@/lib/orderLookupToken";

const CLEARED_MARKER_PREFIX = "enfant-order-cart-cleared:";

function markerKey(orderNumber) {
  return `${CLEARED_MARKER_PREFIX}${String(orderNumber || "").trim()}`;
}

function isPaidStatus(payload) {
  const paymentStatus = String(payload?.payment_status || "").trim().toLowerCase();
  const providerStatus = String(payload?.provider_status?.status || "").trim().toLowerCase();
  return paymentStatus === "paid" || providerStatus === "paid";
}

export default function PaymentSuccessCartFinalizer({
  orderNumber = "",
  region = "om",
  lookupToken = "",
}) {
  const { clearCart } = useStore();

  useEffect(() => {
    const cleanOrderNumber = String(orderNumber || "").trim();
    if (!cleanOrderNumber) return;

    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(markerKey(cleanOrderNumber)) === "1") {
        return;
      }
    } catch {
      // Ignore storage read errors.
    }

    let cancelled = false;
    const effectiveToken = String(lookupToken || readOrderLookupToken(cleanOrderNumber) || "").trim();
    const params = new URLSearchParams({ region });
    if (effectiveToken) {
      params.set("lookup_token", effectiveToken);
    }

    const run = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/payments/status/${encodeURIComponent(cleanOrderNumber)}/?${params.toString()}`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!isPaidStatus(payload)) return;
        clearCart();
        try {
          window.localStorage.setItem(markerKey(cleanOrderNumber), "1");
        } catch {
          // Ignore storage write errors.
        }
      } catch {
        // Non-fatal: do not clear cart unless we can confirm paid status.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [clearCart, lookupToken, orderNumber, region]);

  return null;
}

