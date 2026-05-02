"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const TOKEN_KEY = "enfhant-admin-token";
const REFRESH_KEY = "enfhant-admin-refresh";

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: "▦", endpoint: "/admin/dashboard/", description: "Manage your store's dashboard here." },
  { key: "analytics", label: "Analytics", icon: "▥", endpoint: "/admin/dashboard/", description: "Revenue, order mix, and live store signals." },
  { key: "customers", label: "Customers", icon: "♙", endpoint: "/admin/customers/", description: "Manage customer accounts and status." },
  { key: "products", label: "Products", icon: "◇", endpoint: "/admin/products/", description: "Create and edit product catalog records." },
  { key: "categories", label: "Categories", icon: "☰", endpoint: "/admin/categories/", description: "Manage storefront product categories." },
  { key: "deals", label: "Deals", icon: "✺", endpoint: "/admin/promotions/", description: "Manage coupons, free shipping, and promotions." },
  { key: "orders", label: "Orders", icon: "🛒", endpoint: "/admin/orders/", description: "Update order, payment, and tracking status." },
  { key: "payments", label: "Payments", icon: "▭", endpoint: "/admin/payments/", description: "Review payment transactions and provider status." },
  { key: "reviews", label: "Reviews", icon: "★", endpoint: "/admin/reviews/", description: "Approve, hide, or delete product reviews." },
  { key: "homepage", label: "Homepage", icon: "⌘", endpoint: "/admin/settings/", description: "Update storefront settings and homepage copy." },
  { key: "reports", label: "Reports", icon: "⇩", endpoint: "/admin/moderation/", description: "Download CSV exports and review operations health." },
];

const orderStatusOptions = [["pending", "Pending"], ["confirmed", "Confirmed"], ["preparing", "Preparing"], ["ready", "Ready"], ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]];
const paymentStatusOptions = [["unpaid", "Unpaid"], ["review", "Needs review"], ["paid", "Paid"], ["refunded", "Refunded"]];
const paymentMethodOptions = [["cod", "Cash on delivery"], ["whatsapp", "WhatsApp confirmation"], ["bank_transfer", "Bank transfer"], ["online", "Online payment"]];
const paymentProviderOptions = [["cod", "Cash on delivery"], ["whatsapp", "WhatsApp"], ["bank_transfer", "Bank transfer"], ["online", "Online"], ["stripe", "Stripe"], ["tap", "Tap"], ["paytabs", "PayTabs"], ["hyperpay", "HyperPay"], ["checkout_com", "Checkout.com"]];

