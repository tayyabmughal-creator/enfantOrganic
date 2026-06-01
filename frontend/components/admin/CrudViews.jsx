import { useEffect, useRef, useState } from "react";
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
  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>{activeKey === "deals" ? "Promotions" : activeKey === "blog" ? "Blog Articles" : activeKey.charAt(0).toUpperCase() + activeKey.slice(1)}</h3>
          <span>{rows.length} record{rows.length === 1 ? "" : "s"}{totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}</span>
        </div>
        {canCreate ? (
          <button type="button" className="admin-btn-primary" onClick={onCreate}>
            + {activeKey === "blog" ? "New article" : `Add ${activeKey === "deals" ? "deal" : activeKey.slice(0, -1)}`}
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
      {activeKey === "orders" && orderFilters && onOrderFiltersChange ? (
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
          activeKey === "orders" ? (
            <OrdersTable rows={rows} canEdit={canEdit} onEdit={onEdit} onDownloadInvoice={onDownloadInvoice} />
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

function OrdersTable({ rows, canEdit, onEdit, onDownloadInvoice }) {
  const [selectedOrders, setSelectedOrders] = useState(new Set());
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

  return (
    <div className="admin-orders-table-wrap">
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
            <th>Order number</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Fulfilled by / Market</th>
            <th>Channel</th>
            <th>Total</th>
            <th>Payment status</th>
            <th>Fulfillment status</th>
            <th>Items</th>
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
                <td>
                  {canEdit ? (
                    <button type="button" className="admin-order-link" onClick={() => onEdit(order)}>
                      {orderNumber || "—"}
                    </button>
                  ) : (
                    <span className="admin-order-text">{orderNumber || "—"}</span>
                  )}
                </td>
                <td>{formatOrderDate(order.created_at)}</td>
                <td>
                  <div className="admin-order-customer">
                    <strong>{order.customer_name || "Guest"}</strong>
                    <span>{order.customer_phone || order.customer_email || "—"}</span>
                  </div>
                </td>
                <td>
                  <div className="admin-order-market">
                    <strong>{carrierLabel}</strong>
                    <span>{marketLabel}</span>
                  </div>
                </td>
                <td>{channelLabel}</td>
                <td className="admin-order-total">{formatOrderTotal(order)}</td>
                <td>
                  <span className={`admin-badge ${statusTone(paymentStatus)}`}>
                    {PAYMENT_STATUS_LABELS[paymentStatus] || "—"}
                  </span>
                </td>
                <td>
                  <span className={`admin-badge ${shipmentStatusTone(shipmentStatus)}`}>
                    {SHIPMENT_STATUS_LABELS[shipmentStatus] || "—"}
                  </span>
                </td>
                <td>{itemsCount} {itemsCount === 1 ? "item" : "items"}</td>
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

export function CrudFormModal({ activeKey, isSettings, mode, selected, editor, setEditor, canDelete, onClose, onSave, onDelete, onDownloadInvoice, onRefundOrder, onCreateShipment, titleFor, metaFor, fields }) {
  const title  = mode === "create"
    ? `Add ${activeKey === "deals" ? "promotion" : activeKey === "blog" ? "article" : activeKey.replace(/_/g, " ")}`
    : (titleFor ? titleFor(selected, activeKey) : "Edit");

  const eyebrow = isSettings ? "Store settings" : mode === "create" ? "Create record" : "Edit record";

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="admin-modal-head">
          <div>
            <p className="admin-modal-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            {!isSettings && selected && metaFor ? <span className="admin-modal-meta">{metaFor(selected, activeKey)}</span> : null}
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {activeKey === "orders" && selected ? <OrderDetailLayout order={selected} onDownloadInvoice={onDownloadInvoice} onRefundOrder={onRefundOrder} onCreateShipment={onCreateShipment} /> : null}
        {activeKey === "hero_cards" ? <HeroCardPreview editor={editor} /> : null}

        <div className="admin-modal-form">
          {(fields || []).map((field) => (
            <FormField key={field[0]} field={field} value={editor[field[0]]} editor={editor} setEditor={setEditor} />
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

function OrderDetailLayout({ order, onDownloadInvoice, onRefundOrder, onCreateShipment }) {
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

  return (
    <div className="admin-order-detail-grid">
      <section className="admin-order-detail-col">
        <article className="admin-order-card">
          <div className="admin-order-card-head">
            <h3>Order Items</h3>
            <span>{items.length} line{items.length === 1 ? "" : "s"}</span>
          </div>
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
                    <span>{formatMoney(item.unit_price, currencyCode)} × {Number(item.quantity || 0)}</span>
                    <strong>{formatMoney(item.line_total, currencyCode)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-order-empty">No order items are available for this record.</p>
          )}
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

function FormField({ field, value, editor, setEditor }) {
  const [name, label, type, options] = field;
  const [objectPreviewUrl, setObjectPreviewUrl] = useState("");

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

  if (type === "checkbox") {
    return (
      <label className="admin-label admin-check-label">
        <input type="checkbox" className="admin-checkbox" checked={Boolean(value)} onChange={(e) => setEditor({ ...editor, [name]: e.target.checked })} />
        <span>{label}</span>
      </label>
    );
  }
  if (type === "select") {
    return (
      <label className="admin-label">
        {label}
        <select className="admin-input" value={value || ""} onChange={(e) => setEditor({ ...editor, [name]: e.target.value })}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    );
  }
  if (type === "textarea" || type === "json") {
    return (
      <label className="admin-label full-width">
        {label}
        <textarea className="admin-input admin-textarea" value={value || ""} onChange={(e) => setEditor({ ...editor, [name]: e.target.value })} />
      </label>
    );
  }
  if (type === "file") {
    return (
      <label className="admin-label">
        {label}
        <input type="file" className="admin-input" accept="image/*" onChange={(e) => setEditor({ ...editor, [name]: e.target.files[0] })} />
        {value instanceof File ? <span className="admin-file-name">{value.name}</span> : null}
        {showImagePreview ? <img src={previewUrl} alt={`${label} preview`} className="admin-record-thumb" /> : null}
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
          placeholder="Type a path or pick from suggestions…"
          onChange={(e) => setEditor({ ...editor, [name]: e.target.value })}
        />
        <datalist id={listId}>
          {(options || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </datalist>
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
        onChange={(e) => setEditor({ ...editor, [name]: type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })}
      />
    </label>
  );
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
  const eyebrow  = ACCENT_LABELS[editor?.accent] || editor?.accent || "";

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
