import { useEffect, useRef, useState } from "react";
import Icon from "@/components/icons/Icon";
import { AdminEmpty, statusTone } from "./SharedUI";

// ─── Shared Utility Functions ────────────────────────────────────────────────
// Note: FIELD_CONFIGS and helpers must be exported from AdminPanelClient or passed as props.
// For simplicity, we assume they are passed as props or imported if needed.
// To keep it clean, we'll pass the specific field configs and helper functions as props.

export function CrudPanel({
  rows,
  activeKey,
  canCreate,
  canEdit,
  canDelete,
  onCreate,
  onEdit,
  onDelete,
  onDownloadInvoice,
  onBulkStatusChange,
  titleFor,
  metaFor,
  labelFor,
  searchQuery,
  onSearchChange,
  page,
  totalPages,
  onPageChange,
  orderFilters,
  onOrderFiltersChange,
}) {
  const label = labelFor ? labelFor(activeKey) : activeKey;
  const isOrderView = activeKey === "orders" || activeKey === "draft_orders";
  const isAbandonedView = activeKey === "abandoned";
  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>{activeKey === "deals" ? "Promotions" : activeKey === "blog" ? "Blog Articles" : activeKey === "draft_orders" ? "Draft Orders" : activeKey.charAt(0).toUpperCase() + activeKey.slice(1)}</h3>
          <span>{rows.length} record{rows.length === 1 ? "" : "s"}{totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}</span>
        </div>
        {canCreate ? (
          <button type="button" className="admin-btn-primary" onClick={onCreate}>
            + {activeKey === "draft_orders" ? "Create order" : activeKey === "blog" ? "New article" : `Add ${activeKey === "deals" ? "deal" : activeKey.slice(0, -1)}`}
          </button>
        ) : null}
      </div>
      {onSearchChange ? (
        <div className="admin-search-bar">
          <input
            type="text"
            className="admin-input"
            placeholder="Search records…"
            value={searchQuery || ""}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      ) : null}
      {isOrderView && orderFilters && onOrderFiltersChange ? (
        <div className="admin-top-products-filters admin-orders-filters">
          <label className="admin-filter-field">
            <span>Date Range</span>
            <select
              className="admin-filter-select"
              value={orderFilters.dateRange || "all"}
              onChange={(e) => onOrderFiltersChange({ dateRange: e.target.value })}
              aria-label="Orders date range filter"
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_7_days">Last 7 days</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="custom">Custom date range</option>
            </select>
          </label>
          {orderFilters.dateRange === "custom" ? (
            <>
              <label className="admin-filter-field">
                <span>Start Date</span>
                <input
                  type="date"
                  className="admin-filter-date"
                  value={orderFilters.customStartDate || ""}
                  onChange={(e) => onOrderFiltersChange({ customStartDate: e.target.value })}
                  aria-label="Orders custom start date"
                />
              </label>
              <label className="admin-filter-field">
                <span>End Date</span>
                <input
                  type="date"
                  className="admin-filter-date"
                  value={orderFilters.customEndDate || ""}
                  onChange={(e) => onOrderFiltersChange({ customEndDate: e.target.value })}
                  aria-label="Orders custom end date"
                />
              </label>
            </>
          ) : null}
          <label className="admin-filter-field">
            <span>Market</span>
            <select
              className="admin-filter-select"
              value={orderFilters.market || "all"}
              onChange={(e) => onOrderFiltersChange({ market: e.target.value })}
              aria-label="Orders market filter"
            >
              <option value="all">All markets</option>
              <option value="om">Oman</option>
              <option value="ae">UAE</option>
              <option value="sa">KSA/Saudi</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="admin-record-list">
        {rows.length ? (
          isOrderView ? (
            <OrdersTable rows={rows} canEdit={canEdit} onEdit={onEdit} onDownloadInvoice={onDownloadInvoice} onBulkStatusChange={onBulkStatusChange} />
          ) : isAbandonedView ? (
            <AbandonedCheckoutsTable rows={rows} canEdit={canEdit} onEdit={onEdit} />
          ) : (
            <>
              <div className="admin-list-head"><span>Record</span><span>Status</span><span>Actions</span></div>
              {rows.map((item) => {
                const meta = metaFor ? metaFor(item, activeKey) : "";
                const title = titleFor ? titleFor(item, activeKey) : (item.name_en || item.title_en || item.order_number || item.email || "Item");
                return (
                  <div key={item.id || item.slug || item.order_number || item.email} className="admin-record-row">
                    {canEdit ? (
                      <button type="button" className="admin-record-main" onClick={() => onEdit(item)}>
                        {item.image ? <img src={item.image} alt="" className="admin-record-thumb" /> : null}
                        <div>
                          <strong>{title}</strong>
                          <span>{item.email || item.customer_phone || item.currency_code || item.slug || "—"}</span>
                        </div>
                      </button>
                    ) : (
                      <div className="admin-record-main" role="presentation">
                        {item.image ? <img src={item.image} alt="" className="admin-record-thumb" /> : null}
                        <div>
                          <strong>{title}</strong>
                          <span>{item.email || item.customer_phone || item.currency_code || item.slug || "—"}</span>
                        </div>
                      </div>
                    )}
                    <span className={`admin-badge ${statusTone(meta)}`}>{meta || "—"}</span>
                    <div className="admin-row-actions">
                      {canEdit ? <button type="button" className="admin-btn-sm" onClick={() => onEdit(item)}>Edit</button> : null}
                      {canDelete ? <button type="button" className="admin-btn-sm danger" onClick={() => onDelete(item)}>Delete</button> : null}
                    </div>
                  </div>
                );
              })}
            </>
          )
        ) : <AdminEmpty label={label} />}
      </div>
      {totalPages > 1 ? (
        <div className="admin-pagination">
          <button type="button" className="admin-btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button type="button" className="admin-btn-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</button>
        </div>
      ) : null}
    </section>
  );
}

const ORDER_CHANNEL_LABELS = {
  online_store: "Online Store",
  draft_order: "Draft Orders",
};

const PAYMENT_STATUS_LABELS = {
  unpaid: "Unpaid",
  review: "Needs review",
  paid: "Paid",
  refunded: "Refunded",
};

const ORDER_STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
  failed: "Failed",
};

const ORDER_STATUS_TRANSITIONS = {
  pending: ["confirmed", "paid", "processing", "cancelled", "failed"],
  confirmed: ["paid", "processing", "cancelled", "failed"],
  paid: ["processing", "shipped", "delivered", "cancelled", "refunded", "failed"],
  processing: ["shipped", "delivered", "cancelled", "failed"],
  shipped: ["delivered", "returned", "failed"],
  delivered: ["returned", "refunded"],
  cancelled: ["refunded"],
  returned: ["refunded"],
  refunded: [],
  failed: ["pending", "confirmed", "paid", "cancelled"],
};

const SHIPMENT_STATUS_LABELS = {
  pending: "Pending",
  created: "Created",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Failed",
  manual: "Manual",
};

const MARKET_LABELS = {
  om: "Oman",
  ae: "UAE",
  sa: "KSA",
};

const BULK_STATUS_OPTIONS = [
  { value: "confirmed", label: "Mark Confirmed" },
  { value: "processing", label: "Mark Processing" },
  { value: "shipped", label: "Mark Shipped" },
  { value: "delivered", label: "Mark Delivered" },
  { value: "cancelled", label: "Mark Cancelled" },
];

