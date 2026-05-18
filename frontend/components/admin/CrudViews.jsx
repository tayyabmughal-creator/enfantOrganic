import { useEffect, useState } from "react";
import { AdminEmpty, statusTone } from "./SharedUI";

// ─── Shared Utility Functions ────────────────────────────────────────────────
// Note: FIELD_CONFIGS and helpers must be exported from AdminPanelClient or passed as props.
// For simplicity, we assume they are passed as props or imported if needed.
// To keep it clean, we'll pass the specific field configs and helper functions as props.

export function CrudPanel({ rows, activeKey, canCreate, canEdit, canDelete, onCreate, onEdit, onDelete, onDownloadInvoice, titleFor, metaFor, labelFor, searchQuery, onSearchChange, page, totalPages, onPageChange }) {
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
      <div className="admin-record-list">
        {rows.length ? (
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
                    {activeKey === "orders" ? (
                      <>
                        <button type="button" className="admin-btn-sm" onClick={() => onDownloadInvoice(item)}>
                          Invoice
                        </button>
                      </>
                    ) : null}
                    {canDelete ? <button type="button" className="admin-btn-sm danger" onClick={() => onDelete(item)}>Delete</button> : null}
                  </div>
                </div>
              );
            })}
          </>
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

export function CrudFormModal({ activeKey, isSettings, mode, selected, editor, setEditor, canDelete, onClose, onSave, onDelete, onDownloadInvoice, onRefundOrder, onCreateShipment, onRefreshTracking, titleFor, metaFor, fields }) {
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

        {activeKey === "orders" && selected ? <OrderSnapshot order={selected} onDownloadInvoice={onDownloadInvoice} onRefundOrder={onRefundOrder} onCreateShipment={onCreateShipment} onRefreshTracking={onRefreshTracking} /> : null}

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

function OrderSnapshot({ order, onDownloadInvoice, onRefundOrder, onCreateShipment, onRefreshTracking }) {
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
        {onRefreshTracking ? (
          <button type="button" className="admin-btn-sm" onClick={() => onRefreshTracking(order)}>
            Refresh Tracking
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
        <input type="file" className="admin-input" onChange={(e) => setEditor({ ...editor, [name]: e.target.files[0] })} />
        {value instanceof File ? <span className="admin-file-name">{value.name}</span> : null}
        {showImagePreview ? <img src={previewUrl} alt={`${label} preview`} className="admin-record-thumb" /> : null}
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