const fieldConfigs = {
  products: [
    ["slug", "Slug", "text"],
    ["name_en", "Name EN", "text"],
    ["name_ar", "Name AR", "text"],
    ["brand", "Brand", "text"],
    ["unit", "Unit / weight", "text"],
    ["category", "Category ID", "number"],
    ["vendor_en", "Vendor EN", "text"],
    ["vendor_ar", "Vendor AR", "text"],
    ["short_description_en", "Short description EN", "textarea"],
    ["short_description_ar", "Short description AR", "textarea"],
    ["description_en", "Description EN", "textarea"],
    ["description_ar", "Description AR", "textarea"],
    ["ingredients_en", "Ingredients EN", "textarea"],
    ["ingredients_ar", "Ingredients AR", "textarea"],
    ["usage_instructions_en", "Usage EN", "textarea"],
    ["usage_instructions_ar", "Usage AR", "textarea"],
    ["origin_source_en", "Origin / source EN", "text"],
    ["origin_source_ar", "Origin / source AR", "text"],
    ["organic_certification_name", "Certification", "text"],
    ["dietary_tags", "Dietary tags JSON", "json"],
    ["shelf_life", "Shelf life", "text"],
    ["expiry_date", "Expiry date", "date"],
    ["details_en", "Details EN JSON", "json"],
    ["details_ar", "Details AR JSON", "json"],
    ["badge_en", "Badge EN", "text"],
    ["badge_ar", "Badge AR", "text"],
    ["review_count", "Review count", "number"],
    ["rating", "Rating", "number"],
    ["image", "Image URL", "text"],
    ["image_file", "Image File", "file"],
    ["hover_image", "Hover image URL", "text"],
    ["hover_image_file", "Hover Image File", "file"],
    ["gallery", "Gallery JSON", "json"],
    ["option_groups_en", "Options EN JSON", "json"],
    ["option_groups_ar", "Options AR JSON", "json"],
    ["stock_quantity", "Stock", "number"],
    ["track_inventory", "Track inventory", "checkbox"],
    ["show_in_new_arrivals", "New arrivals", "checkbox"],
    ["show_in_baby_sets", "Baby sets", "checkbox"],
    ["show_in_top_choices", "Top choices", "checkbox"],
    ["is_published", "Active", "checkbox"],
    ["is_featured", "Featured", "checkbox"],
    ["sort_order", "Sort order", "number"],
  ],
  categories: [
    ["slug", "Slug", "text"],
    ["name_en", "Name EN", "text"],
    ["name_ar", "Name AR", "text"],
    ["description_en", "Description EN", "textarea"],
    ["description_ar", "Description AR", "textarea"],
    ["image", "Image URL", "text"],
    ["image_file", "Image File", "file"],
    ["sort_order", "Sort order", "number"],
  ],
  deals: [
    ["code", "Code", "text"],
    ["description", "Description", "textarea"],
    ["discount_type", "Discount type", "select", [["percentage", "Percentage"], ["fixed", "Fixed amount"], ["free_shipping", "Free shipping"]]],
    ["value", "Value", "number"],
    ["minimum_subtotal", "Minimum subtotal", "number"],
    ["max_uses", "Usage limit", "number"],
    ["starts_at", "Starts at", "datetime-local"],
    ["ends_at", "Ends at", "datetime-local"],
    ["is_active", "Active", "checkbox"],
  ],
  orders: [
    ["status", "Order status", "select", orderStatusOptions],
    ["payment_method", "Payment method", "select", paymentMethodOptions],
    ["payment_status", "Payment status", "select", paymentStatusOptions],
    ["tracking_number", "Tracking number", "text"],
    ["tracking_url", "Tracking URL", "text"],
    ["notes", "Notes", "textarea"],
  ],
  payments: [
    ["order", "Order ID", "number"],
    ["provider", "Provider", "select", paymentProviderOptions],
    ["provider_reference", "Provider reference", "text"],
    ["amount", "Amount", "number"],
    ["currency_code", "Currency", "text"],
    ["status", "Payment status", "select", [["pending", "Pending"], ["authorized", "Authorized"], ["paid", "Paid"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["refunded", "Refunded"]]],
    ["raw_response", "Raw response JSON", "json"],
  ],
  customers: [
    ["username", "Username", "text"],
    ["email", "Email", "email"],
    ["password", "Password", "password"],
    ["first_name", "First name", "text"],
    ["last_name", "Last name", "text"],
    ["is_active", "Active", "checkbox"],
    ["is_staff", "Staff access", "checkbox"],
  ],
  reviews: [
    ["product", "Product ID", "number"],
    ["order", "Order ID", "number"],
    ["customer_name", "Customer name", "text"],
    ["rating", "Rating", "number"],
    ["title", "Title", "text"],
    ["comment", "Comment", "textarea"],
    ["is_verified_purchase", "Verified purchase", "checkbox"],
    ["is_approved", "Approved", "checkbox"],
  ],
  homepage: [
    ["brand_name", "Brand name", "text"],
    ["announcement_en", "Announcement EN", "text"],
    ["announcement_ar", "Announcement AR", "text"],
    ["footer_about_en", "Footer about EN", "textarea"],
    ["footer_about_ar", "Footer about AR", "textarea"],
    ["newsletter_title_en", "Newsletter title EN", "text"],
    ["newsletter_title_ar", "Newsletter title AR", "text"],
    ["newsletter_subtitle_en", "Newsletter subtitle EN", "textarea"],
    ["newsletter_subtitle_ar", "Newsletter subtitle AR", "textarea"],
    ["instagram_title_en", "Instagram title EN", "text"],
    ["instagram_title_ar", "Instagram title AR", "text"],
    ["instagram_cta_en", "Instagram CTA EN", "text"],
    ["instagram_cta_ar", "Instagram CTA AR", "text"],
    ["blog_title_en", "Blog title EN", "text"],
    ["blog_title_ar", "Blog title AR", "text"],
    ["free_gift_title_en", "Free gift title EN", "text"],
    ["free_gift_title_ar", "Free gift title AR", "text"],
    ["free_gift_subtitle_en", "Free gift subtitle EN", "textarea"],
    ["free_gift_subtitle_ar", "Free gift subtitle AR", "textarea"],
    ["why_choose_links", "Why choose links JSON", "json"],
    ["policy_links", "Policy links JSON", "json"],
    ["static_links", "Static links JSON", "json"],
  ],
};

const createDefaults = {
  products: { slug: "", name_en: "", name_ar: "", brand: "Enfant", unit: "", category: "", image: "", hover_image: "", dietary_tags: [], gallery: [], details_en: [], details_ar: [], option_groups_en: [], option_groups_ar: [], stock_quantity: 0, rating: 5, review_count: 0, track_inventory: false, is_published: true, is_featured: false, sort_order: 0 },
  categories: { slug: "", name_en: "", name_ar: "", description_en: "", description_ar: "", image: "", sort_order: 0 },
  deals: { code: "", description: "", discount_type: "fixed", value: 0, minimum_subtotal: 0, max_uses: "", starts_at: "", ends_at: "", is_active: true },
  customers: { username: "", email: "", password: "", first_name: "", last_name: "", is_active: true, is_staff: false },
  payments: { order: "", provider: "cod", provider_reference: "", amount: 0, currency_code: "OMR", status: "pending", raw_response: {} },
  reviews: { product: "", order: "", customer_name: "", rating: 5, title: "", comment: "", is_verified_purchase: false, is_approved: false },
};

const creatableKeys = ["products", "categories", "deals", "customers", "payments", "reviews"];
const deletableKeys = ["products", "categories", "deals", "customers", "payments", "reviews"];
const reportTypes = ["orders", "customers", "inventory", "low-stock"];

function titleFor(item, key) {
  return item?.order_number || item?.name_en || item?.code || item?.email || item?.username || item?.product_name || item?.provider_reference || item?.provider || `${key} item`;
}

function metaFor(item) {
  if (!item) return "";
  return item.customer_name || item.brand || item.status || item.payment_status || item.discount_type || item.currency_code || (item.is_approved === false ? "Pending moderation" : "Ready");
}

function labelForKey(key) {
  if (key === "deals") return "promotions";
  if (key === "homepage") return "settings";
  return key;
}

function statusTone(value = "") {
  const normalized = String(value).toLowerCase();
  if (["paid", "delivered", "active", "ready", "approved", "confirmed"].some((item) => normalized.includes(item))) return "success";
  if (["pending", "review", "preparing", "unpaid"].some((item) => normalized.includes(item))) return "warning";
  if (["cancelled", "failed", "inactive", "delete", "hidden"].some((item) => normalized.includes(item))) return "danger";
  return "neutral";
}

function stringifyValue(value, type) {
  if (type === "json") return typeof value === "string" ? value : JSON.stringify(value ?? [], null, 2);
  if (type === "datetime-local" && value) return String(value).slice(0, 16);
  if (type === "date" && value) return String(value).slice(0, 10);
  return value ?? "";
}

function fieldType(name, activeKey) {
  return (fieldConfigs[activeKey] || []).find(([fieldName]) => fieldName === name)?.[2];
}

function preparePayload(editor, activeKey) {
  const hasFile = Object.values(editor).some(v => v instanceof File);

  if (hasFile) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(editor)) {
      if (value === "" || value === null || value === undefined) continue;
      if (key === "password" && !value) continue;
      
      const type = fieldType(key, activeKey);
      if (type === "json") {
        formData.append(key, JSON.stringify(typeof value === "string" ? JSON.parse(value || "null") : value));
      } else if (value instanceof File) {
        formData.append(key, value);
      } else {
        formData.append(key, value);
      }
    }
    return formData;
  }

  const payload = {};
  for (const [key, value] of Object.entries(editor)) {
    const type = fieldType(key, activeKey);
    if (value === "" || value === null || value === undefined) continue;
    if (key === "password" && !value) continue;
    if (type === "json") {
      payload[key] = typeof value === "string" ? JSON.parse(value || "null") : value;
    } else {
      payload[key] = value;
    }
  }
  return payload;
}

