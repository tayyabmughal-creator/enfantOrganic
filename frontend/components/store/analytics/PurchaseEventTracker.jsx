"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ANALYTICS_CONSENT_EVENT,
  buildAnalyticsItems,
  CONSENT_STATES,
  getConsentState,
  hasPurchaseEventFired,
  markPurchaseEventFired,
  pushDataLayerEvent,
} from "@/lib/analytics";
import { fbqTrack } from "@/components/store/analytics/AnalyticsScripts";

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function PurchaseEventTracker({ order, locale, region }) {
  const [consentState, setConsentState] = useState(CONSENT_STATES.UNSET);

  useEffect(() => {
    setConsentState(getConsentState());
    const handleConsent = () => setConsentState(getConsentState());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    window.addEventListener("storage", handleConsent);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
      window.removeEventListener("storage", handleConsent);
    };
  }, []);

  const payload = useMemo(() => {
    if (!order) {
      return null;
    }
    const items = buildAnalyticsItems(order.items || []);
    return {
      transaction_id: order.order_number,
      affiliation: "Enfant Organic",
      currency: order.currency_code || "",
      value: asNumber(order.grand_total),
      tax: asNumber(order.tax_total),
      shipping: asNumber(order.shipping_total),
      coupon: order.coupon_code || undefined,
      items,
    };
  }, [order]);

  useEffect(() => {
    if (!order?.order_number || !payload) {
      return;
    }
    if (hasPurchaseEventFired(order.order_number)) {
      return;
    }
    // fbq Purchase fires unconditionally (no consent gate for GCC markets).
    // eventID enables server-side Conversions API deduplication.
    // currency uses region-native code so Meta attributes to the correct campaign.
    const regionCurrency = region === "ae" ? "AED" : region === "sa" ? "SAR" : payload.currency;
    const eventID = `purchase-${order.order_number}`;
    fbqTrack("Purchase", {
      value: payload.value,
      currency: regionCurrency || payload.currency,
      content_ids: (payload.items || []).map((i) => i.item_id),
      content_type: "product",
      num_items: (payload.items || []).reduce((s, i) => s + (i.quantity || 1), 0),
      event_id: eventID,
    });
    // GA4/GTM purchase requires consent.
    if (consentState === CONSENT_STATES.GRANTED) {
      pushDataLayerEvent("purchase", { ecommerce: payload, locale, region });
    }
    markPurchaseEventFired(order.order_number);
  }, [consentState, locale, order?.order_number, payload, region]);

  return null;
}

