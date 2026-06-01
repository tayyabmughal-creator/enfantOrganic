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

        {activeKey === "orders" && selected ? <OrderSnapshot order={selected} onDownloadInvoice={onDownloadInvoice} onRefundOrder={onRefundOrder} onCreateShipment={onCreateShipment} /> : null}
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

function OrderSnapshot({ order, onDownloadInvoice, onRefundOrder, onCreateShipment }) {
  const vatLabel = order.tax_label || "VAT";
  const vatRate = order.tax_rate ? `${(Number(order.tax_rate) * 100).toFixed(2)}%` : "0.00%";
  const cells = [
    ["Customer", order.customer_name || "—", order.customer_email || order.customer_phone || "—"],
    ["Address",  order.city || "—",          [order.address_line_1, order.address_line_2, order.country].filter(Boolean).join(", ") || "—"],
    [
      "Totals",
      `${order.subtotal} ${order.currency_code}`,
      `Shipping: ${order.shipping_total} ${order.currency_code} • ${vatLabel} (${vatRate}): ${order.tax_total || "0.00"} ${order.currency_code} • Grand total: ${order.grand_total} ${order.currency_code}`,
    ],
    ["Payment",  order.payment_status || "—", order.payment_method || "—"],
  ];
  return (
    <div className="admin-order-snapshot">
      {cells.map(([label, main, sub]) => (
        <div key={label} className="admin-snapshot-cell">
          <span>{label}</span>
          <strong>{main}</strong>
          <p>{sub}</p>
        </div>
      ))}
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
    </div>
  );
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