export default function AdminPanelClient() {
  const [token, setToken] = useState("");
  const [login, setLogin] = useState({ username: "", password: "" });
  const [activeKey, setActiveKey] = useState("dashboard");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState({});
  const [mode, setMode] = useState("view");
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const active = navItems.find((item) => item.key === activeKey) || navItems[0];
  const canCreate = creatableKeys.includes(activeKey);
  const canDelete = deletableKeys.includes(activeKey);

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  }), [token]);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY) || "");
  }, []);

  useEffect(() => {
    if (token) loadScreen(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeKey]);

  async function request(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const requestHeaders = { ...headers, ...(options.headers || {}) };
    
    if (isFormData) {
      delete requestHeaders["Content-Type"];
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: requestHeaders,
    });
    if (response.status === 204) return null;
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(payload?.detail || JSON.stringify(payload) || "Request failed");
    return payload;
  }

  async function signIn(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "Login failed");
      window.localStorage.setItem(TOKEN_KEY, payload.access);
      window.localStorage.setItem(REFRESH_KEY, payload.refresh);
      setToken(payload.access);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const refresh = window.localStorage.getItem(REFRESH_KEY);
    if (refresh) {
      await fetch(`${API_BASE_URL}/auth/token/logout/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ refresh }),
      }).catch(() => {});
    }
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    setToken("");
    setData(null);
    closeForm();
  }

  async function loadScreen(screen = active) {
    setLoading(true);
    setMessage("");
    closeForm();
    try {
      setData(await request(screen.endpoint));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function detailPath(item = selected) {
    if (!item) return "";
    if (activeKey === "products") return `/admin/products/${item.slug}/`;
    if (activeKey === "categories") return `/admin/categories/${item.slug}/`;
    if (activeKey === "deals") return `/admin/promotions/${item.id}/`;
    if (activeKey === "orders") return `/admin/orders/${item.order_number}/`;
    if (activeKey === "payments") return `/admin/payments/${item.id}/`;
    if (activeKey === "customers") return `/admin/customers/${item.id}/`;
    if (activeKey === "reviews") return `/admin/reviews/${item.id}/`;
    return "";
  }

  async function openDetail(item) {
    setMode("edit");
    setSelected(item);
    setEditor(makeEditor(item));
    setFormOpen(true);
    const path = detailPath(item);
    if (!path) return;
    try {
      const payload = await request(path);
      setSelected(payload);
      setEditor(makeEditor(payload));
    } catch (error) {
      setMessage(error.message);
    }
  }

  function makeEditor(item, key = activeKey) {
    const output = {};
    (fieldConfigs[key] || []).forEach(([name, , type]) => {
      output[name] = type === "checkbox" ? Boolean(item?.[name]) : stringifyValue(item?.[name], type);
    });
    return output;
  }

  function startCreate() {
    setMode("create");
    setSelected(null);
    setEditor(makeEditor(createDefaults[activeKey] || {}, activeKey));
    setFormOpen(true);
  }

  function openHomepageSettings() {
    setMode("edit");
    setSelected(data || {});
    setEditor(makeEditor(data || {}, "homepage"));
    setFormOpen(true);
  }

  function closeForm() {
    setSelected(null);
    setEditor({});
    setMode("view");
    setFormOpen(false);
  }

  async function saveRecord() {
    setLoading(true);
    setMessage("");
    try {
      const path = mode === "create" ? active.endpoint : activeKey === "homepage" ? active.endpoint : detailPath();
      const method = mode === "create" ? "POST" : "PATCH";
      await request(path, { method, body: JSON.stringify(preparePayload(editor, activeKey)) });
      setMessage(mode === "create" ? "Created successfully." : "Saved successfully.");
      await loadScreen(active);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecord(item = selected) {
    if (!item || !canDelete) return;
    const confirmed = window.confirm(`Delete ${titleFor(item, activeKey)}? This cannot be undone.`);
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    try {
      await request(detailPath(item), { method: "DELETE" });
      setMessage("Deleted successfully.");
      await loadScreen(active);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport(type) {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/reports/${type}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Report download failed");
      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${type}.csv`;
      link.click();
      window.URL.revokeObjectURL(href);
    } catch (error) {
      setMessage(error.message);
    }
  }

  if (!token) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <p>Management Portal</p>
          <h1>EnfhantOrganic Admin</h1>
          <span>Secure staff access for store operations.</span>
          <form onSubmit={signIn} className="admin-form">
            <label>Username<input value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} /></label>
            <label>Password<input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
            {message ? <div className="admin-alert">{message}</div> : null}
            <button type="submit" className="admin-primary">{loading ? "Signing in..." : "Login"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-nav">
        <div className="admin-logo">
          <strong>EnfhantOrganic Admin</strong>
          <span>Management Portal</span>
        </div>
        <nav>
          {navItems.map((item) => (
            <button key={item.key} type="button" className={activeKey === item.key ? "active" : ""} onClick={() => setActiveKey(item.key)}>
              <span>{item.icon}</span>
              {item.label}
              {activeKey === item.key ? <b>›</b> : null}
            </button>
          ))}
        </nav>
        <button type="button" className="admin-logout" onClick={logout}>Logout</button>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <h1>{active.label}</h1>
            <p>{active.description}</p>
          </div>
          <div className="admin-user-card">
            <div>
              <strong>Admin User</strong>
              <span>Store Manager</span>
            </div>
            <b>A</b>
          </div>
        </header>

        {message ? <div className="admin-alert">{message}</div> : null}
        {loading ? <div className="admin-loading">Loading {active.label.toLowerCase()}...</div> : renderActive()}
      </section>

      {formOpen ? (
        <CrudFormModal
          activeKey={activeKey}
          mode={mode}
          selected={selected}
          editor={editor}
          setEditor={setEditor}
          canDelete={canDelete && mode === "edit"}
          onClose={closeForm}
          onSave={saveRecord}
          onDelete={() => deleteRecord(selected)}
        />
      ) : null}
    </main>
  );

  function renderActive() {
    if (activeKey === "dashboard" || activeKey === "analytics") return <Dashboard data={data} analytics={activeKey === "analytics"} />;
    if (activeKey === "reports") return <Reports data={data} onDownload={downloadReport} />;
    if (activeKey === "homepage") return <SettingsPanel data={data} onEdit={openHomepageSettings} />;

    return (
      <CrudPanel
        rows={Array.isArray(data) ? data : []}
        activeKey={activeKey}
        canCreate={canCreate}
        canDelete={canDelete}
        onCreate={startCreate}
        onEdit={openDetail}
        onDelete={deleteRecord}
      />
    );
  }
}

