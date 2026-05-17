import { AdminEmpty } from "./SharedUI";

const REPORT_TYPES = ["orders", "customers", "inventory", "sales", "abandoned-carts"];

const SOCIAL_INTEGRATIONS = [
  { name: "Facebook Commerce", abbr: "FB", color: "#1877f2", status: "available", desc: "Sync catalog to Instagram and FB Shops." },
  { name: "TikTok Pixel",      abbr: "TK", color: "#000",    status: "active",    desc: "Tracking pixel for TikTok campaigns." },
];
const MARKETING_INTEGRATIONS = [
  { name: "Google Analytics 4", abbr: "GA", color: "#fbbc05", status: "active",    desc: "Ecommerce conversion tracking." },
  { name: "Mailchimp",          abbr: "MC", color: "#ffe01b", iconColor: "#000", status: "available", desc: "Newsletter sync and automations." },
];
const APP_INTEGRATIONS = [
  { name: "Klaviyo",    abbr: "KV", color: "#1bd6af", status: "coming", desc: "Advanced email and SMS marketing." },
  { name: "Zapier",     abbr: "ZP", color: "#ff4a00", status: "available", desc: "Connect store events to 5,000+ apps." },
];

export function SettingsPanel({ data, onEdit, canEdit }) {
  const rows = [
    ["Brand name",            data?.brand_name             || "Enfant Organics"],
    ["Announcement (EN)",     data?.announcement_en        || "Not configured"],
    ["Newsletter title (EN)", data?.newsletter_title_en    || "Not configured"],
    ["Footer about (EN)",     data?.footer_about_en        || "Not configured"],
    ["Instagram title (EN)",  data?.instagram_title_en     || "Not configured"],
    ["Blog title (EN)",       data?.blog_title_en          || "Not configured"],
  ];
  return (
    <section className="admin-panel-card admin-settings-card">
      <div className="admin-panel-head">
        <div>
          <h3>Homepage Settings</h3>
          <span>Storefront content, footer, newsletter, and link groups.</span>
        </div>
        <button type="button" className="admin-btn-primary" onClick={onEdit} disabled={!canEdit}>
          {canEdit ? "Edit settings" : "View only"}
        </button>
      </div>
      <div className="admin-settings-preview">
        {rows.map(([label, val]) => (
          <div key={label} className="admin-settings-row">
            <strong>{label}</strong>
            <span>{val}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Reports({ data, onDownload }) {
  return (
    <div className="admin-reports">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>CSV Exports</h3>
          <span>Download reports as comma-separated files.</span>
        </div>
        <div className="admin-report-grid">
          {REPORT_TYPES.map((type) => (
            <button key={type} type="button" className="admin-report-btn" onClick={() => onDownload(type)}>
              <span className="admin-report-icon">⇩</span>
              <div>
                <strong>{type.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</strong>
                <span>Download as CSV</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Push Notifications</h3>
          <span>Expo mobile push delivery status.</span>
        </div>
        <div className="admin-push-stats">
          <div className="admin-push-row"><span>Active devices</span><strong>{data?.active_push_devices ?? "—"}</strong></div>
          <div className="admin-push-row"><span>Delivery failures</span><strong>{data?.notification_failures ?? "—"}</strong></div>
        </div>
        <div className="admin-push-events">
          <p className="admin-push-events-label">Tracked push events</p>
          {["New order placed","Order payment confirmed","Payment review needed","Low stock alert"].map((ev) => (
            <div key={ev} className="admin-push-event"><span className="admin-badge success">Active</span> {ev}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AuditLogsPanel({ rows }) {
  const formatAction = (value = "") => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const formatWhen = (value) => {
    if (!value) return "—";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString();
  };

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>Audit Logs</h3>
          <span>{rows.length} event{rows.length === 1 ? "" : "s"} tracked.</span>
        </div>
      </div>
      <div className="admin-record-list">
        {rows.length ? (
          <>
            <div className="admin-list-head"><span>Action</span><span>Actor</span><span>When</span></div>
            {rows.map((entry) => (
              <div key={entry.id} className="admin-record-row">
                <div className="admin-record-info">
                  <strong>{formatAction(entry.action || "")}</strong>
                  <span>
                    {entry.resource_type || "resource"}
                    {entry.resource_id ? ` · ${entry.resource_id}` : ""}
                    {entry.ip_address ? ` · ${entry.ip_address}` : ""}
                  </span>
                </div>
                <span className="admin-badge neutral">{entry.actor_name || "System"}</span>
                <span className="admin-badge">{formatWhen(entry.timestamp)}</span>
              </div>
            ))}
          </>
        ) : <AdminEmpty label="audit logs" />}
      </div>
    </section>
  );
}

export function IntegrationsHub({ title, integrations }) {
  return (
    <div className="admin-integrations">
      <p className="admin-int-note">Connect third-party platforms. Your developer handles the API keys — this panel shows connection status and configuration options.</p>
      <div className="admin-int-grid">
        {integrations.map((int) => (
          <article key={int.name} className="admin-int-card">
            <div className="admin-int-logo" style={{ background: int.color, color: int.iconColor || "#fff" }}>
              {int.abbr}
            </div>
            <div className="admin-int-info">
              <strong>{int.name}</strong>
              <p>{int.desc}</p>
            </div>
            <div className="admin-int-action">
              {int.status === "active"
                ? <span className="admin-badge success">Active</span>
                : int.status === "available"
                ? <button type="button" className="admin-btn-outline">Connect</button>
                : <span className="admin-badge neutral">Coming soon</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function InventoryView({ rows }) {
  const sorted   = [...rows].sort((a, b) => (a.stock_quantity || 0) - (b.stock_quantity || 0));
  const low      = sorted.filter((p) => (p.stock_quantity || 0) < 10 && (p.stock_quantity || 0) > 0 && p.track_inventory);
  const out      = sorted.filter((p) => (p.stock_quantity || 0) === 0 && p.track_inventory);
  const healthy  = sorted.filter((p) => (p.stock_quantity || 0) >= 10);

  return (
    <div className="admin-inventory">
      <div className="admin-kpi-grid four-col">
        <article className="admin-kpi-card"><span className="admin-kpi-label">Total SKUs</span><strong className="admin-kpi-value">{rows.length}</strong></article>
        <article className="admin-kpi-card kpi-success"><span className="admin-kpi-label">In Stock</span><strong className="admin-kpi-value">{healthy.length}</strong></article>
        <article className="admin-kpi-card kpi-warning"><span className="admin-kpi-label">Low Stock</span><strong className="admin-kpi-value">{low.length}</strong></article>
        <article className="admin-kpi-card kpi-danger"><span className="admin-kpi-label">Out of Stock</span><strong className="admin-kpi-value">{out.length}</strong></article>
      </div>

      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Stock Levels</h3>
          <span>{rows.length} products</span>
        </div>
        <div className="admin-inv-table">
          <div className="admin-inv-head">
            <span>Product</span><span>SKU</span><span>Qty</span><span>Status</span>
          </div>
          {sorted.map((p) => {
            const isLow = p.track_inventory && p.stock_quantity < 10 && p.stock_quantity > 0;
            const isOut = p.track_inventory && p.stock_quantity === 0;
            const status = isOut ? "Out of stock" : isLow ? "Low stock" : "In stock";
            const tone   = isOut ? "danger" : isLow ? "warning" : "success";
            return (
              <div key={p.slug} className="admin-inv-row">
                <div className="admin-inv-product">
                  {p.image ? <img src={p.image} alt="" /> : <div className="admin-inv-thumb-ph" />}
                  <strong>{p.name_en}</strong>
                </div>
                <span className="admin-inv-sku">{p.slug}</span>
                <span className="admin-inv-qty">{p.stock_quantity}</span>
                <span className={`admin-badge ${p.track_inventory ? tone : "neutral"}`}>{p.track_inventory ? status : "Untracked"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function InsightsView({ rows }) {
  const sorted = [...rows].sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0));
  const top10 = sorted.slice(0, 10);
  return (
    <div className="admin-insights">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Top Customers by Lifetime Value</h3>
          <span>Top 10 highest spending accounts.</span>
        </div>
        <div className="admin-record-list compact">
          {top10.length ? top10.map((c, i) => (
            <div key={c.email || i} className="admin-record-row">
              <div className="admin-record-info">
                <strong>{c.first_name} {c.last_name}</strong>
                <span>{c.email}</span>
              </div>
              <div className="admin-record-info" style={{ alignItems: "flex-end" }}>
                <strong>OMR {Number(c.total_spent || 0).toFixed(2)}</strong>
                <span>{c.orders_count || 0} orders</span>
              </div>
            </div>
          )) : <AdminEmpty label="customer data" />}
        </div>
      </section>
    </div>
  );
}

export function NewsletterPanel({ data }) {
  return (
    <div className="admin-newsletter">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Newsletter Subscribers</h3>
          <span>{Array.isArray(data) ? data.length : 0} active subscribers.</span>
        </div>
        <div className="admin-record-list">
          {Array.isArray(data) && data.length ? (
            data.map((sub, i) => (
              <div key={sub.email || i} className="admin-record-row">
                <div className="admin-record-info">
                  <strong>{sub.email}</strong>
                  <span>Subscribed: {new Date(sub.subscribed_at).toLocaleDateString()}</span>
                </div>
                <span className="admin-badge success">Active</span>
              </div>
            ))
          ) : <AdminEmpty label="subscribers" />}
        </div>
      </section>
    </div>
  );
}

export function PlaceholderModule({ config }) {
  return (
    <section className="admin-placeholder-card">
      <div className="admin-placeholder-icon">{config.icon}</div>
      <h2>{config.title}</h2>
      <p>{config.desc}</p>
      <ul className="admin-placeholder-features">
        {config.features.map((f) => (
          <li key={f}><span className="feature-check">✓</span>{f}</li>
        ))}
      </ul>
    </section>
  );
}
