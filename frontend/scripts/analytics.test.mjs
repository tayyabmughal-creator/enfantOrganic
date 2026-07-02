import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalyticsItem,
  buildTikTokContents,
  isPurchaseTrackable,
} from "../lib/analytics.js";

// ─── buildTikTokContents ─────────────────────────────────────────────────────

test("buildTikTokContents maps analytics items to TikTok contents", () => {
  const contents = buildTikTokContents([
    { item_id: "baby-oil", item_name: "Baby Oil", quantity: 2, price: 3.5 },
  ]);
  assert.deepEqual(contents, [
    {
      content_id: "baby-oil",
      content_type: "product",
      content_name: "Baby Oil",
      quantity: 2,
      price: 3.5,
    },
  ]);
});

test("buildTikTokContents normalizes bad quantity/price and drops empty items", () => {
  const contents = buildTikTokContents([
    { item_id: "soap", item_name: "Soap", quantity: 0, price: "not-a-number" },
    { item_id: "", item_name: "" },
    null,
  ]);
  assert.equal(contents.length, 1);
  assert.equal(contents[0].quantity, 1);
  assert.equal(contents[0].price, 0);
});

test("buildTikTokContents tolerates non-array input", () => {
  assert.deepEqual(buildTikTokContents(null), []);
  assert.deepEqual(buildTikTokContents(undefined), []);
  assert.deepEqual(buildTikTokContents("nope"), []);
});

// ─── isPurchaseTrackable ─────────────────────────────────────────────────────

test("purchase is trackable for normal successful orders", () => {
  assert.equal(
    isPurchaseTrackable({ order_number: "EO-1", status: "paid", payment_status: "paid" }),
    true,
  );
  // COD orders are legitimately unpaid+pending on the thank-you page.
  assert.equal(
    isPurchaseTrackable({ order_number: "EO-2", status: "pending", payment_status: "unpaid" }),
    true,
  );
  assert.equal(
    isPurchaseTrackable({ order_number: "EO-3", status: "confirmed", payment_status: "review" }),
    true,
  );
});

test("purchase is blocked for failed/cancelled/refunded orders", () => {
  for (const status of ["cancelled", "failed", "returned", "refunded", "CANCELLED"]) {
    assert.equal(
      isPurchaseTrackable({ order_number: "EO-4", status, payment_status: "paid" }),
      false,
      `status=${status} should block purchase`,
    );
  }
  for (const paymentStatus of ["failed", "refunded"]) {
    assert.equal(
      isPurchaseTrackable({ order_number: "EO-5", status: "pending", payment_status: paymentStatus }),
      false,
      `payment_status=${paymentStatus} should block purchase`,
    );
  }
});

test("purchase is blocked without an order number", () => {
  assert.equal(isPurchaseTrackable(null), false);
  assert.equal(isPurchaseTrackable({}), false);
  assert.equal(isPurchaseTrackable({ status: "paid" }), false);
});

// ─── buildAnalyticsItem (shared payload source for all pixels) ───────────────

test("buildAnalyticsItem derives unit price and quantity", () => {
  const item = buildAnalyticsItem({
    product_slug: "shampoo",
    product_name: "Shampoo",
    quantity: 3,
    line_total: 9,
  });
  assert.equal(item.item_id, "shampoo");
  assert.equal(item.price, 3);
  assert.equal(item.quantity, 3);
});

test("buildAnalyticsItem returns null for unidentifiable input", () => {
  assert.equal(buildAnalyticsItem({}), null);
  assert.equal(buildAnalyticsItem(null), null);
});