function Dashboard({ data, analytics }) {
  const metrics = [
    ["Total Revenue", `Rs. ${Number(data?.revenue || 0).toLocaleString()}`, "↗", "gold"],
    ["Monthly Revenue", `Rs. ${Number(data?.monthly_revenue || 0).toLocaleString()}`, "⌁", "green"],
    ["Total Orders", data?.orders ?? 0, "🛒", "blue"],
    ["Customers", data?.customers ?? 0, "♙", "violet"],
  ];

  return (
    <div className="admin-dashboard-view">
      <div className="admin-stat-grid">
        {metrics.map(([label, value, icon, tone]) => (
          <article className="admin-stat-card" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <p>Live store data</p>
            </div>
            <b className={`tone-${tone}`}>{icon}</b>
          </article>
        ))}
      </div>
      <div className="admin-chart-grid">
        <section className="admin-chart-card">
          <h2>{analytics ? "Revenue Analytics" : "Revenue Trend"}</h2>
          <RevenueChart values={data?.revenue_trend || []} />
        </section>
        <section className="admin-chart-card">
          <h2>Order Status Mix</h2>
          <DonutChart values={data?.status_mix || []} />
        </section>
      </div>
      <section className="admin-chart-card">
        <h2>Recent Orders</h2>
        <div className="admin-table-list compact">
          {(data?.recent_orders || []).length ? (data?.recent_orders || []).map((order) => (
            <div key={order.order_number} className="admin-record-row">
              <div>
                <strong>{order.order_number}</strong>
                <span>{order.customer_name} · {order.grand_total} {order.currency_code}</span>
              </div>
              <span className={`admin-status-badge ${statusTone(order.status)}`}>{order.status}</span>
            </div>
          )) : <AdminEmptyState label="orders" />}
        </div>
      </section>
    </div>
  );
}