function OrdersTable({ rows, canEdit, onEdit, onDownloadInvoice, onBulkStatusChange }) {
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const allOrderNumbers = rows.map((item) => item.order_number).filter(Boolean);
  const allSelected = allOrderNumbers.length > 0 && allOrderNumbers.every((orderNumber) => selectedOrders.has(orderNumber));
  const hasPartialSelection = selectedOrders.size > 0 && !allSelected;
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = hasPartialSelection;
  }, [hasPartialSelection]);

  useEffect(() => {
    const validOrderNumbers = new Set(allOrderNumbers);
    setSelectedOrders((previous) => {
      const next = new Set(Array.from(previous).filter((orderNumber) => validOrderNumbers.has(orderNumber)));
      return next.size === previous.size ? previous : next;
    });
  }, [rows]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedOrders(new Set());
      return;
    }
    setSelectedOrders(new Set(allOrderNumbers));
  }

  function toggleOrderSelection(orderNumber) {
    if (!orderNumber) return;
    setSelectedOrders((previous) => {
      const next = new Set(previous);
      if (next.has(orderNumber)) next.delete(orderNumber);
      else next.add(orderNumber);
      return next;
    });
  }

  function exportSelectedCsv() {
    const selected = rows.filter((o) => selectedOrders.has(o.order_number));
    const header = "order_number,date,customer,email,phone,market,channel,total,currency,payment_status,fulfillment_status";
    const lines = selected.map((o) => [
      o.order_number,
      o.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : "",
      o.customer_name || "",
      o.customer_email || "",
      o.customer_phone || "",
      o.region_code || "",
      o.sales_channel || "",
      o.grand_total || "",
      o.currency_code || "",
      o.payment_status || "",
      o.shipment_status || "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkStatus(newStatus) {
    if (!newStatus || !selectedOrders.size) return;
    const label = BULK_STATUS_OPTIONS.find((o) => o.value === newStatus)?.label || newStatus;
    if (!window.confirm(`${label} for ${selectedOrders.size} order(s)?`)) return;
    setBulkWorking(true);
    try {
      await onBulkStatusChange?.(Array.from(selectedOrders), newStatus);
      setSelectedOrders(new Set());
    } finally {
      setBulkWorking(false);
    }
  }

  return (
    <div className="admin-orders-table-wrap">
      {selectedOrders.size > 0 && (
        <div className="admin-bulk-bar">
          <span>{selectedOrders.size} selected</span>
          <select
            className="admin-select-sm"
            defaultValue=""
            disabled={bulkWorking}
            onChange={(e) => { if (e.target.value) handleBulkStatus(e.target.value); e.target.value = ""; }}
          >
            <option value="" disabled>Change status…</option>
            {BULK_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" className="admin-btn-sm" disabled={bulkWorking} onClick={exportSelectedCsv}>
            Export CSV
          </button>
          <button type="button" className="admin-btn-sm" onClick={() => setSelectedOrders(new Set())}>
            Clear
          </button>
        </div>
      )}
      <table className="admin-orders-table">
        <thead>
          <tr>
            <th className="checkbox-col">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="Select all orders"
              />
            </th>
            <th className="order-number-col">Order number</th>
            <th className="date-col">Date</th>
            <th className="customer-col">Customer</th>
            <th className="market-col">Fulfilled by / Market</th>
            <th className="channel-col">Channel</th>
            <th className="total-col">Total</th>
            <th className="payment-col">Payment status</th>
            <th className="fulfillment-col">Fulfillment status</th>
            <th className="items-col">Items</th>
            <th className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((order) => {
            const orderNumber = order.order_number || "";
            const marketCode = String(order.region_code || "").toLowerCase();
            const marketLabel = MARKET_LABELS[marketCode] || (marketCode ? marketCode.toUpperCase() : "—");
            const carrierLabel = order.shipping_carrier_name || order.carrier || "—";
            const paymentStatus = String(order.payment_status || "");
            const shipmentStatus = String(order.shipment_status || "");
            const channelLabel = ORDER_CHANNEL_LABELS[order.sales_channel] || order.sales_channel || "—";
            const itemsCount = getOrderItemsCount(order);

            return (
              <tr key={order.id || orderNumber}>
                <td className="checkbox-col">
                  <input
                    type="checkbox"
                    checked={selectedOrders.has(orderNumber)}
                    onChange={() => toggleOrderSelection(orderNumber)}
                    aria-label={`Select order ${orderNumber}`}
                  />
                </td>
                <td className="order-number-col">
                  {canEdit ? (
                    <button type="button" className="admin-order-link" onClick={() => onEdit(order)}>
                      {orderNumber || "—"}
                    </button>
                  ) : (
                    <span className="admin-order-text">{orderNumber || "—"}</span>
                  )}
                </td>
                <td className="date-col">{formatOrderDate(order.created_at)}</td>
                <td className="customer-col">
                  <div className="admin-order-customer">
                    <strong>{order.customer_name || "Guest"}</strong>
                    <span>{order.customer_phone || order.customer_email || "—"}</span>
                  </div>
                </td>
                <td className="market-col">
                  <div className="admin-order-market">
                    <strong>{carrierLabel}</strong>
                    <span>{marketLabel}</span>
                  </div>
                </td>
                <td className="channel-col">{channelLabel}</td>
                <td className="total-col admin-order-total">{formatOrderTotal(order)}</td>
                <td className="payment-col">
                  <span className={`admin-badge ${statusTone(paymentStatus)}`}>
                    {PAYMENT_STATUS_LABELS[paymentStatus] || "—"}
                  </span>
                </td>
                <td className="fulfillment-col">
                  <span className={`admin-badge ${shipmentStatusTone(shipmentStatus)}`}>
                    {SHIPMENT_STATUS_LABELS[shipmentStatus] || "—"}
                  </span>
                </td>
                <td className="items-col">{itemsCount} {itemsCount === 1 ? "item" : "items"}</td>
                <td className="actions-col">
                  <div className="admin-row-actions">
                    {canEdit ? <button type="button" className="admin-btn-sm" onClick={() => onEdit(order)}>Edit</button> : null}
                    <button type="button" className="admin-btn-sm" onClick={() => onDownloadInvoice(order)}>Invoice</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CartViewModal({ cart, onClose }) {
  if (!cart) return null;
  const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg, #fff)", borderRadius: "14px", padding: "28px 28px 24px", maxWidth: "500px", width: "92%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.22)", position: "relative" }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Abandoned Cart Detail</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-soft)", padding: "2px 6px", fontSize: "1.3rem", lineHeight: 1 }}>×</button>
        </div>

        {/* Customer Info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: "20px", fontSize: "0.85rem" }}>
          {[
            ["Customer", cart.customer_name || "—"],
            ["Phone", cart.customer_phone || "—"],
            ["Email", cart.customer_email || "—"],
            ["Market", `${cart.region_name || "—"} (${cart.currency_code || ""})`],
            ["Total", `${cart.currency_code || ""} ${Number(cart.subtotal || 0).toFixed(3)}`],
            ["Status", cart.status || "—"],
            ["Created", cart.abandoned_at ? new Date(cart.abandoned_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"],
            ["Recovery sent", String(cart.recovery_sent_count || 0)],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>{label}</div>
              <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Cart Items */}
        <div style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: "16px" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "12px" }}>
            Cart Items ({items.length})
          </div>
          {items.length === 0 ? (
            <p style={{ color: "var(--text-soft)", fontSize: "0.85rem" }}>No items recorded.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
              {items.map((item, i) => {
                const price = item.unit_price && Number(item.unit_price) > 0 ? Number(item.unit_price) : null;
                const lineTotal = price ? (price * (item.quantity || 1)).toFixed(3) : null;
                return (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {/* Product image */}
                    <div style={{ flexShrink: 0, width: "54px", height: "54px", borderRadius: "8px", overflow: "hidden", background: "#f4f7ef", border: "1px solid #e5e7eb" }}>
                      {item.image ? (
                        <img src={item.image} alt={item.product_name || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: "1.2rem" }}>📦</div>
                      )}
                    </div>
                    {/* Name + price */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.84rem", lineHeight: 1.3 }}>{item.product_name || item.product_slug || "Unknown"}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-soft)", marginTop: "3px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span>Qty: {item.quantity || 1}</span>
                        {price ? <span>{price.toFixed(3)} {cart.currency_code}</span> : null}
                        {lineTotal ? <span style={{ fontWeight: 600, color: "#4a6741" }}>= {lineTotal} {cart.currency_code}</span> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Recovery Notes */}
        {cart.recovery_notes ? (
          <div style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: "14px", marginTop: "16px", fontSize: "0.84rem" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Recovery Notes</div>
            <p style={{ margin: 0 }}>{cart.recovery_notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AbandonedCheckoutsTable({ rows, canEdit, onEdit }) {
  const [viewCart, setViewCart] = useState(null);
  return (
    <>
      {viewCart && <CartViewModal cart={viewCart} onClose={() => setViewCart(null)} />}
      <div className="admin-orders-table-wrap">
        <table className="admin-orders-table admin-abandoned-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Items</th>
              <th>Market</th>
              <th>Cart Total</th>
              <th>Recovery Status</th>
              <th>Created</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cart) => {
              const status = String(cart.status || "").toLowerCase();
              const itemCount = Array.isArray(cart.cart_items) ? cart.cart_items.length : 0;
              return (
                <tr key={cart.id || cart.session_token || `${cart.customer_email}-${cart.abandoned_at}`}>
                  <td>
                    <div className="admin-order-customer">
                      <strong>{formatAbandonedCustomerName(cart)}</strong>
                    </div>
                  </td>
                  <td>{cart.customer_email || "—"}</td>
                  <td>{cart.customer_phone || "—"}</td>
                  <td>
                    <span style={{ fontSize: "0.82rem", color: itemCount ? "inherit" : "var(--text-soft)" }}>
                      {itemCount ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "—"}
                    </span>
                  </td>
                  <td>{formatAbandonedMarket(cart)}</td>
                  <td className="admin-order-total">{formatAbandonedTotal(cart)}</td>
                  <td>
                    <div className="admin-abandoned-status">
                      <span className={`admin-badge ${statusTone(status)}`}>{humanizeEnum(status) || "Unknown"}</span>
                      <span className="admin-abandoned-status-meta">Recovery sent: {Number(cart.recovery_sent_count || 0)}</span>
                    </div>
                  </td>
                  <td>{formatOrderDate(cart.abandoned_at)}</td>
                  <td className="actions-col">
                    <div className="admin-row-actions">
                      <button type="button" className="admin-btn-sm admin-btn-icon" title="View details" onClick={() => setViewCart(cart)}>
                        <Icon name="eye" size={15} />
                      </button>
                      {canEdit ? <button type="button" className="admin-btn-sm" onClick={() => onEdit(cart)}>Edit</button> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatOrderDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAbandonedCustomerName(cart) {
  const name = String(cart?.customer_name || "").trim();
  if (name) return name;
  const email = String(cart?.customer_email || "").trim();
  if (email) return email.split("@")[0];
  return "Guest";
}

function formatAbandonedMarket(cart) {
  const regionCode = String(cart?.region_code || "").toLowerCase();
  if (regionCode && MARKET_LABELS[regionCode]) return MARKET_LABELS[regionCode];
  if (regionCode) return regionCode.toUpperCase();
  const regionName = String(cart?.region_name || "").trim();
  if (regionName) return regionName;
  return "—";
}

function formatAbandonedTotal(cart) {
  const currency = String(cart?.currency_code || "").toUpperCase();
  const amount = Number(cart?.subtotal);
  if (!Number.isFinite(amount)) return "—";
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatOrderTotal(order) {
  const currency = String(order.currency_code || "").toUpperCase();
  const amount = Number(order.grand_total);
  if (!currency) return Number.isFinite(amount) ? amount.toFixed(2) : "—";
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function getOrderItemsCount(order) {
  const numericCount = Number(order.items_count);
  if (Number.isFinite(numericCount) && numericCount >= 0) return numericCount;
  if (!Array.isArray(order.items)) return 0;
  const summedQuantity = order.items.reduce((total, item) => total + Number(item?.quantity || 0), 0);
  return summedQuantity || order.items.length;
}

function shipmentStatusTone(status) {
  if (status === "delivered") return "success";
  if (status === "failed") return "danger";
  if (status === "created" || status === "in_transit" || status === "pending" || status === "manual") return "warning";
  return "neutral";
}

export function CrudFormModal({ activeKey, isSettings, mode, selected, editor, setEditor, canDelete, onClose, onSave, onDelete, onDownloadInvoice, onRefundOrder, onCreateShipment, onRollbackOrderStatus, onGalleryUpload, titleFor, metaFor, fields, request, onOrderRefreshed, onDeleteOrder }) {
  const title  = mode === "create"
    ? `Add ${activeKey === "deals" ? "promotion" : activeKey === "blog" ? "article" : activeKey.replace(/_/g, " ")}`
    : (titleFor ? titleFor(selected, activeKey) : "Edit");

  const eyebrow = isSettings ? "Store settings" : mode === "create" ? "Create record" : "Edit record";
  const resolvedFields = resolveFields(activeKey, fields, selected);
  const modalClassName = [
    "admin-modal",
    activeKey === "orders" || activeKey === "draft_orders" ? "admin-modal--order" : "",
  ].filter(Boolean).join(" ");
  const modalFormClassName = [
    "admin-modal-form",
    activeKey === "orders" || activeKey === "draft_orders" ? "admin-modal-form--order" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={modalClassName} role="dialog" aria-modal="true" aria-label={title}>
        <div className="admin-modal-head">
          <div>
            <p className="admin-modal-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            {!isSettings && selected && metaFor ? <span className="admin-modal-meta">{metaFor(selected, activeKey)}</span> : null}
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {(activeKey === "orders" || activeKey === "draft_orders") && selected ? <OrderDetailLayout order={selected} onDownloadInvoice={onDownloadInvoice} onRefundOrder={onRefundOrder} onCreateShipment={onCreateShipment} onRollbackOrderStatus={onRollbackOrderStatus} request={request} onOrderRefreshed={onOrderRefreshed} onDeleteOrder={onDeleteOrder} /> : null}
        {activeKey === "hero_cards" ? <HeroCardPreview editor={editor} /> : null}

        <div className={modalFormClassName}>
          {resolvedFields.map((field) => (
            <FormField key={field[0]} field={field} value={editor[field[0]]} editor={editor} setEditor={setEditor} mode={mode} onGalleryUpload={onGalleryUpload} />
          ))}
          <div className="admin-modal-actions">
            <button type="button" className="admin-btn-primary" onClick={onSave}>Save changes</button>
            {canDelete ? <button type="button" className="admin-btn-danger" onClick={onDelete}>Delete</button> : null}
            <button type="button" className="admin-btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function resolveFields(activeKey, fields, selected) {
  const baseFields = Array.isArray(fields) ? fields : [];
  if (!(activeKey === "orders" || activeKey === "draft_orders") || !selected) return baseFields;
  return baseFields.map((field) => {
    const [name, label, type, options, config = {}] = field;
    if (name !== "status" || type !== "select") return field;
    const resolvedOptions = getOrderStatusOptions(selected, options);
    const isTerminal = resolvedOptions.length <= 1;
    const currentStatus = String(selected?.status || "").toLowerCase();
    const currentLabel = ORDER_STATUS_LABELS[currentStatus] || humanizeEnum(currentStatus) || "Current status";
    const helpText = isTerminal
      ? `${currentLabel} is a terminal order state. You can still update notes, tracking, and payment metadata.`
      : "Only valid next order statuses are available for this order.";
    return [name, label, type, resolvedOptions, { ...config, disabled: isTerminal, helpText }];
  });
}

function OrderDetailLayout({ order, onDownloadInvoice, onRefundOrder, onCreateShipment, onRollbackOrderStatus, request, onOrderRefreshed, onDeleteOrder }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const activityEvents = buildOrderActivityEvents(order);
  const shippingAddressLines = buildShippingAddressLines(order);
  const billingAddressLines = buildBillingAddressLines(order);
  const payment = buildPaymentSummary(order);
  const currencyCode = String(order.currency_code || "").toUpperCase();
  const orderStatusKey = String(order.status || "").toLowerCase();
  const shipmentStatusKey = String(order.shipment_status || "").toLowerCase();
  const paymentStatusKey = String(order.payment_status || "").toLowerCase();
  const orderStatusLabel = ORDER_STATUS_LABELS[orderStatusKey] || humanizeEnum(orderStatusKey) || "—";
  const shipmentStatusLabel = SHIPMENT_STATUS_LABELS[shipmentStatusKey] || humanizeEnum(shipmentStatusKey) || "—";
  const paymentStatusLabel = PAYMENT_STATUS_LABELS[paymentStatusKey] || humanizeEnum(paymentStatusKey) || "—";
  const canRevertStatus = Boolean(order?.can_revert_status);
  const previousStatusLabel = order?.previous_status_label || order?.previous_status || "";
  const revertStatusLabel = order?.revert_status_label || (previousStatusLabel ? `Revert to ${previousStatusLabel}` : "Revert to previous status");
  const revertStatusHelper = order?.revert_status_helper || "";

  const [editingItems, setEditingItems] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [itemsSaving, setItemsSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productRows, setProductRows] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!showProductPicker || !request) return;
    let cancelled = false;
    setProductsLoading(true);
    request("/admin/products/?page_size=200").then((payload) => {
      if (cancelled) return;
      const rows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
      setProductRows(rows.sort((a, b) => String(a.name_en || a.name || "").localeCompare(String(b.name_en || b.name || ""))));
      setProductsLoading(false);
    }).catch(() => { if (!cancelled) setProductsLoading(false); });
    return () => { cancelled = true; };
  }, [showProductPicker, request]);

  const filteredProducts = productRows.filter((p) => {
    const q = productSearch.toLowerCase();
    if (!q) return true;
    return String(p.name_en || p.name || "").toLowerCase().includes(q) || String(p.slug || "").toLowerCase().includes(q);
  });

  async function handleAddItem(product) {
    if (!request || !onOrderRefreshed) return;
    setShowProductPicker(false);
    setProductSearch("");
    setItemsError("");
    setItemsSaving(true);
    try {
      const updated = await request(`/admin/orders/${order.order_number}/items/`, {
        method: "POST",
        body: JSON.stringify({ product_slug: product.slug, quantity: 1 }),
      });
      if (updated) onOrderRefreshed(updated);
    } catch (err) {
      setItemsError(err.message || "Failed to add item.");
    } finally {
      setItemsSaving(false);
    }
  }

  async function handleQtyChange(item, delta) {
    if (!request || !onOrderRefreshed) return;
    const newQty = Math.max(1, Number(item.quantity) + delta);
    if (newQty === Number(item.quantity)) return;
    setItemsError("");
    setItemsSaving(true);
    try {
      const updated = await request(`/admin/orders/${order.order_number}/items/${item.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: newQty }),
      });
      if (updated) onOrderRefreshed(updated);
    } catch (err) {
      setItemsError(err.message || "Failed to update quantity.");
    } finally {
      setItemsSaving(false);
    }
  }

  async function handleRemoveItem(item) {
    if (!request || !onOrderRefreshed) return;
    setItemsError("");
    setItemsSaving(true);
    try {
      const updated = await request(`/admin/orders/${order.order_number}/items/${item.id}/`, {
        method: "DELETE",
      });
      if (updated) onOrderRefreshed(updated);
    } catch (err) {
      setItemsError(err.message || "Failed to remove item.");
    } finally {
      setItemsSaving(false);
    }
  }

  return (
    <div className="admin-order-detail-grid">
      <section className="admin-order-detail-col">
        <article className="admin-order-card">
          <div className="admin-order-card-head">
            <h3>Order Items</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span>{items.length} line{items.length === 1 ? "" : "s"}</span>
              {request && onOrderRefreshed ? (
                <button
                  type="button"
                  className={`admin-btn-sm${editingItems ? " active" : ""}`}
                  onClick={() => { setEditingItems((v) => !v); setShowProductPicker(false); setItemsError(""); }}
                  style={{ fontSize: "0.72rem" }}
                >
                  {editingItems ? "Done" : "Edit Items"}
                </button>
              ) : null}
            </div>
          </div>
          {itemsError ? <p style={{ color: "var(--danger)", fontSize: "0.8rem", margin: "4px 16px 0" }}>{itemsError}</p> : null}
          {items.length ? (
            <div className="admin-order-items-list">
              {items.map((item, index) => (
                <div key={item.id || `${item.product_slug || "item"}-${index}`} className="admin-order-item-row">
                  <div className="admin-order-item-main">
                    <div className="admin-order-item-image-wrap">
                      {item.product_image ? (
                        <img src={item.product_image} alt={item.product_name || "Order item"} className="admin-order-item-image" />
                      ) : (
                        <div className="admin-order-item-image admin-order-item-image--placeholder">No image</div>
                      )}
                    </div>
                    <div>
                      <p className="admin-order-item-title">{item.product_name || item.product_slug || "Unnamed product"}</p>
                      <p className="admin-order-item-meta">
                        <span>SKU: {item.sku || item.product_slug || "—"}</span>
                        {item.variant ? <span>Variant: {item.variant}</span> : null}
                      </p>
                    </div>
                  </div>
                  <div className="admin-order-item-pricing">
                    {editingItems ? (
                      <div className="admin-order-item-qty-controls">
                        <button type="button" className="admin-order-qty-btn" onClick={() => handleQtyChange(item, -1)} disabled={itemsSaving || Number(item.quantity) <= 1} aria-label="Decrease">−</button>
                        <span className="admin-order-qty-val">{Number(item.quantity)}</span>
                        <button type="button" className="admin-order-qty-btn" onClick={() => handleQtyChange(item, 1)} disabled={itemsSaving} aria-label="Increase">+</button>
                        <button type="button" className="admin-order-qty-btn admin-order-qty-btn--remove" onClick={() => handleRemoveItem(item)} disabled={itemsSaving || items.length <= 1} aria-label="Remove item" title={items.length <= 1 ? "Cannot remove last item" : "Remove"}>✕</button>
                      </div>
                    ) : (
                      <span>{formatMoney(item.unit_price, currencyCode)} × {Number(item.quantity || 0)}</span>
                    )}
                    <strong>{formatMoney(item.line_total, currencyCode)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-order-empty">No order items are available for this record.</p>
          )}
          {editingItems ? (
            <div className="admin-order-add-item">
              {showProductPicker ? (
                <div className="admin-order-product-picker">
                  <input
                    ref={searchRef}
                    type="text"
                    className="admin-input"
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    autoFocus
                  />
                  <div className="admin-order-product-list">
                    {productsLoading ? (
                      <p className="admin-order-product-hint">Loading products…</p>
                    ) : filteredProducts.length === 0 ? (
                      <p className="admin-order-product-hint">No products found.</p>
                    ) : filteredProducts.slice(0, 30).map((p) => (
                      <button
                        key={p.slug}
                        type="button"
                        className="admin-order-product-row"
                        onClick={() => handleAddItem(p)}
                        disabled={itemsSaving}
                      >
                        <span className="admin-order-product-name">{p.name_en || p.name || p.slug}</span>
                        <span className="admin-order-product-slug">{p.slug}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="admin-btn-sm" style={{ marginTop: 6 }} onClick={() => { setShowProductPicker(false); setProductSearch(""); }}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="admin-btn-sm" onClick={() => setShowProductPicker(true)} disabled={itemsSaving}>
                  + Add Item
                </button>
              )}
            </div>
          ) : null}
        </article>

        <article className="admin-order-card">
          <div className="admin-order-card-head">
            <h3>Fulfillment & Status</h3>
          </div>
          <div className="admin-order-status-grid">
            <div className="admin-order-status-cell">
              <span>Order status</span>
              <strong>{orderStatusLabel}</strong>
            </div>
            <div className="admin-order-status-cell">
              <span>Fulfillment status</span>
              <strong>{shipmentStatusLabel}</strong>
            </div>
          </div>
          <div className="admin-order-status-badges">
            <span className={`admin-badge ${statusTone(orderStatusKey)}`}>{orderStatusLabel}</span>
            <span className={`admin-badge ${shipmentStatusTone(shipmentStatusKey)}`}>{shipmentStatusLabel}</span>
          </div>
          <p className="admin-order-helper">Use the status fields below to update fulfillment/order state safely.</p>
          {onRollbackOrderStatus && canRevertStatus ? (
            <div className="admin-snapshot-actions">
              <button type="button" className="admin-btn-sm" onClick={() => onRollbackOrderStatus(order)}>
                {revertStatusLabel}
              </button>
            </div>
          ) : null}
          {!canRevertStatus && revertStatusHelper ? (
            <p className="admin-order-helper">{revertStatusHelper}</p>
          ) : null}
        </article>

        <article className="admin-order-card">
          <div className="admin-order-card-head">
            <h3>Payment Summary</h3>
            <span className={`admin-badge ${statusTone(paymentStatusKey)}`}>{paymentStatusLabel}</span>
          </div>
          <div className="admin-order-money-grid">
            <span>Subtotal</span>
            <strong>{formatMoney(payment.subtotal, currencyCode)}</strong>
            <span>Discount</span>
            <strong>{formatMoney(payment.discount, currencyCode)}</strong>
            <span>Shipping</span>
            <strong>{formatMoney(payment.shipping, currencyCode)}</strong>
            {payment.showTax ? (
              <>
                <span>{order.tax_label || "Tax"}</span>
                <strong>{formatMoney(payment.tax, currencyCode)}</strong>
              </>
            ) : null}
            <span className="admin-order-money-total">Total</span>
            <strong className="admin-order-money-total">{formatMoney(payment.total, currencyCode)}</strong>
            <span>Paid amount</span>
            <strong>{formatMoney(payment.paid, currencyCode)}</strong>
            <span>Balance</span>
            <strong>{formatMoney(payment.balance, currencyCode)}</strong>
          </div>
        </article>

        <article className="admin-order-card">
          <div className="admin-order-card-head">
            <h3>Invoice & Payment Actions</h3>
            <span>{order.invoice_number || order.order_number || "—"}</span>
          </div>
          <div className="admin-snapshot-actions">
            <button type="button" className="admin-btn-sm" onClick={() => onDownloadInvoice(order)}>
              Download Invoice
            </button>
            {onRefundOrder ? (
              <button type="button" className="admin-btn-sm warning" onClick={() => onRefundOrder(order)}>
                Issue Refund
              </button>
            ) : null}
            {onCreateShipment ? (
              <button type="button" className="admin-btn-sm" onClick={() => onCreateShipment(order)}>
                Create Shipment
              </button>
            ) : null}
            {onDeleteOrder ? (
              <button type="button" className="admin-btn-sm danger" onClick={() => onDeleteOrder(order)}>
                Delete Order
              </button>
            ) : null}
          </div>
        </article>
      </section>

      <aside className="admin-order-detail-col secondary">
        <article className="admin-order-card">
          <div className="admin-order-card-head">
            <h3>Notes</h3>
          </div>
          <p className="admin-order-notes">{order.notes || "No notes from customer."}</p>
        </article>

        <ConversionSummaryCard summary={order.conversion_summary} />
        <NotificationStatusCard summary={order.notification_summary} history={order.notification_history} />

        <article className="admin-order-card">
          <div className="admin-order-card-head">
            <h3>Customer</h3>
          </div>
          <div className="admin-order-info-block">
            <h4>{order.customer_name || "Guest customer"}</h4>
            <p>Order: {order.order_number || "—"}</p>
            <p>Channel: {ORDER_CHANNEL_LABELS[order.sales_channel] || order.sales_channel || "—"}</p>
          </div>
          <div className="admin-order-info-block">
            <h4>Contact Information</h4>
            <p>{order.customer_email || "No email"}</p>
            <p>{order.customer_phone || "No phone number"}</p>
          </div>
          <div className="admin-order-info-block">
            <h4>Shipping Address</h4>
            {shippingAddressLines.map((line, index) => <p key={`shipping-${index}`}>{line}</p>)}
            {order.map_link ? (
              <p>
                <a href={order.map_link} target="_blank" rel="noreferrer">View map</a>
              </p>
            ) : null}
          </div>
          <div className="admin-order-info-block">
            <h4>Billing Address</h4>
            {billingAddressLines.map((line, index) => <p key={`billing-${index}`}>{line}</p>)}
          </div>
        </article>

        <article className="admin-order-card">
          <div className="admin-order-card-head">
            <h3>Order Activity</h3>
          </div>
          {activityEvents.length ? (
            <div className="admin-order-timeline">
              {activityEvents.map((event) => (
                <div key={event.id} className="admin-order-timeline-item">
                  <span className="admin-order-timeline-dot" aria-hidden="true" />
                  <div className="admin-order-timeline-content">
                    <div className="admin-order-timeline-top">
                      <strong>{event.title}</strong>
                      <span>{formatOrderDate(event.timestamp)}</span>
                    </div>
                    {event.description ? <p>{event.description}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-order-empty">No activity is available for this order yet.</p>
          )}
        </article>
      </aside>
    </div>
  );
}

function ConversionSummaryCard({ summary }) {
  const [expanded, setExpanded] = useState(false);
  const available = Boolean(summary?.available);
  const detailEntries = Object.entries(summary?.details || {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .map(([key, value]) => [humanizeEnum(key), String(value)]);

  return (
    <article className="admin-order-card admin-conversion-card">
      <div className="admin-order-card-head">
        <h3>Conversion Summary</h3>
      </div>
      {available ? (
        <>
          <div className="admin-conversion-list">
            <div className="admin-conversion-row">
              <Icon name="bag" size={16} />
              <span>{summary.order_line || "Order history unavailable"}</span>
            </div>
            <div className="admin-conversion-row">
              <Icon name="globe" size={16} />
              <span>{summary.source_line || "Session source unavailable"}</span>
            </div>
            <div className="admin-conversion-row">
              <Icon name="calendar" size={16} />
              <span>{summary.session_line || "Session duration unavailable"}</span>
            </div>
          </div>
          {detailEntries.length ? (
            <>
              <button type="button" className="admin-link-button" onClick={() => setExpanded((value) => !value)}>
                {expanded ? "Hide conversion details" : "View conversion details"}
              </button>
              {expanded ? (
                <dl className="admin-conversion-details">
                  {detailEntries.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <p className="admin-order-helper">{summary?.helper || "No conversion data captured for this order."}</p>
      )}
    </article>
  );
}

function NotificationStatusCard({ summary, history }) {
  const entries = Array.isArray(history) ? history : [];
  const latest = summary && typeof summary === "object" ? summary : {};
  const latestStatus = latest.latest_status || "";
  const latestError = latest.latest_error || "";
  const latestEvent = latest.latest_event || "";
  const latestSentAt = latest.sent_at || null;
  const hasEmail = Boolean(latest.has_email);

  return (
    <article className="admin-order-card">
      <div className="admin-order-card-head">
        <h3>Email Notification</h3>
        <span className={`admin-badge ${statusTone(latestStatus)}`}>{humanizeEnum(latestStatus) || "No activity"}</span>
      </div>
      <div className="admin-order-info-block">
        <h4>{hasEmail ? "Customer email available" : "No customer email on this order"}</h4>
        <p>Latest event: {humanizeEnum(latestEvent) || "—"}</p>
        <p>Last sent: {latestSentAt ? formatOrderDate(latestSentAt) : "Not sent yet"}</p>
        {latestError ? <p>{latestError}</p> : null}
      </div>
      {entries.length ? (
        <div className="admin-order-timeline">
          {entries.slice(0, 4).map((entry) => (
            <div key={entry.id || `${entry.event}-${entry.created_at}`} className="admin-order-timeline-item">
              <span className="admin-order-timeline-dot" aria-hidden="true" />
              <div className="admin-order-timeline-content">
                <div className="admin-order-timeline-top">
                  <strong>{humanizeEnum(entry.event) || "Notification event"}</strong>
                  <span>{formatOrderDate(entry.updated_at || entry.created_at)}</span>
                </div>
                <p>
                  {humanizeEnum(entry.status) || "Unknown status"}
                  {entry.attempt_count ? ` • Attempts: ${entry.attempt_count}` : ""}
                </p>
                {entry.error_message ? <p>{entry.error_message}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="admin-order-empty">No email notification activity is available for this order yet.</p>
      )}
    </article>
  );
}

function buildShippingAddressLines(order) {
  const lines = [
    order.customer_name || "",
    order.address_line_1 || "",
    order.address_line_2 || "",
    [order.area, order.city].filter(Boolean).join(", "),
    [order.postcode, order.country].filter(Boolean).join(", "),
  ].map((line) => String(line || "").trim()).filter(Boolean);
  return lines.length ? lines : ["No shipping address available"];
}

function buildBillingAddressLines(order) {
  return buildShippingAddressLines(order);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(amount, currencyCode) {
  const numericAmount = toNumber(amount);
  const code = String(currencyCode || "").toUpperCase();
  if (!code) return numericAmount.toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${code} ${numericAmount.toFixed(2)}`;
  }
}

function humanizeEnum(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildPaymentSummary(order) {
  const subtotal = toNumber(order.subtotal);
  const discount = toNumber(order.discount_total);
  const shipping = toNumber(order.shipping_total || order.shipping_fee);
  const tax = toNumber(order.tax_total);
  const total = toNumber(order.grand_total);
  const paid = inferPaidAmount(order, total);
  const balance = Math.max(total - paid, 0);
  return {
    subtotal,
    discount,
    shipping,
    tax,
    total,
    paid,
    balance,
    showTax: tax > 0 || Boolean(order.tax_label),
  };
}

function inferPaidAmount(order, totalAmount) {
  const transactions = Array.isArray(order.transactions) ? order.transactions : [];
  let paidFromTransactions = 0;
  transactions.forEach((transaction) => {
    const statusKey = String(transaction?.status || "").toLowerCase();
    const amount = toNumber(transaction?.amount);
    if (statusKey === "paid" || statusKey === "authorized") paidFromTransactions += amount;
    if (statusKey === "refunded") paidFromTransactions -= amount;
  });
  if (paidFromTransactions > 0) return paidFromTransactions;

  const paymentStatus = String(order.payment_status || "").toLowerCase();
  if (paymentStatus === "paid") return Math.max(totalAmount, 0);
  if (paymentStatus === "refunded") {
    const refundAmount = toNumber(order.refund_amount);
    return Math.max(totalAmount - refundAmount, 0);
  }
  return 0;
}

function buildOrderActivityEvents(order) {
  const events = [];

  function pushEvent({ key, title, description = "", timestamp, source = "order", fallbackTimestamp = "" }) {
    const parsed = normalizeDate(timestamp) || normalizeDate(fallbackTimestamp);
    if (!parsed) return;
    events.push({
      id: `${source}-${key}-${parsed.getTime()}-${events.length}`,
      title,
      description: String(description || "").trim(),
      timestamp: parsed.toISOString(),
      sortKey: parsed.getTime(),
    });
  }

  pushEvent({
    key: "created",
    title: "Order placed",
    description: `${order.customer_name || "Customer"} placed this order.`,
    timestamp: order.created_at,
  });

  const statusTimeline = Array.isArray(order.status_timeline) ? order.status_timeline : [];
  statusTimeline.forEach((entry, index) => {
    const nextStatusKey = String(entry?.new_status || "").toLowerCase();
    const statusLabel = entry?.label || ORDER_STATUS_LABELS[nextStatusKey] || humanizeEnum(nextStatusKey) || "Status updated";
    const actorDetails = entry?.actor_name ? `Updated by ${entry.actor_name}.` : "";
    const noteDetails = entry?.note ? `Note: ${entry.note}` : "";
    const description = [actorDetails, noteDetails].filter(Boolean).join(" ");
    const title = entry?.old_status ? `Order status changed to ${statusLabel}` : `Order status: ${statusLabel}`;
    pushEvent({
      key: `status-${index}`,
      source: "status",
      title,
      description,
      timestamp: entry?.timestamp,
    });
  });

  const transactions = Array.isArray(order.transactions) ? order.transactions : [];
  transactions.forEach((transaction, index) => {
    const paymentStatus = humanizeEnum(transaction?.status || "") || "Updated";
    const providerLabel = humanizeEnum(transaction?.provider || "");
    const amountLabel = formatMoney(transaction?.amount, transaction?.currency_code || order.currency_code);
    const reference = transaction?.provider_reference ? `Ref: ${transaction.provider_reference}` : "";
    const description = [
      amountLabel,
      providerLabel ? `via ${providerLabel}` : "",
      reference,
    ].filter(Boolean).join(" ");
    pushEvent({
      key: `payment-${index}`,
      source: "payment",
      title: `Payment ${paymentStatus.toLowerCase()}`,
      description,
      timestamp: transaction?.created_at,
    });
  });

  const returnRequests = Array.isArray(order.return_requests) ? order.return_requests : [];
  returnRequests.forEach((request, index) => {
    pushEvent({
      key: `return-${index}`,
      source: "return",
      title: `Return request ${humanizeEnum(request?.status || "requested").toLowerCase()}`,
      description: request?.admin_note ? `Note: ${request.admin_note}` : "",
      timestamp: request?.requested_at,
    });
  });

  if (order.shipment_created_at) {
    const shipmentDetails = [
      order.carrier ? `Carrier: ${order.carrier}` : "",
      order.tracking_number ? `Tracking #: ${order.tracking_number}` : "",
    ].filter(Boolean).join(" · ");
    pushEvent({
      key: "shipment-created",
      source: "shipment",
      title: "Shipment created",
      description: shipmentDetails,
      timestamp: order.shipment_created_at,
    });
  }

  if (order.delivered_at) {
    pushEvent({
      key: "delivered",
      source: "shipment",
      title: "Order delivered",
      description: "",
      timestamp: order.delivered_at,
    });
  }

  if (String(order.invoice_status || "").toLowerCase() === "generated" && order.invoice_date) {
    pushEvent({
      key: "invoice-generated",
      source: "invoice",
      title: "Invoice generated",
      description: order.invoice_number ? `Invoice #${order.invoice_number}` : "",
      timestamp: order.invoice_date,
    });
  }

  if (order.refunded_at || String(order.refund_status || "").toLowerCase() === "refunded") {
    const refundDescription = [
      order.refund_amount ? `Amount: ${formatMoney(order.refund_amount, order.currency_code)}` : "",
      order.refund_reference ? `Ref: ${order.refund_reference}` : "",
    ].filter(Boolean).join(" · ");
    pushEvent({
      key: "refund",
      source: "refund",
      title: "Refund issued",
      description: refundDescription,
      timestamp: order.refunded_at,
      fallbackTimestamp: order.updated_at,
    });
  }

  if (!events.length) {
    pushEvent({
      key: "minimal-created",
      source: "fallback",
      title: "Order created",
      description: "",
      timestamp: order.created_at,
      fallbackTimestamp: order.updated_at,
    });
    pushEvent({
      key: "minimal-payment",
      source: "fallback",
      title: `Current payment status: ${PAYMENT_STATUS_LABELS[String(order.payment_status || "").toLowerCase()] || humanizeEnum(order.payment_status) || "Unknown"}`,
      description: "",
      timestamp: order.updated_at,
      fallbackTimestamp: order.created_at,
    });
    pushEvent({
      key: "minimal-fulfillment",
      source: "fallback",
      title: `Current fulfillment status: ${SHIPMENT_STATUS_LABELS[String(order.shipment_status || "").toLowerCase()] || humanizeEnum(order.shipment_status) || "Unknown"}`,
      description: "",
      timestamp: order.updated_at,
      fallbackTimestamp: order.created_at,
    });
  }

  const deduped = [];
  const seen = new Set();
  events
    .sort((a, b) => b.sortKey - a.sortKey)
    .forEach((event) => {
      const fingerprint = `${event.title}|${event.description}|${event.timestamp}`;
      if (seen.has(fingerprint)) return;
      seen.add(fingerprint);
      deduped.push({
        id: event.id,
        title: event.title,
        description: event.description,
        timestamp: event.timestamp,
      });
    });

  return deduped;
}

const GAL_BTN = { padding: "2px 7px", fontSize: 13, lineHeight: 1.2, cursor: "pointer", border: "1px solid #ddd", borderRadius: 4, background: "#fff" };
const OPT_BTN = { padding: "5px 9px", fontSize: 12, lineHeight: 1.2, cursor: "pointer", border: "1px solid #d9e4cf", borderRadius: 6, background: "#fff" };

function normalizeOptionGroups(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw || "[]");
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((group) => ({
    name: String(group?.name || ""),
    values: Array.isArray(group?.values)
      ? group.values.map((item) => String(item || ""))
      : [],
  }));
}

function OptionGroupsManager({ field, value, editor, setEditor }) {
  const name = field[0];
  const label = field[1];
  const groups = normalizeOptionGroups(value);
  const update = (next) => setEditor({ ...editor, [name]: next });
  const addGroup = () => update([...groups, { name: "", values: [""] }]);
  const updateGroup = (groupIndex, patch) => update(groups.map((group, i) => (i === groupIndex ? { ...group, ...patch } : group)));
  const removeGroup = (groupIndex) => update(groups.filter((_, i) => i !== groupIndex));
  const moveGroup = (groupIndex, dir) => {
    const nextIndex = groupIndex + dir;
    if (nextIndex < 0 || nextIndex >= groups.length) return;
    const next = groups.slice();
    [next[groupIndex], next[nextIndex]] = [next[nextIndex], next[groupIndex]];
    update(next);
  };
  const updateValue = (groupIndex, valueIndex, nextValue) => {
    const group = groups[groupIndex];
    const values = group.values.slice();
    values[valueIndex] = nextValue;
    updateGroup(groupIndex, { values });
  };
  const addValue = (groupIndex) => {
    const group = groups[groupIndex];
    updateGroup(groupIndex, { values: [...group.values, ""] });
  };
  const removeValue = (groupIndex, valueIndex) => {
    const group = groups[groupIndex];
    updateGroup(groupIndex, { values: group.values.filter((_, i) => i !== valueIndex) });
  };

  return (
    <div className="admin-label full-width">
      <span>{label}</span>
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {groups.map((group, groupIndex) => (
          <div key={`${name}-${groupIndex}`} style={{ border: "1px solid #dfe9d7", borderRadius: 8, padding: 12, background: "#fbfdf8" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
              <input
                className="admin-input"
                value={group.name}
                placeholder="Option name, e.g. Size"
                onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
              />
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" style={OPT_BTN} disabled={groupIndex === 0} onClick={() => moveGroup(groupIndex, -1)} title="Move up">↑</button>
                <button type="button" style={OPT_BTN} disabled={groupIndex === groups.length - 1} onClick={() => moveGroup(groupIndex, 1)} title="Move down">↓</button>
                <button type="button" style={{ ...OPT_BTN, color: "#c0392b" }} onClick={() => removeGroup(groupIndex)} title="Remove option">×</button>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {group.values.map((optionValue, valueIndex) => (
                <div key={`${name}-${groupIndex}-${valueIndex}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                  <input
                    className="admin-input"
                    value={optionValue}
                    placeholder="Value, e.g. 150 ml"
                    onChange={(event) => updateValue(groupIndex, valueIndex, event.target.value)}
                  />
                  <button type="button" style={{ ...OPT_BTN, color: "#c0392b" }} onClick={() => removeValue(groupIndex, valueIndex)} title="Remove value">×</button>
                </div>
              ))}
              <button type="button" className="admin-btn-sm" onClick={() => addValue(groupIndex)}>+ Add value</button>
            </div>
          </div>
        ))}
        {groups.length === 0 ? <small className="admin-field-help">No options yet.</small> : null}
        <button type="button" className="admin-btn-sm" onClick={addGroup}>+ Add option group</button>
      </div>
      <small className="admin-field-help">Example: Size → 100 ml, 150 ml, 500 ml. Customers will choose these on product cards/detail pages.</small>
    </div>
  );
}

function normalizeProductVariants(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw || "[]");
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((variant, index) => ({
    id: String(variant?.id || `variant-${index + 1}`),
    sku: String(variant?.sku || ""),
    title_en: String(variant?.title_en || ""),
    title_ar: String(variant?.title_ar || ""),
    options: variant?.options && typeof variant.options === "object" && !Array.isArray(variant.options)
      ? variant.options
      : {},
    price: variant?.price ?? "",
    compare_at_price: variant?.compare_at_price ?? "",
    image: String(variant?.image || ""),
    stock_quantity: variant?.stock_quantity ?? "",
    is_active: variant?.is_active !== false,
  }));
}

function ProductVariantsManager({ field, value, editor, setEditor, onGalleryUpload }) {
  const name = field[0];
  const label = field[1];
  const variants = normalizeProductVariants(value);
  const update = (next) => setEditor({ ...editor, [name]: next });
  const patchVariant = (index, patch) => update(variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)));
  const addVariant = () => update([
    ...variants,
    {
      id: `variant-${variants.length + 1}`,
      sku: "",
      title_en: "",
      title_ar: "",
      options: { Size: "" },
      price: "",
      compare_at_price: "",
      image: "",
      stock_quantity: "",
      is_active: true,
    },
  ]);
  const duplicateVariant = (index) => {
    const source = variants[index] || {};
    update([
      ...variants,
      {
        ...source,
        id: `${source.id || "variant"}-copy-${variants.length + 1}`,
        sku: "",
        title_en: source.title_en ? `${source.title_en} Copy` : "",
      },
    ]);
  };
  const removeVariant = (index) => update(variants.filter((_, i) => i !== index));
  const moveVariant = (index, dir) => {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= variants.length) return;
    const next = variants.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    update(next);
  };
  const setOptionPair = (variantIndex, optionIndex, key, val) => {
    const variant = variants[variantIndex];
    const pairs = Object.entries(variant.options || {});
    pairs[optionIndex] = key === "name" ? [val, pairs[optionIndex]?.[1] || ""] : [pairs[optionIndex]?.[0] || "", val];
    const options = {};
    pairs.forEach(([optionName, optionValue]) => {
      if (String(optionName || "").trim()) options[optionName] = optionValue;
    });
    patchVariant(variantIndex, { options });
  };
  const addOptionPair = (variantIndex) => {
    const variant = variants[variantIndex];
    patchVariant(variantIndex, { options: { ...(variant.options || {}), Option: "" } });
  };
  const removeOptionPair = (variantIndex, optionName) => {
    const variant = variants[variantIndex];
    const options = { ...(variant.options || {}) };
    delete options[optionName];
    patchVariant(variantIndex, { options });
  };

  return (
    <div className="admin-label full-width">
      <span>{label}</span>
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {variants.map((variant, index) => {
          const optionPairs = Object.entries(variant.options || {});
          return (
            <div key={`${variant.id}-${index}`} style={{ border: "1px solid #dfe9d7", borderRadius: 8, padding: 12, background: "#fbfdf8" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                <input className="admin-input" value={variant.title_en} placeholder="Title EN, e.g. 150 ml" onChange={(event) => patchVariant(index, { title_en: event.target.value })} />
                <input className="admin-input" value={variant.title_ar} placeholder="Title AR" onChange={(event) => patchVariant(index, { title_ar: event.target.value })} />
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" style={OPT_BTN} disabled={index === 0} onClick={() => moveVariant(index, -1)} title="Move up">↑</button>
                  <button type="button" style={OPT_BTN} disabled={index === variants.length - 1} onClick={() => moveVariant(index, 1)} title="Move down">↓</button>
                  <button type="button" style={OPT_BTN} onClick={() => duplicateVariant(index)} title="Duplicate">Copy</button>
                  <button type="button" style={{ ...OPT_BTN, color: "#c0392b" }} onClick={() => removeVariant(index)} title="Remove">×</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 8 }}>
                <input className="admin-input" value={variant.sku} placeholder="SKU" onChange={(event) => patchVariant(index, { sku: event.target.value })} />
                <input className="admin-input" type="number" value={variant.price} placeholder="Price OMR" onChange={(event) => patchVariant(index, { price: event.target.value })} />
                <input className="admin-input" type="number" value={variant.compare_at_price} placeholder="Compare OMR" onChange={(event) => patchVariant(index, { compare_at_price: event.target.value })} />
                <input className="admin-input" type="number" value={variant.stock_quantity} placeholder="Stock" onChange={(event) => patchVariant(index, { stock_quantity: event.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <input className="admin-input" value={variant.image} placeholder="Variant image URL (optional)" onChange={(event) => patchVariant(index, { image: event.target.value })} style={{ flex: 1 }} />
                {onGalleryUpload && editor?.slug ? (
                  <label style={{ ...OPT_BTN, cursor: "pointer", whiteSpace: "nowrap", padding: "6px 10px" }} title="Upload variant image">
                    Upload
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const urls = await onGalleryUpload(editor.slug, file);
                        if (urls?.[0]) patchVariant(index, { image: urls[0] });
                      } catch {}
                      e.target.value = "";
                    }} />
                  </label>
                ) : null}
                {variant.image ? <img src={variant.image} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid #dfe9d7", flexShrink: 0 }} /> : null}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {optionPairs.map(([optionName, optionValue], optionIndex) => (
                  <div key={`${optionName}-${optionIndex}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", gap: 8 }}>
                    <input className="admin-input" value={optionName} placeholder="Option name, e.g. Size" onChange={(event) => setOptionPair(index, optionIndex, "name", event.target.value)} />
                    <input className="admin-input" value={optionValue} placeholder="Value, e.g. 150 ml" onChange={(event) => setOptionPair(index, optionIndex, "value", event.target.value)} />
                    <button type="button" style={{ ...OPT_BTN, color: "#c0392b" }} onClick={() => removeOptionPair(index, optionName)} title="Remove option">×</button>
                  </div>
                ))}
                <button type="button" className="admin-btn-sm" onClick={() => addOptionPair(index)}>+ Add option value</button>
              </div>
              <label className="admin-check-label" style={{ marginTop: 8 }}>
                <input type="checkbox" className="admin-checkbox" checked={variant.is_active} onChange={(event) => patchVariant(index, { is_active: event.target.checked })} />
                <span>Active</span>
              </label>
            </div>
          );
        })}
        {variants.length === 0 ? <small className="admin-field-help">No variants yet. Add variants when one product has different sizes, prices, SKUs, or images.</small> : null}
        <button type="button" className="admin-btn-sm" onClick={addVariant}>+ Add variant</button>
      </div>
      <small className="admin-field-help">Variant prices are authored in OMR; UAE/Saudi display prices use the existing FX rates.</small>
    </div>
  );
}

function GalleryManager({ field, value, editor, setEditor, mode, onGalleryUpload }) {
  const name = field[0];
  const label = field[1];
  const list = Array.isArray(value) ? value : [];
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const slug = editor?.slug || "";
  const canUpload = mode === "edit" && Boolean(slug) && typeof onGalleryUpload === "function";

  const update = (next) => setEditor({ ...editor, [name]: next });
  const removeAt = (i) => update(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  async function onPick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      let next = list.slice();
      for (const f of files) {
        const urls = await onGalleryUpload(slug, f);
        next = next.concat(Array.isArray(urls) ? urls : []);
      }
      update(next);
    } catch (err) {
      setError(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="admin-label full-width">
      <span>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "8px 0" }}>
        {list.map((url, i) => (
          <div key={`${url}-${i}`} style={{ width: 92 }}>
            <img src={url} alt={`Gallery ${i + 1}`} style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e5e5", display: "block" }} />
            <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4 }}>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move left" style={GAL_BTN}>←</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Move right" style={GAL_BTN}>→</button>
              <button type="button" onClick={() => removeAt(i)} title="Remove" style={{ ...GAL_BTN, color: "#c0392b" }}>×</button>
            </div>
          </div>
        ))}
        {list.length === 0 ? <small className="admin-field-help">No gallery images yet.</small> : null}
      </div>
      {canUpload ? (
        <label className="admin-input" style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", width: "fit-content" }}>
          <input type="file" accept="image/*" multiple disabled={uploading} onChange={onPick} style={{ display: "none" }} />
          <span>{uploading ? "Uploading…" : "+ Upload images"}</span>
        </label>
      ) : (
        <small className="admin-field-help">Create &amp; save the product first, then reopen it to add gallery images.</small>
      )}
      {error ? <small className="admin-field-help" style={{ color: "#c0392b" }}>{error}</small> : null}
      <small className="admin-field-help">Reorder with ← →, remove with ×. Changes save when you click Save.</small>
    </div>
  );
}

function CategoriesSelectField({ field, value, editor, setEditor, disabled }) {
  const [name, label] = field;
  const [allCategories, setAllCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const selected = Array.isArray(value) ? value.map(Number) : [];

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("enfhant-admin-token") : null;
    fetch("/api/admin/categories/?limit=200", {
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => r.json())
      .then((data) => {
        const results = Array.isArray(data) ? data : (data?.results || []);
        setAllCategories(results);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => {
    const numId = Number(id);
    const next = selected.includes(numId) ? selected.filter((x) => x !== numId) : [...selected, numId];
    setEditor({ ...editor, [name]: next });
  };

  return (
    <div className="admin-label full-width">
      <span style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 8 }}>{label}</span>
      {loading ? (
        <small className="admin-field-help">Loading categories…</small>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
          {allCategories.map((cat) => {
            const id = Number(cat.id);
            const checked = selected.includes(id);
            return (
              <label key={id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: disabled ? "default" : "pointer", fontSize: 13 }}>
                <input
                  type="checkbox"
                  className="admin-checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(id)}
                />
                {cat.name_en || cat.slug}
              </label>
            );
          })}
          {allCategories.length === 0 ? <small className="admin-field-help">No categories found.</small> : null}
        </div>
      )}
    </div>
  );
}

function RichTextEditor({ value, onChange, disabled }) {
  const ref = useRef(null);
  const initializedRef = useRef(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const savedRangeRef = useRef(null);

  useEffect(() => {
    if (ref.current && !initializedRef.current) {
      ref.current.innerHTML = value || "";
      initializedRef.current = true;
    }
  }, [value]);

  const exec = (cmd, arg = null) => {
    if (disabled) return;
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
    onChange(ref.current?.innerHTML || "");
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
  };

  const insertLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    restoreSelection();
    const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    exec("createLink", fullUrl);
    setLinkUrl("");
    setShowLinkInput(false);
  };

  return (
    <div className="richtext-wrapper">
      <div className="richtext-toolbar">
        <button type="button" className="richtext-btn" title="Bold" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}><strong>B</strong></button>
        <button type="button" className="richtext-btn" title="Italic" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}><em>I</em></button>
        <button type="button" className="richtext-btn" title="Underline" onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}><u>U</u></button>
        <button type="button" className="richtext-btn" title="Unordered list" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}>• List</button>
        <select
          className="richtext-size-select"
          title="Font size"
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { exec("fontSize", e.target.value); e.target.value = ""; }}
        >
          <option value="" disabled>Size</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Large</option>
          <option value="5">X-Large</option>
        </select>
        <button
          type="button"
          className={`richtext-btn${showLinkInput ? " richtext-btn--active" : ""}`}
          title="Insert hyperlink"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
            setShowLinkInput((v) => !v);
            setLinkUrl("");
          }}
        >🔗 Link</button>
        <button type="button" className="richtext-btn" title="Remove link" onMouseDown={(e) => { e.preventDefault(); exec("unlink"); }}>Unlink</button>
        <button type="button" className="richtext-btn" title="Clear formatting" onMouseDown={(e) => { e.preventDefault(); exec("removeFormat"); }}>Clear</button>
      </div>
      {showLinkInput && (
        <div className="richtext-link-row">
          <input
            className="admin-input richtext-link-input"
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertLink(); } if (e.key === "Escape") { setShowLinkInput(false); setLinkUrl(""); } }}
            autoFocus
          />
          <button type="button" className="admin-btn-sm admin-btn-primary" onClick={insertLink}>Insert</button>
          <button type="button" className="admin-btn-sm" onClick={() => { setShowLinkInput(false); setLinkUrl(""); }}>Cancel</button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!disabled}
        className="richtext-content"
        onInput={() => onChange(ref.current?.innerHTML || "")}
        suppressContentEditableWarning={true}
      />
    </div>
  );
}

function FormField({ field, value, editor, setEditor, mode, onGalleryUpload }) {
  const [name, label, type, options, config = {}] = field;
  const [objectPreviewUrl, setObjectPreviewUrl] = useState("");
  const disabled = Boolean(config?.disabled);
  const helpText = config?.helpText || "";

  useEffect(() => {
    if (!(value instanceof File)) {
      setObjectPreviewUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(value);
    setObjectPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [value]);

  const linkedUrlField = name.endsWith("_file") ? name.slice(0, -5) : "";
  const existingPreviewUrl = linkedUrlField ? String(editor?.[linkedUrlField] || "") : "";
  const previewUrl = objectPreviewUrl || existingPreviewUrl;
  const showImagePreview = Boolean(previewUrl && name.includes("image"));

  if (type === "categories-select") {
    return <CategoriesSelectField field={field} value={value} editor={editor} setEditor={setEditor} disabled={disabled} />;
  }
  if (type === "gallery") {
    return <GalleryManager field={field} value={value} editor={editor} setEditor={setEditor} mode={mode} onGalleryUpload={onGalleryUpload} />;
  }
  if (type === "option-groups") {
    return <OptionGroupsManager field={field} value={value} editor={editor} setEditor={setEditor} />;
  }
  if (type === "product-variants") {
    return <ProductVariantsManager field={field} value={value} editor={editor} setEditor={setEditor} onGalleryUpload={onGalleryUpload} />;
  }
  if (type === "checkbox") {
    return (
      <label className="admin-label admin-check-label">
        <input type="checkbox" className="admin-checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => setEditor({ ...editor, [name]: e.target.checked })} />
        <span>{label}</span>
        {helpText ? <small className="admin-field-help">{helpText}</small> : null}
      </label>
    );
  }
  if (type === "select") {
    return (
      <label className="admin-label">
        {label}
        <select className="admin-input" value={value || ""} disabled={disabled} onChange={(e) => setEditor({ ...editor, [name]: e.target.value })}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {helpText ? <small className="admin-field-help">{helpText}</small> : null}
      </label>
    );
  }
  if (type === "richtext") {
    return (
      <div className="admin-label full-width">
        <span className="admin-label-text">{label}</span>
        <RichTextEditor value={value || ""} disabled={disabled} onChange={(html) => setEditor({ ...editor, [name]: html })} />
        {helpText ? <small className="admin-field-help">{helpText}</small> : null}
      </div>
    );
  }
  if (type === "textarea" || type === "json") {
    return (
      <label className="admin-label full-width">
        {label}
        <textarea className="admin-input admin-textarea" value={value || ""} disabled={disabled} onChange={(e) => setEditor({ ...editor, [name]: e.target.value })} />
        {helpText ? <small className="admin-field-help">{helpText}</small> : null}
      </label>
    );
  }
  if (type === "file") {
    return (
      <label className="admin-label">
        {label}
        <input type="file" className="admin-input" accept="image/*" disabled={disabled} onChange={(e) => setEditor({ ...editor, [name]: e.target.files[0] })} />
        {value instanceof File ? <span className="admin-file-name">{value.name}</span> : null}
        {showImagePreview ? <img src={previewUrl} alt={`${label} preview`} className="admin-record-thumb" /> : null}
        {helpText ? <small className="admin-field-help">{helpText}</small> : null}
      </label>
    );
  }
  if (type === "combobox") {
    const listId = `datalist-${name}`;
    return (
      <label className="admin-label full-width">
        {label}
        <input
          list={listId}
          className="admin-input"
          value={value ?? ""}
          disabled={disabled}
          placeholder="Type a path or pick from suggestions…"
          onChange={(e) => setEditor({ ...editor, [name]: e.target.value })}
        />
        <datalist id={listId}>
          {(options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </datalist>
        {helpText ? <small className="admin-field-help">{helpText}</small> : null}
      </label>
    );
  }
  return (
    <label className="admin-label">
      {label}
      <input
        type={type}
        className="admin-input"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => setEditor({ ...editor, [name]: type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })}
      />
      {helpText ? <small className="admin-field-help">{helpText}</small> : null}
    </label>
  );
}

function getOrderStatusOptions(order, fallbackOptions = []) {
  const currentStatus = String(order?.status || "").trim().toLowerCase();
  const currentLabel = ORDER_STATUS_LABELS[currentStatus] || humanizeEnum(currentStatus) || "Current";
  const serverTransitions = Array.isArray(order?.allowed_status_transitions)
    ? order.allowed_status_transitions
    : null;
  const allowedTransitions = serverTransitions
    ? serverTransitions
    : (ORDER_STATUS_TRANSITIONS[currentStatus] || []).map((value) => ({
        value,
        label: ORDER_STATUS_LABELS[value] || humanizeEnum(value) || value,
      }));
  const nextOptions = allowedTransitions
    .map((item) => {
      const value = String(item?.value || item || "").trim().toLowerCase();
      if (!value || value === currentStatus) return null;
      return [value, item?.label || ORDER_STATUS_LABELS[value] || humanizeEnum(value) || value];
    })
    .filter(Boolean);
  const currentOption = currentStatus ? [[currentStatus, currentLabel]] : [];
  const merged = [...currentOption, ...nextOptions];
  return merged.length ? merged : fallbackOptions;
}

const ACCENT_LABELS = {
  gift: "Exclusive Offer",
  soft: "Best Seller",
  sets: "Curated Sets",
  moisture: "Top Rated",
  choice: "Mom's Favourite",
  relax: "Night Routine",
  new: "New Arrival",
  sun: "Daily Care",
};

function HeroCardPreview({ editor }) {
  const [filePreview, setFilePreview] = useState("");
  const prevUrlRef = useRef("");

  useEffect(() => {
    const file = editor?.image_file;
    if (!(file instanceof File)) {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = "";
      setFilePreview("");
      return;
    }
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    const url = URL.createObjectURL(file);
    prevUrlRef.current = url;
    setFilePreview(url);
    return () => {
      URL.revokeObjectURL(url);
      prevUrlRef.current = "";
    };
  }, [editor?.image_file]);

  const imageUrl = filePreview || editor?.image || "";
  const title    = editor?.title_en || editor?.title_ar || "Card title";
  const subtitle = editor?.subtitle_en || editor?.subtitle_ar || "";
  const cta      = editor?.cta_en || editor?.cta_ar || "";
  const size     = editor?.size || "small";
  const eyebrow  = editor?.eyebrow_en || editor?.eyebrow_ar || ACCENT_LABELS[editor?.accent] || "";

  return (
    <div className="admin-hero-preview">
      <p className="admin-hero-preview-label">Live Preview — {size === "large" ? "Large hero card" : "Small tile card"}</p>
      <div className={`admin-hero-preview-card ${size}`}>
        {imageUrl
          ? <img src={imageUrl} alt={title} />
          : <div className="admin-hero-preview-placeholder">No image set</div>}
        <div className="admin-hero-preview-copy">
          {eyebrow ? <span className="admin-hero-preview-eyebrow">{eyebrow}</span> : null}
          <h4>{title}</h4>
          {subtitle ? <p>{subtitle}</p> : null}
          {cta ? <span className="admin-hero-preview-cta">{cta}</span> : null}
        </div>
      </div>
      {editor?.href ? (
        <p className="admin-hero-preview-href">Destination: {editor.href}</p>
      ) : (
        <p className="admin-hero-preview-href admin-hero-preview-href--warn">No link set — card will fall back to /collections</p>
      )}
    </div>
  );
}
