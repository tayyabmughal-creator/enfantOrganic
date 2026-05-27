import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { resolveServerRegion } from "@/lib/regionResolver";
import { buildStorePath, normalizeLocale, normalizeRegion } from "@/lib/storefront";

// Paymob "Transaction response callback" target.
//
// Paymob redirects the customer's BROWSER here (GET) after they finish on the
// hosted iframe, appending transaction query params (success, pending,
// error_occured, merchant_order_id, order, id, ...). This route is a thin,
// locale-agnostic dispatcher: it inspects the outcome flags and forwards to the
// existing /[locale]/payment/{success,failed,pending} pages.
//
// IMPORTANT: this page is presentational only. It NEVER marks an order paid —
// that is the exclusive responsibility of the HMAC-verified server-to-server
// webhook at POST /api/payments/webhook/. A user could otherwise spoof these
// query params, so order state must never be derived from them.

const LOCALE_COOKIE = "enfant-locale";

function isTrue(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export default async function CheckoutReturnPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const cookieStore = await cookies();

  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value || "en");
  const region = resolveServerRegion(sp);

  // merchant_order_id is the value we set as Paymob's merchant_order_id, i.e.
  // our own order_number. Fall back through the other names Paymob/legacy flows
  // may use so the destination page can still surface a reference.
  const orderNumber =
    sp.merchant_order_id || sp.order_number || sp.order || sp.cart_id || "";

  const success = isTrue(sp.success);
  const pending = isTrue(sp.pending);
  const errorOccured = isTrue(sp.error_occured);

  let destination;
  if (pending) {
    destination = "pending";
  } else if (success && !errorOccured) {
    destination = "success";
  } else {
    destination = "failed";
  }

  // buildStorePath already appends ?region=…; layer the order reference on with &.
  const base = buildStorePath(locale, `/payment/${destination}`, region);
  const target = orderNumber
    ? `${base}&merchant_order_id=${encodeURIComponent(orderNumber)}`
    : base;

  redirect(target);
}