function CrudPanel({ rows, activeKey, canCreate, canDelete, onCreate, onEdit, onDelete }) {
  const label = labelForKey(activeKey);

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h2>{activeKey === "deals" ? "Promotions" : activeKey}</h2>
          <span>{rows.length} record{rows.length === 1 ? "" : "s"}</span>
        </div>
        {canCreate ? <button type="button" onClick={onCreate}>+ Add {activeKey === "deals" ? "deal" : activeKey.slice(0, -1) || "record"}</button> : null}
      </div>
      <div className="admin-table-list admin-record-list">
        {rows.length ? (
          <>
            <div className="admin-list-head">
              <span>Record</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {rows.map((item) => {
              const meta = metaFor(item);
              return (
                <div key={item.id || item.slug || item.order_number || item.email} className="admin-record-row">
                  <button type="button" className="admin-record-main" onClick={() => onEdit(item)}>
                    <strong>{titleFor(item, activeKey)}</strong>
                    <span className="admin-record-subtitle">{item.email || item.customer_phone || item.currency_code || item.slug || "Tap to view details"}</span>
                  </button>
                  <span className={`admin-status-badge ${statusTone(meta)}`}>{meta}</span>
                  <div className="admin-row-actions">
                    <button type="button" onClick={() => onEdit(item)}>Edit</button>
                    {canDelete ? <button type="button" className="danger" onClick={() => onDelete(item)}>Delete</button> : null}
                  </div>
                </div>
              );
            })}
          </>
        ) : <AdminEmptyState label={label} />}
      </div>
    </section>
  );
}

