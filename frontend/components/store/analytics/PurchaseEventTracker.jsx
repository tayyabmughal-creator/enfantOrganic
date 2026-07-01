"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ANALYTICS_CONSENT_EVENT,
  buildAnalyticsItems,
  CONSENT_STATES,
  getConsentState,
  hasPurchaseEventFired,
  markPurchaseEventFired,
  pushDataLayerEvent,
} from "@/lib/analytics";
import { fbqTrack, snaptrTrack } from "@/components/store/analytics/AnalyticsScripts";

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function PurchaseEventTracker({ order, locale, region }) {
  const [consentState, setConsentState] = useState(CONSENT_STATES.UNSET);
  const firedRef = useRef(false);

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
    if (!order?.order_number || !payload) return;
    // firedRef: in-memory guard prevents double-fire within the same component
    // lifecycle (e.g. consentState change re-triggering this effect).
    // localStorage guard: prevents re-fire across navigations in the same browser.
    if (firedRef.current || hasPurchaseEventFired(order.order_number)) return;
    firedRef.current = true;

    // Currency MUST match the currency that `value` (order.grand_total) is denominated
    // in. The order's currency_code is authoritatively set to its region currency at
    // checkout (OMR / AED / SAR), so use it directly — never infer from the URL region,
    // which can differ from the order's region on shared/bookmarked thank-you links and
    // would report the amount under the wrong currency.
    const currency = payload.currency;
    const itemIds = (payload.items || []).map((i) => i.item_id);
    const numItems = (payload.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
    const eventID = `purchase-${order.order_number}`;

    // Meta Pixel — unconditional for GCC markets; eventID for CAPI deduplication.
    fbqTrack("Purchase", {
      value: payload.value,
      currency,
      content_ids: itemIds,
      content_type: "product",
      num_items: numItems,
      event_id: eventID,
    });

    // Snapchat Pixel PURCHASE.
    snaptrTrack("PURCHASE", {
      price: payload.value,
      currency,
      transaction_id: order.order_number,
      item_ids: itemIds,
      number_items: numItems,
    });

    // GA4/GTM purchase requires consent.
    if (consentState === CONSENT_STATES.GRANTED) {
      pushDataLayerEvent("purchase", { ecommerce: payload, locale, region });
    }
    markPurchaseEventFired(order.order_number);
  }, [consentState, locale, order?.order_number, payload, region]);

  return null;
}