function AdminEmptyState({ label }) {
  return (
    <div className="admin-empty">
      <strong>No {label} yet</strong>
      <span>When records are available, they will appear here with quick actions and status labels.</span>
    </div>
  );
}

function CrudFormModal({ activeKey, mode, selected, editor, setEditor, canDelete, onClose, onSave, onDelete }) {
  const fields = fieldConfigs[activeKey] || [];
  const title = mode === "create" ? `Add ${activeKey === "deals" ? "promotion" : activeKey.slice(0, -1) || "record"}` : titleFor(selected, activeKey);

  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="admin-modal-head">
          <div>
            <p>{mode === "create" ? "Create record" : "Edit record"}</p>
            <h2>{title}</h2>
            {selected ? <span>{metaFor(selected)}</span> : null}
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>Close</button>
        </div>

        {activeKey === "orders" && selected ? <OrderSnapshot order={selected} /> : null}

        <div className="admin-form admin-editor-form">
          {fields.map((field) => <Field key={field[0]} field={field} value={editor[field[0]]} editor={editor} setEditor={setEditor} />)}
          <div className="admin-editor-actions">
            <button type="button" className="admin-primary" onClick={onSave}>Save</button>
            {canDelete ? <button type="button" className="admin-danger" onClick={onDelete}>Delete</button> : null}
            <button type="button" className="admin-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function OrderSnapshot({ order }) {
  return (
    <div className="admin-order-snapshot">
      <div>
        <span>Customer</span>
        <strong>{order.customer_name || "-"}</strong>
        <p>{order.customer_email || order.customer_phone || "-"}</p>
      </div>
      <div>
        <span>Address</span>
        <strong>{order.city || "-"}</strong>
        <p>{[order.address_line_1, order.address_line_2, order.country].filter(Boolean).join(", ") || "-"}</p>
      </div>
      <div>
        <span>Shipping</span>
        <strong>{order.shipping_total} {order.currency_code}</strong>
        <p>Total: {order.grand_total} {order.currency_code}</p>
      </div>
      <div>
        <span>Status</span>
        <strong className={`admin-status-badge ${statusTone(order.status)}`}>{order.status || "-"}</strong>
        <p>Payment: {order.payment_status || "-"}</p>
      </div>
    </div>
  );
}

function Field({ field, value, editor, setEditor }) {
  const [name, label, type, options] = field;
  if (type === "checkbox") {
    return <label className="admin-check"><input type="checkbox" checked={Boolean(value)} onChange={(event) => setEditor({ ...editor, [name]: event.target.checked })} /> {label}</label>;
  }
  if (type === "select") {
    return (
      <label>{label}
        <select value={value || ""} onChange={(event) => setEditor({ ...editor, [name]: event.target.value })}>
          {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
        </select>
      </label>
    );
  }
  if (type === "textarea" || type === "json") {
    return <label>{label}<textarea value={value || ""} onChange={(event) => setEditor({ ...editor, [name]: event.target.value })} /></label>;
  }
  if (type === "file") {
    return (
      <label>{label}
        <input type="file" onChange={(event) => setEditor({ ...editor, [name]: event.target.files[0] })} />
        {value instanceof File ? <span className="admin-file-info">{value.name}</span> : null}
      </label>
    );
  }
  return (
    <label>{label}
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => setEditor({ ...editor, [name]: type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value })}
      />
    </label>
  );
}

function SettingsPanel({ data, onEdit }) {
  return (
    <section className="admin-panel-card admin-settings-card">
      <div className="admin-panel-head">
        <div>
          <h2>Homepage settings</h2>
          <span>Storefront content, footer copy, newsletter, and link groups.</span>
        </div>
        <button type="button" onClick={onEdit}>Edit settings</button>
      </div>
      <div className="admin-settings-preview">
        <strong>{data?.brand_name || "EnfhantOrganic"}</strong>
        <p>{data?.announcement_en || "No announcement configured."}</p>
        <p>{data?.newsletter_title_en || "Newsletter title not set."}</p>
      </div>
    </section>
  );
}

function Reports({ data, onDownload }) {
  return (
    <div className="admin-crud-grid">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h2>Reports</h2>
          <span>CSV exports</span>
        </div>
        <div className="admin-report-grid">
          {reportTypes.map((type) => <button key={type} type="button" onClick={() => onDownload(type)}>{type.replace("-", " ")}</button>)}
        </div>
      </section>
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h2>Push Notifications</h2>
          <span>Expo mobile app</span>
        </div>
        <div className="admin-push-list">
          <p>Active devices: <strong>{data?.active_push_devices ?? "-"}</strong></p>
          <p>Failures: <strong>{data?.notification_failures ?? "-"}</strong></p>
          <p>Events: new order, paid order, payment review needed, low stock alert.</p>
        </div>
      </section>
    </div>
  );
}

function RevenueChart({ values }) {
  const fallback = [{ label: "Feb 2026", value: 0 }, { label: "Mar 2026", value: 4200000 }, { label: "Apr 2026", value: 0 }];
  const points = values.length ? values : fallback;
  const max = Math.max(...points.map((item) => item.value), 1);
  const coords = points.map((item, index) => {
    const x = 40 + index * (300 / Math.max(points.length - 1, 1));
    const y = 180 - (item.value / max) * 150;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg className="admin-revenue-chart" viewBox="0 0 380 220" role="img">
      {[30, 80, 130, 180].map((y) => <line key={y} x1="38" x2="350" y1={y} y2={y} />)}
      <polyline points={coords} />
      <polygon points={`40,180 ${coords} 340,180`} />
      {points.map((item, index) => <text key={item.label} x={40 + index * (300 / Math.max(points.length - 1, 1))} y="205">{item.label}</text>)}
    </svg>
  );
}

function DonutChart({ values }) {
  const total = values.reduce((sum, item) => sum + item.count, 0) || 1;
  const colors = ["#f0a72f", "#93c83e", "#5fc16e", "#62b5e8", "#df5750", "#8a82ff"];
  let offset = 25;
  return (
    <svg className="admin-donut-chart" viewBox="0 0 220 220" role="img">
      <circle cx="110" cy="110" r="66" />
      {(values.length ? values : [{ status: "pending", count: 4 }, { status: "delivered", count: 2 }, { status: "confirmed", count: 1 }]).map((item, index) => {
        const length = (item.count / total) * 315;
        const circle = <circle key={item.status} cx="110" cy="110" r="66" style={{ stroke: colors[index % colors.length], strokeDasharray: `${length} 315`, strokeDashoffset: -offset }} />;
        offset += length;
        return circle;
      })}
      <text x="110" y="114">Orders</text>
    </svg>
  );
}
