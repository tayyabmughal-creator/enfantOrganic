"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AdminEmpty } from "./SharedUI";

const REPORT_TYPES = ["orders", "customers", "inventory", "sales", "abandoned-carts", "cost-of-goods"];
const COGS_DATE_RANGES = [
  ["previous_month", "Previous month"],
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["month_to_date", "Month to date"],
  ["all", "All time"],
  ["custom", "Custom dates"],
];

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

function SettingsCard({ title, subtitle, onEdit, canEdit, children }) {
  return (
    <section className="admin-panel-card admin-settings-card">
      <div className="admin-panel-head">
        <div>
          <h3>{title}</h3>
          <span>{subtitle}</span>
        </div>
        <button type="button" className="admin-btn-primary" onClick={onEdit} disabled={!canEdit}>
          {canEdit ? "Edit" : "View only"}
        </button>
      </div>
      <div className="admin-settings-preview">{children}</div>
    </section>
  );
}

function SettingsRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="admin-settings-row">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function ColorSwatch({ label, color }) {
  if (!color) return null;
  return (
    <div className="admin-settings-row">
      <strong>{label}</strong>
      <span className="admin-color-swatch-row">
        <span className="admin-color-swatch" style={{ background: color }} />
        {color}
      </span>
    </div>
  );
}

function SocialRow({ label, url }) {
  if (!url) return null;
  return (
    <div className="admin-settings-row">
      <strong>{label}</strong>
      <a href={url} target="_blank" rel="noopener noreferrer" className="admin-settings-link">{url}</a>
    </div>
  );
}

function LinkListPreview({ links }) {
  if (!Array.isArray(links) || !links.length) return <span className="admin-settings-empty">No links configured</span>;
  return (
    <div className="admin-link-preview-list">
      {links.slice(0, 6).map((item, i) => (
        <div key={i} className="admin-link-preview-item">
          <span className="admin-link-label">{item.label_en || item.label || "—"}</span>
          <span className="admin-link-href">{item.href || "—"}</span>
        </div>
      ))}
      {links.length > 6 && <span className="admin-settings-empty">+{links.length - 6} more</span>}
    </div>
  );
}

export function StoreSettingsSection({ section, data, onEdit, canEdit }) {
  if (section === "inventory_settings") {
    return (
      <SettingsCard title="Inventory Settings" subtitle="Restock alert rules used by the dashboard and daily email." onEdit={onEdit} canEdit={canEdit}>
        <SettingsRow label="Inventory health threshold" value={`${Number(data?.inventory_low_stock_threshold ?? 10)} units`} />
        <SettingsRow label="Admin email recipient" value={data?.contact_email || "Contact email is not set"} />
      </SettingsCard>
    );
  }

  if (section === "branding") {
    return (
      <SettingsCard title="Branding & Identity" subtitle="Store logo, name, colors, and tagline." onEdit={onEdit} canEdit={canEdit}>
        {data?.logo_url && (
          <div className="admin-settings-row admin-logo-preview-row">
            <strong>Logo</strong>
            <img src={data.logo_url} alt="Logo" className="admin-logo-preview" />
          </div>
        )}
        <SettingsRow label="Brand name" value={data?.brand_name} />
        <SettingsRow label="Tagline (EN)" value={data?.tagline_en} />
        <SettingsRow label="Tagline (AR)" value={data?.tagline_ar} />
        <SettingsRow label="Logo URL" value={data?.logo_url || "Not set — using default"} />
        <SettingsRow label="Favicon URL" value={data?.favicon_url || "Not set"} />
        <ColorSwatch label="Primary color" color={data?.primary_color} />
        <ColorSwatch label="Accent color" color={data?.accent_color} />
      </SettingsCard>
    );
  }

  if (section === "nav_settings") {
    return (
      <SettingsCard title="Navigation Links" subtitle="Header navigation and footer utility links." onEdit={onEdit} canEdit={canEdit}>
        <div className="admin-settings-group-label">Main nav links (JSON format: label_en, label_ar, href)</div>
        <LinkListPreview links={data?.nav_links} />
        <div className="admin-settings-group-label" style={{ marginTop: 12 }}>Static / utility links</div>
        <LinkListPreview links={data?.static_links} />
      </SettingsCard>
    );
  }

  if (section === "footer_social") {
    return (
      <div className="admin-settings-multi">
        <SettingsCard title="Footer Content" subtitle="Footer description, copyright, and policy links." onEdit={onEdit} canEdit={canEdit}>
          <SettingsRow label="Footer about (EN)" value={data?.footer_about_en} />
          <SettingsRow label="Footer about (AR)" value={data?.footer_about_ar} />
          <SettingsRow label="Copyright (EN)" value={data?.copyright_en} />
          <SettingsRow label="Copyright (AR)" value={data?.copyright_ar} />
          <div className="admin-settings-group-label" style={{ marginTop: 12 }}>Policy links</div>
          <LinkListPreview links={data?.policy_links} />
          <div className="admin-settings-group-label" style={{ marginTop: 12 }}>Why choose us links</div>
          <LinkListPreview links={data?.why_choose_links} />
        </SettingsCard>
        <SettingsCard title="Social Media & Contact" subtitle="Social URLs, WhatsApp, email, phone, and address." onEdit={onEdit} canEdit={canEdit}>
          <SocialRow label="Facebook" url={data?.facebook_url} />
          <SocialRow label="Instagram" url={data?.instagram_url} />
          <SocialRow label="Twitter / X" url={data?.twitter_url} />
          <SocialRow label="YouTube" url={data?.youtube_url} />
          <SocialRow label="TikTok" url={data?.tiktok_url} />
          <SettingsRow label="WhatsApp number" value={data?.whatsapp_number} />
          <SettingsRow label="Contact email" value={data?.contact_email} />
          <SettingsRow label="Contact phone" value={data?.contact_phone} />
          <SettingsRow label="Address (EN)" value={data?.address_en} />
          <SettingsRow label="Address (AR)" value={data?.address_ar} />
        </SettingsCard>
      </div>
    );
  }

  if (section === "seo_legal") {
    return (
      <div className="admin-settings-multi">
        <SettingsCard title="SEO Settings" subtitle="Global meta title, description, and Open Graph image." onEdit={onEdit} canEdit={canEdit}>
          <SettingsRow label="SEO title (EN)" value={data?.seo_title_en} />
          <SettingsRow label="SEO title (AR)" value={data?.seo_title_ar} />
          <SettingsRow label="SEO description (EN)" value={data?.seo_description_en} />
          <SettingsRow label="SEO description (AR)" value={data?.seo_description_ar} />
          <SettingsRow label="OG image URL" value={data?.og_image_url} />
        </SettingsCard>
        <SettingsCard title="Legal Pages" subtitle="Return policy, privacy policy, and terms content." onEdit={onEdit} canEdit={canEdit}>
          <SettingsRow label="Return policy (EN)" value={data?.return_policy_en ? `${data.return_policy_en.slice(0, 120)}…` : "Not configured"} />
          <SettingsRow label="Return policy (AR)" value={data?.return_policy_ar ? `${data.return_policy_ar.slice(0, 120)}…` : "Not configured"} />
          <SettingsRow label="Privacy policy (EN)" value={data?.privacy_policy_en ? `${data.privacy_policy_en.slice(0, 120)}…` : "Not configured"} />
          <SettingsRow label="Privacy policy (AR)" value={data?.privacy_policy_ar ? `${data.privacy_policy_ar.slice(0, 120)}…` : "Not configured"} />
        </SettingsCard>
      </div>
    );
  }

  // Default: homepage / content sections
  return (
    <SettingsCard title="Content Sections" subtitle="Announcement, newsletter, Instagram, blog, and free gift sections." onEdit={onEdit} canEdit={canEdit}>
      <SettingsRow label="Announcement (EN)" value={data?.announcement_en} />
      <SettingsRow label="Announcement (AR)" value={data?.announcement_ar} />
      <SettingsRow label="Newsletter title (EN)" value={data?.newsletter_title_en} />
      <SettingsRow label="Newsletter subtitle (EN)" value={data?.newsletter_subtitle_en} />
      <SettingsRow label="Instagram title (EN)" value={data?.instagram_title_en} />
      <SettingsRow label="Blog title (EN)" value={data?.blog_title_en} />
      <SettingsRow label="Free gift title (EN)" value={data?.free_gift_title_en} />
    </SettingsCard>
  );
}

export function SettingsPanel({ data, onEdit, canEdit }) {
  return <StoreSettingsSection section="homepage" data={data} onEdit={onEdit} canEdit={canEdit} />;
}

export function Reports({ data, onDownload, onPreview, request }) {
  const [cogsRange, setCogsRange] = useState("previous_month");
  const [cogsStart, setCogsStart] = useState("");
  const [cogsEnd, setCogsEnd] = useState("");
  const [cogsPreview, setCogsPreview] = useState(null);
  const [cogsLoading, setCogsLoading] = useState(false);
  const [cogsError, setCogsError] = useState("");
  const [costFixBusy, setCostFixBusy] = useState(false);
  const [costFixNote, setCostFixNote] = useState("");
  const [cogsSearch, setCogsSearch] = useState("");
  const [cogsSort, setCogsSort] = useState({ key: "units_sold", dir: -1 });
  const COGS_NUM_KEYS = useMemo(
    () => new Set(["units_sold", "revenue", "avg_unit_cost", "cost_of_goods", "gross_profit", "stock_left"]),
    [],
  );
  const visibleCogsRows = useMemo(() => {
    const rows = Array.isArray(cogsPreview?.rows) ? [...cogsPreview.rows] : [];
    const q = cogsSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter((row) =>
          `${row.product_name || row.product_slug || ""} ${row.sku || ""} ${row.variant || ""}`
            .toLowerCase()
            .includes(q))
      : rows;
    const { key, dir } = cogsSort;
    return filtered.sort((a, b) => {
      if (COGS_NUM_KEYS.has(key)) {
        return ((Number(a[key]) || 0) - (Number(b[key]) || 0)) * dir;
      }
      return String(a[key] || "").localeCompare(String(b[key] || "")) * dir;
    });
  }, [cogsPreview, cogsSearch, cogsSort, COGS_NUM_KEYS]);
  const toggleCogsSort = useCallback((key) => {
    setCogsSort((prev) => (prev.key === key ? { key, dir: prev.dir * -1 } : { key, dir: -1 }));
  }, []);
  const renderStockBadge = (stock) => {
    if (stock === null || stock === undefined) return <span className="admin-cogs-stock">—</span>;
    const count = Number(stock) || 0;
    const tone = count <= 0 ? "is-out" : count <= 15 ? "is-low" : "is-ok";
    return <span className={`admin-cogs-stock ${tone}`}>{count <= 0 ? "Out" : count}</span>;
  };
  const buildCogsParams = useCallback(() => {
    const params = { date_range: cogsRange };
    if (cogsRange === "custom") {
      if (cogsStart) params.start_date = cogsStart;
      if (cogsEnd) params.end_date = cogsEnd;
    }
    return params;
  }, [cogsEnd, cogsRange, cogsStart]);
  const downloadCogs = () => {
    const params = buildCogsParams();
    onDownload("cost-of-goods", params);
  };
  const loadCogsPreview = useCallback(async () => {
    if (typeof onPreview !== "function") return;
    setCogsLoading(true);
    setCogsError("");
    try {
      const payload = await onPreview("cost-of-goods", { ...buildCogsParams(), limit: 20 });
      setCogsPreview(payload);
    } catch (error) {
      setCogsError(error?.message || "Preview unavailable");
    } finally {
      setCogsLoading(false);
    }
  }, [buildCogsParams, onPreview]);
  useEffect(() => {
    loadCogsPreview();
  }, [loadCogsPreview]);
  // Entering a cost price only affects sales made from that moment on, because
  // the cost is snapshotted onto the order. This prices up the sales that were
  // already on the books when the cost was finally filled in.
  const fixMissingCosts = useCallback(async () => {
    if (typeof request !== "function") return;
    setCostFixBusy(true);
    setCostFixNote("");
    try {
      const body = {};
      if (cogsRange === "custom") {
        if (cogsStart) body.start_date = cogsStart;
        if (cogsEnd) body.end_date = cogsEnd;
      }
      const result = await request("/admin/reports/cogs/resync/", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const parts = [`${result?.updated ?? 0} sale line(s) priced from the current cost.`];
      if (result?.still_missing) {
        parts.push(`${result.still_missing} still have no cost — set a cost price on the products listed above.`);
      }
      setCostFixNote(parts.join(" "));
      await loadCogsPreview();
    } catch (error) {
      setCostFixNote(error?.message || "Could not fill in the missing costs.");
    } finally {
      setCostFixBusy(false);
    }
  }, [cogsEnd, cogsRange, cogsStart, loadCogsPreview, request]);
  const cogsTotals = Array.isArray(cogsPreview?.totals_by_currency) ? cogsPreview.totals_by_currency : [];
  const cogsConverted = cogsPreview?.converted_total || null;
  const productsMissingCost = Array.isArray(cogsPreview?.products_missing_cost)
    ? cogsPreview.products_missing_cost
    : [];
  return (
    <div className="admin-reports">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>CSV Exports</h3>
          <span>Download reports as comma-separated files.</span>
        </div>
        <div className="admin-report-grid">
          {REPORT_TYPES.map((type) => (
            <button key={type} type="button" className="admin-report-btn" onClick={() => type === "cost-of-goods" ? downloadCogs() : onDownload(type)}>
              <span className="admin-report-icon">⇩</span>
              <div>
                <strong>{type.replaceAll("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</strong>
                <span>Download as CSV</span>
              </div>
            </button>
          ))}
        </div>
        <div className="admin-report-filters">
          <label>
            <span>COGS date range</span>
            <select value={cogsRange} onChange={(event) => setCogsRange(event.target.value)}>
              {COGS_DATE_RANGES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {cogsRange === "custom" ? (
            <>
              <label>
                <span>Start date</span>
                <input type="date" value={cogsStart} onChange={(event) => setCogsStart(event.target.value)} />
              </label>
              <label>
                <span>End date</span>
                <input type="date" value={cogsEnd} onChange={(event) => setCogsEnd(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
        <div className="admin-cogs-preview">
          <div className="admin-panel-head admin-panel-head-compact">
            <div>
              <h3>Inventory Sold &amp; Cost of Goods</h3>
              <span>
                {cogsPreview?.include_unpaid === false
                  ? "Paid orders only · excludes cancelled, failed and refunded"
                  : "Every placed order including cash on delivery · excludes cancelled, failed and refunded"}
                {" · totalled separately per currency"}
                <br />
                <strong>Product revenue only</strong> — what the items sold for.
                The Dashboard shows order revenue, which also adds shipping and
                VAT and takes off discounts, so the two figures differ by design.
              </span>
            </div>
            <div className="admin-cogs-actions">
              <button type="button" className="admin-btn-sm" onClick={fixMissingCosts} disabled={costFixBusy || cogsLoading}>
                {costFixBusy ? "Filling in…" : "Fill in missing costs"}
              </button>
              <button type="button" className="admin-btn-sm" onClick={loadCogsPreview} disabled={cogsLoading}>
                {cogsLoading ? "Loading" : "Recalculate"}
              </button>
            </div>
          </div>
          {cogsError ? <div className="admin-form-error">{cogsError}</div> : null}
          {costFixNote ? <div className="admin-form-note">{costFixNote}</div> : null}
          {productsMissingCost.length ? (
            <div className="admin-cogs-warning">
              <strong>{productsMissingCost.length} product{productsMissingCost.length === 1 ? " has" : "s have"} no cost price.</strong>{" "}
              Their profit cannot be worked out until you set one under Products → Cost price:{" "}
              {productsMissingCost.map((item) => item.name).join(", ")}
            </div>
          ) : null}
          {cogsTotals.length ? (
            <div className="admin-cogs-currency-totals">
              <div className="admin-cogs-stat">
                <span className="admin-cogs-stat-label">Orders included</span>
                <span className="admin-cogs-stat-value">{cogsPreview.orders_included ?? "—"}</span>
              </div>
              {cogsTotals.map((bucket) => (
                <div key={bucket.currency} className="admin-cogs-currency-block">
                  <div className="admin-cogs-currency-head">
                    {bucket.currency}
                    {bucket.estimated_cost ? <span className="admin-badge warning">Some costs estimated</span> : null}
                    {bucket.missing_cost ? <span className="admin-badge danger">Cost missing</span> : null}
                  </div>
                  <div className="admin-cogs-summary">
                    <div className="admin-cogs-stat">
                      <span className="admin-cogs-stat-label">Units sold</span>
                      <span className="admin-cogs-stat-value">{bucket.units_sold}</span>
                    </div>
                    <div className="admin-cogs-stat">
                      <span className="admin-cogs-stat-label">Product revenue</span>
                      <span className="admin-cogs-stat-value">{bucket.revenue} {bucket.currency}</span>
                    </div>
                    <div className="admin-cogs-stat">
                      <span className="admin-cogs-stat-label">Cost of goods</span>
                      <span className="admin-cogs-stat-value">{bucket.cost_of_goods} {bucket.currency}</span>
                    </div>
                    <div className="admin-cogs-stat is-accent">
                      <span className="admin-cogs-stat-label">Gross profit</span>
                      <span className="admin-cogs-stat-value">{bucket.gross_profit} {bucket.currency}</span>
                    </div>
                  </div>
                </div>
              ))}
              {cogsTotals.length > 1 && cogsConverted ? (
                <div className="admin-cogs-currency-block is-converted">
                  <div className="admin-cogs-currency-head">
                    All markets, converted to {cogsConverted.currency}
                    <span className="admin-cogs-rate-note">
                      {Object.entries(cogsConverted.rates || {})
                        .map(([code, rate]) => `1 ${code} = ${Number(rate).toFixed(4)} ${cogsConverted.currency}`)
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="admin-cogs-summary">
                    <div className="admin-cogs-stat">
                      <span className="admin-cogs-stat-label">Product revenue</span>
                      <span className="admin-cogs-stat-value">{cogsConverted.revenue} {cogsConverted.currency}</span>
                    </div>
                    <div className="admin-cogs-stat">
                      <span className="admin-cogs-stat-label">Cost of goods</span>
                      <span className="admin-cogs-stat-value">{cogsConverted.cost_of_goods} {cogsConverted.currency}</span>
                    </div>
                    <div className="admin-cogs-stat is-accent">
                      <span className="admin-cogs-stat-label">Gross profit</span>
                      <span className="admin-cogs-stat-value">{cogsConverted.gross_profit} {cogsConverted.currency}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="admin-cogs-toolbar">
            <input
              type="search"
              className="admin-cogs-search"
              placeholder="Search product or SKU…"
              value={cogsSearch}
              onChange={(event) => setCogsSearch(event.target.value)}
            />
            <span className="admin-cogs-rowcount">
              {visibleCogsRows.length} product{visibleCogsRows.length === 1 ? "" : "s"}
            </span>
          </div>
          {!cogsError && cogsLoading ? <div className="admin-list-empty">Loading COGS preview…</div> : null}
          {!cogsError && !cogsLoading && visibleCogsRows.length ? (
            <div className="admin-orders-table-wrap admin-cogs-table-wrap">
              <table className="admin-orders-table admin-cogs-table">
                <thead>
                  <tr>
                    {[
                      ["product_name", "Product"],
                      ["sku", "SKU"],
                      ["variant", "Variant"],
                      ["stock_left", "Stock left"],
                      ["units_sold", "Units sold"],
                      ["revenue", "Product revenue"],
                      ["avg_unit_cost", "Cost / unit"],
                      ["cost_of_goods", "Total cost"],
                      ["gross_profit", "Gross profit"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        className={`admin-cogs-th${cogsSort.key === key ? " is-active" : ""}`}
                        onClick={() => toggleCogsSort(key)}
                      >
                        {label}
                        <span className="admin-cogs-arrow">
                          {cogsSort.key === key ? (cogsSort.dir === 1 ? "▲" : "▼") : "▾"}
                        </span>
                      </th>
                    ))}
                    <th>Cost data</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCogsRows.map((row) => (
                    <tr key={`${row.product_slug}-${row.sku}-${row.variant}-${row.currency}`}>
                      <td>{row.product_name || row.product_slug}</td>
                      <td>{row.sku || "—"}</td>
                      <td>{row.variant || "—"}</td>
                      <td>{renderStockBadge(row.stock_left)}</td>
                      <td>{row.units_sold}</td>
                      <td>{row.revenue} {row.currency}</td>
                      <td>{row.avg_unit_cost}</td>
                      <td>{row.cost_of_goods} {row.currency}</td>
                      <td>{row.gross_profit} {row.currency}</td>
                      <td>
                        {row.missing_cost ? (
                          <span className="admin-badge danger">Missing</span>
                        ) : row.estimated_cost ? (
                          <span className="admin-badge warning" title="Filled in from the product's current cost price, not captured at the time of sale">
                            Estimated
                          </span>
                        ) : (
                          <span className="admin-badge success">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* One total per currency. OMR, AED and SAR are different units
                      of account, so a single combined figure would be meaningless. */}
                  {cogsTotals.map((bucket) => (
                    <tr key={bucket.currency} className="admin-cogs-total-row">
                      <td colSpan={4}>Total · {bucket.currency}</td>
                      <td>{bucket.units_sold}</td>
                      <td>{bucket.revenue} {bucket.currency}</td>
                      <td>{bucket.avg_unit_cost}</td>
                      <td>{bucket.cost_of_goods} {bucket.currency}</td>
                      <td>{bucket.gross_profit} {bucket.currency}</td>
                      <td>{bucket.missing_cost ? <span className="admin-badge danger">Missing</span> : <span className="admin-badge success">OK</span>}</td>
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          ) : null}
          {!cogsError && !cogsLoading && !visibleCogsRows.length ? (
            <div className="admin-list-empty">
              {cogsSearch ? "No products match your search." : "No order items found for this range."}
            </div>
          ) : null}
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

export function AuditLogsPanel({ rows, filters = {}, onFiltersChange }) {
  const [openId, setOpenId] = useState(null);

  const formatAction = (value = "") => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const formatWhen = (value) => {
    if (!value) return "—";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString();
  };

  function renderDiff(before = {}, after = {}) {
    const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changed = allKeys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (!changed.length) return <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No field changes recorded.</p>;
    return (
      <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--border)" }}>Field</th>
            <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--danger)" }}>Before</th>
            <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--success)" }}>After</th>
          </tr>
        </thead>
        <tbody>
          {changed.map((k) => (
            <tr key={k}>
              <td style={{ padding: "3px 8px", fontWeight: 600 }}>{k}</td>
              <td style={{ padding: "3px 8px", color: "var(--danger)" }}>{JSON.stringify(before[k]) ?? "—"}</td>
              <td style={{ padding: "3px 8px", color: "var(--success)" }}>{JSON.stringify(after[k]) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const actionFilter = filters.action || "";
  const resourceFilter = filters.resource_type || "";

  const uniqueActions = [...new Set(rows.map((r) => r.action).filter(Boolean))].sort();
  const uniqueResources = [...new Set(rows.map((r) => r.resource_type).filter(Boolean))].sort();

  const filtered = rows.filter((r) => {
    if (actionFilter && r.action !== actionFilter) return false;
    if (resourceFilter && r.resource_type !== resourceFilter) return false;
    return true;
  });

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>Audit Logs</h3>
          <span>{filtered.length} of {rows.length} event{rows.length === 1 ? "" : "s"}</span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <select
            className="admin-select-sm"
            value={actionFilter}
            onChange={(e) => onFiltersChange?.({ action: e.target.value })}
          >
            <option value="">All actions</option>
            {uniqueActions.map((a) => <option key={a} value={a}>{formatAction(a)}</option>)}
          </select>
          <select
            className="admin-select-sm"
            value={resourceFilter}
            onChange={(e) => onFiltersChange?.({ resource_type: e.target.value })}
          >
            <option value="">All resources</option>
            {uniqueResources.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {(actionFilter || resourceFilter) && (
            <button type="button" className="admin-btn-sm" onClick={() => onFiltersChange?.({ action: "", resource_type: "" })}>
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="admin-record-list">
        {filtered.length ? (
          <>
            <div className="admin-list-head"><span>Action</span><span>Actor</span><span>When</span><span /></div>
            {filtered.map((entry) => (
              <div key={entry.id}>
                <div className="admin-record-row" style={{ cursor: "pointer" }} onClick={() => setOpenId(openId === entry.id ? null : entry.id)}>
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
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{openId === entry.id ? "▲" : "▼"}</span>
                </div>
                {openId === entry.id && (
                  <div style={{ padding: "12px 16px", background: "var(--surface-alt, #f9f9f9)", borderTop: "1px solid var(--border)" }}>
                    {renderDiff(entry.before_snapshot || {}, entry.after_snapshot || {})}
                  </div>
                )}
              </div>
            ))}
          </>
        ) : <AdminEmpty label="audit logs" />}
      </div>
    </section>
  );
}

// ─── Integration catalogue ────────────────────────────────────────────────────

const INTEGRATIONS_BY_CATEGORY = {
  social: [
    {
      id: "facebook",
      name: "Meta / Facebook",
      abbr: "f",
      color: "#1877F2",
      desc: "Facebook Pixel for event tracking, Facebook Shops catalog sync, and dynamic product ads targeting. The Conversions API sends the same events from our server, so they survive ad blockers and iOS tracking prevention.",
      fields: [
        { key: "facebook_pixel_id", label: "Pixel ID",         placeholder: "123456789012345",  hint: "Events Manager → Pixels → your pixel ID" },
        { key: "facebook_app_id",   label: "App ID (optional)", placeholder: "987654321012345", hint: "Meta App Dashboard → App settings → Basic" },
        { key: "meta_capi_enabled", label: "Conversions API — send server-side events", type: "toggle", hint: "Turn on once the access token below is saved. Events are deduplicated against the browser Pixel by event ID." },
        { key: "meta_capi_access_token", label: "Conversions API Access Token", type: "password", placeholder: "EAAG...", hint: "Events Manager → your dataset → Settings → Conversions API → Generate access token" },
        { key: "meta_capi_dataset_id", label: "Dataset ID (optional)", placeholder: "Same as Pixel ID", hint: "Leave blank to reuse the Pixel ID above — only set this if Meta split your dataset from the pixel" },
        { key: "meta_capi_test_event_code", label: "Test Event Code", placeholder: "TEST12345", hint: "While this is set, events only appear in Events Manager → Test Events and do NOT count as real conversions. CLEAR IT to go live. Meta issues a new code each time you open the Test Events tab." },
      ],
    },
    {
      id: "tiktok",
      name: "TikTok",
      abbr: "T",
      color: "#010101",
      desc: "TikTok Pixel for campaign conversion tracking and Shopping product catalog integration.",
      fields: [
        { key: "tiktok_pixel_id", label: "Pixel ID", placeholder: "BQJKE9NV7255UB0B1E7G", hint: "TikTok Ads Manager → Assets → Events → Web Events → your pixel name → ID column (20-char alphanumeric)" },
      ],
    },
    {
      id: "instagram",
      name: "Instagram Shopping",
      abbr: "◉",
      color: "#C13584",
      desc: "Tag products in posts and stories via your Meta Business catalog. Requires Facebook Pixel to be connected first.",
      fields: [
        { key: "instagram_catalog_id",  label: "Catalog ID",           placeholder: "123456789012345", hint: "Meta Business Manager → Catalogs → your catalog ID" },
        { key: "instagram_business_id", label: "Business Account ID",  placeholder: "987654321012345", hint: "Meta Business Manager → Business settings → Business info" },
      ],
    },
    {
      id: "snapchat",
      name: "Snapchat",
      abbr: "S",
      color: "#FFFC00",
      iconColor: "#111",
      desc: "Snap Pixel for Dynamic Ads and conversion tracking across Snapchat campaigns.",
      fields: [
        { key: "snapchat_pixel_id", label: "Pixel ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", hint: "Snap Ads Manager → Events Manager → Web Pixel" },
      ],
    },
    {
      id: "pinterest",
      name: "Pinterest",
      abbr: "P",
      color: "#E60023",
      desc: "Pinterest Tag for Product Pins, organic catalog discovery, and Promoted Pin conversions.",
      fields: [
        { key: "pinterest_tag_id", label: "Tag ID", placeholder: "1234567890123", hint: "Pinterest Ads → Conversions → Pinterest tag" },
      ],
    },
    {
      id: "twitter",
      name: "Twitter / X",
      abbr: "X",
      color: "#000",
      desc: "Twitter Pixel for conversion tracking and Dynamic Shopping Ad audiences.",
      fields: [
        { key: "twitter_pixel_id", label: "Pixel ID", placeholder: "o7ab1", hint: "X Ads → Tools → Conversion tracking → Website tag → 5-char ID (e.g. o7ab1)" },
      ],
    },
  ],
  marketing_tools: [
    {
      id: "ga4",
      name: "Google Analytics 4",
      abbr: "GA",
      color: "#E37400",
      desc: "Full GA4 e-commerce tracking: purchases, checkout funnels, product views, and custom event attribution.",
      fields: [
        { key: "google_analytics_id", label: "Measurement ID", placeholder: "G-XXXXXXXXXX", hint: "GA4 → Admin → Data Streams → Web stream details" },
      ],
    },
    {
      id: "gtm",
      name: "Google Tag Manager",
      abbr: "GTM",
      color: "#4285F4",
      desc: "Centralise all tag management. GTM loads GA4, Ads, and other pixels from a single container.",
      fields: [
        { key: "google_tag_manager_id", label: "Container ID", placeholder: "GTM-XXXXXXX", hint: "GTM workspace → Admin → Container settings" },
      ],
    },
    {
      id: "google_ads",
      name: "Google Ads",
      abbr: "Ads",
      color: "#34A853",
      desc: "Conversion tracking and remarketing audience sync for Google Search, Shopping, and Display campaigns.",
      fields: [
        { key: "google_ads_id", label: "Conversion ID", placeholder: "AW-123456789", hint: "Google Ads → Tools → Measurement → Conversion tracking → Tag setup → Global site tag → AW- followed by 9–10 digits" },
      ],
    },
    {
      id: "klaviyo",
      name: "Klaviyo",
      abbr: "K",
      color: "#2D2D2D",
      desc: "Advanced email flows, SMS sequences, abandoned cart recovery, and behavioural customer segments.",
      fields: [
        { key: "klaviyo_public_key", label: "Public API Key", placeholder: "XXXXXX", hint: "Klaviyo → Account → Settings → API keys — use Public key only" },
      ],
    },
    {
      id: "mailchimp",
      name: "Mailchimp",
      abbr: "M",
      color: "#FFE01B",
      iconColor: "#1F1F1F",
      desc: "Email campaigns, list management, newsletter automation, and abandoned cart sequences.",
      fields: [
        { key: "mailchimp_api_key", label: "API Key",     placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-usX", hint: "Mailchimp → Account → Extras → API keys — 32 hex chars + datacenter suffix (e.g. -us4). The -usX suffix is mandatory." },
        { key: "mailchimp_list_id", label: "Audience ID", placeholder: "a1b2c3d4e5", hint: "Mailchimp → Audience → Settings → Audience name and defaults → Audience ID" },
      ],
    },
    {
      id: "whatsapp",
      name: "WhatsApp Business API",
      abbr: "W",
      color: "#25D366",
      desc: "Automated order confirmations, shipping updates, and abandoned cart recovery via WhatsApp Cloud API.",
      fields: [
        { key: "whatsapp_api_token",       label: "Cloud API Token",    placeholder: "EAAxxxxxxxxxxxxxxx", hint: "Meta for Developers → your app → WhatsApp → API Setup → Temporary / Permanent token" },
        { key: "whatsapp_phone_number_id", label: "Phone Number ID",    placeholder: "123456789012345",   hint: "Meta for Developers → your app → WhatsApp → API Setup → Phone Number ID" },
      ],
    },
    {
      id: "zendesk",
      name: "Zendesk",
      abbr: "Z",
      color: "#03363D",
      desc: "Customer support ticketing, live chat, and helpdesk integration for post-purchase queries.",
      fields: [
        { key: "zendesk_subdomain", label: "Subdomain",  placeholder: "mystore",                                            hint: "Your Zendesk URL: https://{subdomain}.zendesk.com" },
        { key: "zendesk_api_key",   label: "API Token",  placeholder: "6wiIBWbGkBMo1mRDMuVwkw1EPsNkeUj95PIz2akv", hint: "Zendesk Admin → Apps & integrations → APIs → Zendesk API → API tokens → Add API token (~40 chars)" },
      ],
    },
  ],
  apps: [
    {
      id: "expo_push",
      name: "Expo Push Notifications",
      abbr: "E",
      color: "#000020",
      desc: "Mobile push for order updates, payment confirmations, restock alerts, and promotional campaigns. Fully active.",
      alwaysActive: true,
      fields: [],
    },
    {
      id: "cloudinary",
      name: "Cloudinary",
      abbr: "CL",
      color: "#3448C5",
      desc: "Auto-optimised image CDN with format conversion (WebP/AVIF), lazy loading, and responsive transformations.",
      fields: [
        { key: "cloudinary_cloud_name", label: "Cloud Name", placeholder: "my-store",    hint: "Cloudinary Dashboard → top-left cloud name" },
        { key: "cloudinary_api_key",    label: "API Key",    placeholder: "123456789012345", hint: "Cloudinary Dashboard → Settings → Access Keys (API Key — not Secret)" },
      ],
    },
    {
      id: "algolia",
      name: "Algolia Search",
      abbr: "Al",
      color: "#003DFF",
      desc: "Instant search with typo tolerance, faceting, and personalisation — replaces the default product search.",
      fields: [
        { key: "algolia_app_id",     label: "Application ID",    placeholder: "XXXXXXXXXX", hint: "Algolia Dashboard → Settings → API Keys → Application ID" },
        { key: "algolia_search_key", label: "Search-Only API Key", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", hint: "Algolia Dashboard → Settings → API Keys → Search-Only API Key (never Admin key)" },
      ],
    },
    {
      id: "zapier",
      name: "Zapier",
      abbr: "ZP",
      color: "#FF4A00",
      desc: "Trigger Zaps on order events — push to Google Sheets, Slack, Airtable, Notion, and 5,000+ other apps.",
      fields: [
        { key: "zapier_order_webhook", label: "Order Webhook URL", placeholder: "https://hooks.zapier.com/hooks/catch/1234567/abc1def2/", hint: "Zapier → Create Zap → Trigger: Webhooks by Zapier → Catch Hook → copy URL (format: /catch/{userID}/{hookID}/)" },
      ],
    },
    {
      id: "stripe",
      name: "Stripe",
      abbr: "S",
      color: "#635BFF",
      desc: "Online payment processing with cards, Apple Pay, Google Pay, and BNPL options.",
      fields: [
        { key: "stripe_publishable_key", label: "Publishable Key", placeholder: "pk_live_51xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", hint: "Stripe Dashboard → Developers → API keys → Publishable key — starts with pk_live_ (never paste the sk_live_ Secret key)" },
      ],
    },
    {
      id: "shippo",
      name: "Shippo",
      abbr: "Sh",
      color: "#16283C",
      desc: "Multi-carrier label printing, live rate comparison, and real-time tracking for all outbound shipments.",
      fields: [
        { key: "shippo_api_token", label: "API Token", placeholder: "shippo_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", hint: "Shippo Dashboard → API → API Keys → Live Token" },
      ],
    },
  ],
};

const CATEGORY_META = {
  social:          { title: "Social Media",    subtitle: "Pixels and catalog connections for social platforms." },
  marketing_tools: { title: "Marketing Tools", subtitle: "Analytics, ads, and email marketing integrations." },
  apps:            { title: "App Store",        subtitle: "Platform extensions, push, and fulfilment services." },
};

export function IntegrationsView({ category, data, canEdit, onPatch }) {
  const [expanding, setExpanding] = useState(null);
  const [form, setForm]           = useState({});
  const [saving, setSaving]       = useState(false);

  const integrations = INTEGRATIONS_BY_CATEGORY[category] || [];
  const meta         = CATEGORY_META[category] || {};

  function isConnected(integration) {
    if (integration.alwaysActive) return true;
    if (!integration.fields?.length) return false;
    return integration.fields.some((f) => Boolean(data?.[f.key]));
  }

  function openConfigure(integration) {
    if (expanding === integration.id) { closeForm(); return; }
    setExpanding(integration.id);
    const initial = {};
    (integration.fields || []).forEach((f) => { initial[f.key] = data?.[f.key] || ""; });
    setForm(initial);
  }

  function closeForm() {
    setExpanding(null);
    setForm({});
  }

  async function saveFields(integration) {
    setSaving(true);
    try {
      const fields = {};
      (integration.fields || []).forEach((f) => {
        // Toggles must stay booleans — coercing false to "" makes the API
        // reject the save instead of turning the feature off.
        fields[f.key] = f.type === "toggle" ? Boolean(form[f.key]) : form[f.key] || "";
      });
      await onPatch(fields);
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(integration) {
    if (!window.confirm(`Disconnect ${integration.name}? Saved credentials will be cleared.`)) return;
    setSaving(true);
    try {
      const fields = {};
      (integration.fields || []).forEach((f) => {
        fields[f.key] = f.type === "toggle" ? false : "";
      });
      // A blank never erases a stored secret (the API preserves it), so ask
      // explicitly — otherwise "Disconnect" would leave the token behind.
      (integration.fields || [])
        .filter((f) => f.type === "password")
        .forEach((f) => { fields[`clear_${f.key}`] = true; });
      await onPatch(fields);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-integrations-view">
      <div className="admin-iv-header">
        <div>
          <h2 className="admin-iv-title">{meta.title}</h2>
          <p className="admin-iv-sub">{meta.subtitle}</p>
        </div>
        <p className="admin-iv-note">
          API keys and pixel IDs are stored in your site settings. Enter only public-facing keys — never paste secret keys or private tokens.
        </p>
      </div>

      <div className="admin-iv-list">
        {integrations.map((integration) => {
          const connected  = isConnected(integration);
          const isExpanded = expanding === integration.id;
          const hasFields  = Boolean(integration.fields?.length);
          const isActive   = integration.alwaysActive;
          const isSoon     = integration.comingSoon;

          return (
            <article
              key={integration.id}
              className={`admin-iv-card${connected ? " connected" : ""}${isExpanded ? " expanded" : ""}`}
            >
              {/* ── Main row ── */}
              <div className="admin-iv-main">
                <div
                  className="admin-iv-logo"
                  style={{ background: integration.color, color: integration.iconColor || "#fff" }}
                >
                  {integration.abbr}
                </div>

                <div className="admin-iv-body">
                  <div className="admin-iv-name-row">
                    <strong>{integration.name}</strong>
                    {isActive  && <span className="admin-iv-chip active">Active</span>}
                    {connected && !isActive && <span className="admin-iv-chip connected">Connected</span>}
                    {!connected && !isActive && !isSoon && <span className="admin-iv-chip idle">Not connected</span>}
                    {isSoon    && <span className="admin-iv-chip soon">Coming soon</span>}
                  </div>
                  <p className="admin-iv-desc">{integration.desc}</p>
                </div>

                {!isSoon && !isActive && hasFields && canEdit && (
                  <div className="admin-iv-actions">
                    {connected ? (
                      <>
                        <button
                          type="button"
                          className={`admin-btn-sm${isExpanded ? " active-outline" : ""}`}
                          onClick={() => openConfigure(integration)}
                        >
                          {isExpanded ? "Cancel" : "Edit"}
                        </button>
                        <button
                          type="button"
                          className="admin-btn-sm danger"
                          onClick={() => disconnect(integration)}
                          disabled={saving}
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="admin-btn-primary"
                        style={{ minHeight: 36, padding: "0 16px", fontSize: 13 }}
                        onClick={() => openConfigure(integration)}
                      >
                        {isExpanded ? "Cancel" : "Connect"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Inline config form ── */}
              {isExpanded && hasFields && (
                <div className="admin-iv-form">
                  <div className="admin-iv-form-fields">
                    {integration.fields.map((field) => (
                      <label key={field.key} className="admin-iv-field">
                        <span className="admin-iv-field-label">{field.label}</span>
                        {field.type === "toggle" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(form[field.key])}
                            onChange={(e) => setForm({ ...form, [field.key]: e.target.checked })}
                            style={{ width: 16, height: 16, alignSelf: "flex-start" }}
                          />
                        ) : (
                          <input
                            type={field.type === "password" ? "password" : "text"}
                            className="admin-input"
                            value={form[field.key] || ""}
                            // A stored secret is never sent back to the browser,
                            // so show that one is saved instead of an empty box
                            // the client might mistake for "not configured".
                            placeholder={
                              field.type === "password" && form[`${field.key}_set`]
                                ? "•••••••• saved — type to replace"
                                : field.placeholder
                            }
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                          />
                        )}
                        {field.hint && <span className="admin-iv-field-hint">↗ {field.hint}</span>}
                      </label>
                    ))}
                  </div>
                  <div className="admin-iv-form-actions">
                    <button
                      type="button"
                      className="admin-btn-primary"
                      style={{ minHeight: 38, padding: "0 20px", fontSize: 13 }}
                      onClick={() => saveFields(integration)}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : connected ? "Save changes" : `Connect ${integration.name}`}
                    </button>
                    <button type="button" className="admin-btn-secondary" style={{ minHeight: 38, padding: "0 16px", fontSize: 13 }} onClick={closeForm}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function IntegrationsHub({ title, integrations }) {
  return (
    <div className="admin-integrations">
      <p className="admin-int-note">Connect third-party platforms.</p>
      <div className="admin-int-grid">
        {integrations.map((int) => (
          <article key={int.name} className="admin-int-card">
            <div className="admin-int-logo" style={{ background: int.color, color: int.iconColor || "#fff" }}>{int.abbr}</div>
            <div className="admin-int-info"><strong>{int.name}</strong><p>{int.desc}</p></div>
            <div className="admin-int-action">
              {int.status === "active" ? <span className="admin-badge success">Active</span>
               : int.status === "available" ? <button type="button" className="admin-btn-outline">Connect</button>
               : <span className="admin-badge neutral">Coming soon</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function inventoryHealthStatus(product, threshold = 10) {
  const qty = Number(product?.stock_quantity || 0);
  if (!product?.track_inventory) return { label: "Untracked", tone: "neutral", priority: 3 };
  if (qty <= 0) return { label: "Out of Stock", tone: "danger", priority: 0 };
  if (qty <= 5) return { label: "Critical", tone: "critical", priority: 1 };
  if (qty <= threshold) return { label: "Low Stock", tone: "warning", priority: 2 };
  return { label: "In Stock", tone: "success", priority: 3 };
}

const INV_TABS = [
  { key: "stock", label: "Stock Levels" },
  { key: "warehouse", label: "Warehouse View" },
  { key: "demand", label: "Demand Alerts" },
];

export function InventoryView({ rows, threshold = 10, focusProductSlug = "", warehouseStocks = [], warehouses = [], demandAlerts = [], onSaveStock }) {
  const [activeTab, setActiveTab] = useState("stock");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [stockSaving, setStockSaving] = useState(false);
  const [stockError, setStockError] = useState("");
  const numericThreshold = Number(threshold || 10);
  const sorted = [...rows].sort((a, b) => {
    const aStatus = inventoryHealthStatus(a, numericThreshold);
    const bStatus = inventoryHealthStatus(b, numericThreshold);
    return (
      aStatus.priority - bStatus.priority ||
      Number(a.stock_quantity || 0) - Number(b.stock_quantity || 0) ||
      String(a.name_en || "").localeCompare(String(b.name_en || ""))
    );
  });
  const out = sorted.filter((p) => inventoryHealthStatus(p, numericThreshold).label === "Out of Stock");
  const critical = sorted.filter((p) => inventoryHealthStatus(p, numericThreshold).label === "Critical");
  const low = sorted.filter((p) => inventoryHealthStatus(p, numericThreshold).label === "Low Stock");
  const healthy = sorted.filter((p) => inventoryHealthStatus(p, numericThreshold).label === "In Stock");
  const selectedStock = warehouseStocks.find((s) => (
    String(s.warehouse) === String(selectedWarehouseId)
    && String(s.product) === String(selectedProductId)
  ));
  const selectedProduct = rows.find((p) => String(p.id) === String(selectedProductId));
  const selectedWarehouse = warehouses.find((w) => String(w.id) === String(selectedWarehouseId));

  useEffect(() => {
    if (!selectedStock?.id) {
      setStockQuantity("");
      return;
    }
    setStockQuantity(String(selectedStock.quantity ?? 0));
  }, [selectedStock?.id, selectedStock?.quantity]);

  useEffect(() => {
    if (!focusProductSlug) return;
    const escapedSlug = window.CSS?.escape ? window.CSS.escape(focusProductSlug) : focusProductSlug.replace(/"/g, '\\"');
    const target = document.querySelector(`[data-product-slug="${escapedSlug}"]`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusProductSlug, sorted.length]);

  const demandStatusTone = (status) => {
    if (status === "notified") return "success";
    if (status === "pending") return "warning";
    return "neutral";
  };

  return (
    <div className="admin-inventory">
      <div className="admin-kpi-grid four-col">
        <article className="admin-kpi-card"><span className="admin-kpi-label">Total SKUs</span><strong className="admin-kpi-value">{rows.length}</strong></article>
        <article className="admin-kpi-card kpi-success"><span className="admin-kpi-label">In Stock</span><strong className="admin-kpi-value">{healthy.length}</strong></article>
        <article className="admin-kpi-card kpi-warning"><span className="admin-kpi-label">Low Stock</span><strong className="admin-kpi-value">{low.length}</strong></article>
        <article className="admin-kpi-card kpi-danger"><span className="admin-kpi-label">Critical / Out</span><strong className="admin-kpi-value">{critical.length + out.length}</strong></article>
      </div>

      <div className="admin-inv-tabs">
        {INV_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`admin-inv-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.key === "demand" && demandAlerts.length > 0 && (
              <span className="admin-inv-tab-badge">{demandAlerts.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "stock" && (
        <section className="admin-panel-card">
          <div className="admin-panel-head">
            <h3>Stock Levels</h3>
            <span>{rows.length} products · threshold {numericThreshold} units</span>
          </div>
          <div className="admin-inv-table">
            <div className="admin-inv-head">
              <span>Product</span><span>SKU</span><span>Qty</span><span>Status</span>
            </div>
            {sorted.map((p, index) => {
              const status = inventoryHealthStatus(p, numericThreshold);
              const rowKey = p.id ?? p.slug ?? `${p.name_en || "product"}-${index}`;
              const isFocused = focusProductSlug && p.slug === focusProductSlug;
              return (
                <div key={rowKey} className={`admin-inv-row ${isFocused ? "is-focused" : ""}`} data-product-slug={p.slug || ""}>
                  <div className="admin-inv-product">
                    {p.image ? <img className="admin-inv-thumb" src={p.image} alt="" /> : <div className="admin-inv-thumb-ph" />}
                    <strong>{p.name_en}</strong>
                  </div>
                  <span className="admin-inv-sku">{p.slug}</span>
                  <span className="admin-inv-qty">{p.stock_quantity}</span>
                  <span className={`admin-badge ${status.tone}`}>{status.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "warehouse" && (
        <section className="admin-panel-card">
          <div className="admin-panel-head">
            <h3>Warehouse Stock</h3>
            <span>{warehouseStocks.length} stock entries</span>
          </div>
          <form
            className="admin-stock-editor"
            onSubmit={async (event) => {
              event.preventDefault();
              setStockError("");
              if (!selectedWarehouseId || !selectedProductId) {
                setStockError("Select a warehouse and product first.");
                return;
              }
              if (selectedStock && Number(stockQuantity || 0) < Number(selectedStock.reserved_quantity || 0)) {
                setStockError("Physical quantity cannot be lower than reserved quantity.");
                return;
              }
              setStockSaving(true);
              try {
                await onSaveStock?.({
                  stockId: selectedStock?.id,
                  productId: selectedProductId,
                  warehouseId: selectedWarehouseId,
                  quantity: stockQuantity,
                  reason: adjustmentReason,
                });
                setAdjustmentReason("");
              } catch (error) {
                setStockError(error?.message || "Stock update failed.");
              } finally {
                setStockSaving(false);
              }
            }}
          >
            <label>
              <span>Warehouse</span>
              <select value={selectedWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)}>
                <option value="">Select warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {(warehouse.name_en || warehouse.code)} · {(warehouse.region_code || "").toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Product</span>
              <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
                <option value="">Select product</option>
                {rows.map((product) => (
                  <option key={product.id || product.slug} value={product.id}>
                    {product.name_en || product.name || product.slug} · {product.slug}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Physical quantity</span>
              <input type="number" min="0" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} />
            </label>
            <label>
              <span>Adjustment reason</span>
              <input value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Optional" />
            </label>
            <div className="admin-stock-editor-summary">
              <span>Reserved: <strong>{selectedStock?.reserved_quantity ?? 0}</strong></span>
              <span>Available: <strong>{selectedStock?.available_quantity ?? (stockQuantity || 0)}</strong></span>
              <span>Last updated: <strong>{selectedStock?.updated_at ? new Date(selectedStock.updated_at).toLocaleString() : "New entry"}</strong></span>
              <span>By: <strong>{selectedStock?.last_updated_by || "—"}</strong></span>
            </div>
            {stockError ? <p className="admin-form-error">{stockError}</p> : null}
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={stockSaving || !selectedWarehouseId || !selectedProductId}
            >
              {stockSaving ? "Saving…" : selectedStock ? "Update stock" : "Create stock row"}
            </button>
            {selectedProduct && selectedWarehouse ? (
              <p className="admin-form-hint">
                Updating {selectedProduct.name_en || selectedProduct.slug} in {selectedWarehouse.name_en || selectedWarehouse.code}.
              </p>
            ) : null}
          </form>
          {warehouseStocks.length ? (
            <div className="admin-inv-table">
              <div className="admin-inv-head" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr" }}>
                <span>Product</span><span>Warehouse</span><span>Region</span><span>Total</span><span>Reserved</span><span>Available</span>
              </div>
              {warehouseStocks.map((s) => (
                <div key={s.id} className="admin-inv-row" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr" }}>
                  <strong>{s.product_slug || s.product}</strong>
                  <span>{s.warehouse_code || s.warehouse}</span>
                  <span>{s.warehouse_region_code || "—"}</span>
                  <span className="admin-inv-qty">{s.quantity}</span>
                  <span style={{ color: "var(--warning)" }}>{s.reserved_quantity}</span>
                  <span style={{ color: s.available_quantity > 0 ? "var(--success)" : "var(--danger)" }}>{s.available_quantity}</span>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmpty label="warehouse stock entries" />
          )}
        </section>
      )}

      {activeTab === "demand" && (
        <section className="admin-panel-card">
          <div className="admin-panel-head">
            <h3>Demand Alerts</h3>
            <span>{demandAlerts.length} back-in-stock request{demandAlerts.length === 1 ? "" : "s"}</span>
          </div>
          {demandAlerts.length ? (
            <div className="admin-record-list">
              <div className="admin-list-head"><span>Product</span><span>Customer</span><span>Region</span><span>Status</span><span>Requested</span></div>
              {demandAlerts.map((req) => (
                <div key={req.id} className="admin-record-row">
                  <div className="admin-record-info">
                    <strong>{req.product_name || req.product_slug || req.product}</strong>
                    <span>{req.product_slug}</span>
                  </div>
                  <span>{req.user_email || "Guest"}</span>
                  <span>{req.region_code ? req.region_code.toUpperCase() : "—"}</span>
                  <span className={`admin-badge ${demandStatusTone(req.status)}`}>{req.status || "pending"}</span>
                  <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                    {req.created_at ? new Date(req.created_at).toLocaleDateString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmpty label="demand alerts" />
          )}
        </section>
      )}
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
  const rows = Array.isArray(data) ? data : [];
  const activeCount = rows.filter((s) => s.is_active !== false).length;

  function exportCsv() {
    const header = "email,phone,source,region,locale,is_active,subscribed_at";
    const lines = rows.map((s) =>
      [s.email || "", s.phone || "", s.source || "", s.region || "", s.locale || "", s.is_active !== false ? "true" : "false", s.subscribed_at || ""].join(",")
    );
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-newsletter">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <div>
            <h3>Newsletter Subscribers</h3>
            <span>{rows.length} total · {activeCount} active</span>
          </div>
          <button type="button" className="admin-btn-sm" onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="admin-record-list">
          {rows.length ? (
            rows.map((sub, i) => (
              <div key={sub.email || sub.phone || i} className="admin-record-row">
                <div className="admin-record-info">
                  <strong>{sub.email || sub.phone || "Subscriber"}</strong>
                  <span>
                    {sub.region ? `${sub.region.toUpperCase()} · ` : ""}
                    {sub.source ? `${sub.source.replaceAll("_", " ")} · ` : ""}
                    Subscribed: {sub.subscribed_at ? new Date(sub.subscribed_at).toLocaleDateString() : "—"}
                  </span>
                </div>
                <span className={`admin-badge ${sub.is_active !== false ? "success" : "neutral"}`}>
                  {sub.is_active !== false ? "Active" : "Inactive"}
                </span>
              </div>
            ))
          ) : <AdminEmpty label="subscribers" />}
        </div>
      </section>
    </div>
  );
}

export function NotificationHealthView({ data }) {
  const failures = Array.isArray(data?.recent_failures) ? data.recent_failures : [];
  const providers = data?.sms?.providers || {};
  const providerRows = Object.entries(providers);
  const badgeTone = (ok) => (ok ? "success" : "warning");

  return (
    <div className="admin-notification-health">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Email delivery</h3>
          <span className={`admin-badge ${badgeTone(data?.email?.configured)}`}>
            {data?.email?.configured ? "Configured" : "Needs setup"}
          </span>
        </div>
        <div className="admin-record-list compact">
          <div className="admin-record-row">
            <span>Backend</span>
            <strong>{data?.email?.backend || "—"}</strong>
          </div>
          <div className="admin-record-row">
            <span>Missing</span>
            <strong>{(data?.email?.missing || []).join(", ") || "None"}</strong>
          </div>
        </div>
      </section>

      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>SMS delivery</h3>
          <span className={`admin-badge ${badgeTone(data?.sms?.configured)}`}>
            {data?.sms?.configured ? "Configured" : "Needs setup"}
          </span>
        </div>
        <div className="admin-record-list compact">
          {providerRows.map(([key, provider]) => (
            <div key={key} className="admin-record-row">
              <span>{key}</span>
              <strong>{provider.configured ? "Ready" : `Missing ${(provider.missing || []).join(", ") || "configuration"}`}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Recent failures</h3>
          <span>{failures.length} latest</span>
        </div>
        {failures.length ? (
          <div className="admin-record-list compact">
            {failures.map((failure, index) => (
              <div key={`${failure.event}-${failure.channel}-${index}`} className="admin-record-row">
                <div className="admin-record-info">
                  <strong>{failure.event} · {failure.channel}</strong>
                  <span>{failure.recipient || "No recipient"} · {failure.status}</span>
                </div>
                <span>{failure.error_message || "No error message"}</span>
              </div>
            ))}
          </div>
        ) : <AdminEmpty label="notification failures" />}
      </section>
    </div>
  );
}

const POPUP_LEAD_REGIONS = [
  ["", "All regions"],
  ["om", "Oman (+968)"],
  ["ae", "UAE (+971)"],
  ["sa", "Saudi Arabia (+966)"],
];

export function PopupLeadsPanel({ data, onDownload, canExport }) {
  const rows = Array.isArray(data) ? data : [];
  const [region, setRegion] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    return list.filter((lead) => {
      if (region && lead.region !== region) return false;
      if (search && !(lead.phone || "").includes(search.trim())) return false;
      if (dateFrom && lead.subscribed_at && lead.subscribed_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && lead.subscribed_at && lead.subscribed_at.slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [data, region, search, dateFrom, dateTo]);

  function buildExportParams(exportFormat) {
    const params = { source: "discount_popup", export_format: exportFormat };
    if (region) params.region = region;
    if (search.trim()) params.search = search.trim();
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    return params;
  }

  return (
    <div className="admin-newsletter">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <div>
            <h3>Popup Leads</h3>
            <span>{filtered.length} of {rows.length} phone submissions</span>
          </div>
          {canExport ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="admin-btn-sm" onClick={() => onDownload(buildExportParams("csv"))}>Export CSV</button>
              <button type="button" className="admin-btn-sm" onClick={() => onDownload(buildExportParams("xlsx"))}>Export Excel</button>
            </div>
          ) : null}
        </div>
        <div className="admin-filters-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            {POPUP_LEAD_REGIONS.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
          </select>
          <input type="text" placeholder="Search phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
        <div className="admin-record-list">
          {filtered.length ? (
            filtered.map((lead, i) => (
              <div key={lead.id || i} className="admin-record-row">
                <div className="admin-record-info">
                  <strong>{lead.country_code ? `${lead.country_code} ` : ""}{lead.phone || "—"}</strong>
                  <span>
                    {lead.region ? `${lead.region.toUpperCase()} · ` : ""}
                    {lead.page_path ? `${lead.page_path} · ` : ""}
                    Submitted: {lead.subscribed_at ? new Date(lead.subscribed_at).toLocaleString() : "—"}
                  </span>
                </div>
              </div>
            ))
          ) : <AdminEmpty label="popup leads" />}
        </div>
      </section>
    </div>
  );
}

// Region content fields editable line-by-line from the Regions screen.
// Backend PATCH /admin/regions/<code>/ accepts any Region model field.
const REGION_CONTENT_FIELDS = [
  ["name_en", "Name EN"],
  ["name_ar", "Name AR"],
  ["contact_phone", "Contact phone"],
  ["contact_email", "Contact email", "email"],
  ["address_en", "Address EN", "textarea"],
  ["address_ar", "Address AR", "textarea"],
  ["seller_legal_name", "Legal name"],
  ["seller_vat_number", "VAT number"],
  ["seller_cr_number", "CR number"],
  ["seller_address_en", "Seller address EN", "textarea"],
  ["seller_address_ar", "Seller address AR", "textarea"],
  ["seller_phone", "Seller phone"],
  ["seller_email", "Seller email", "email"],
];

function RegionContentRow({ code, field, label, kind, value, request, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await request(`/admin/regions/${code}/`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: draft.trim() }),
      });
      setEditing(false);
      onSaved?.();
    } catch {
      setError("Save failed — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-settings-row admin-threshold-row">
      <strong>{label}</strong>
      {editing ? (
        <span className="admin-threshold-edit">
          {kind === "textarea" ? (
            <textarea
              className="admin-threshold-input"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
              autoFocus
            />
          ) : (
            <input
              type={kind || "text"}
              className="admin-threshold-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
            />
          )}
          <button className="admin-btn admin-btn-xs admin-btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="admin-btn admin-btn-xs" onClick={() => setEditing(false)}>Cancel</button>
          {error && <span className="admin-threshold-error">{error}</span>}
        </span>
      ) : (
        <span className="admin-threshold-display">
          <span>{value || "—"}</span>
          {request && (
            <button
              className="admin-btn admin-btn-xs admin-btn-ghost"
              onClick={() => { setDraft(value || ""); setEditing(true); }}
            >
              Edit
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// Everything a Region needs before it can be saved. The rest of the model has
// defaults and is edited on the region's own card once it exists.
const NEW_REGION_FIELDS = [
  ["code", "Code", "text", "e.g. kw", true],
  ["currency_code", "Currency", "text", "e.g. KWD", true],
  ["name_en", "Name (English)", "text", "e.g. Kuwait", true],
  ["name_ar", "Name (Arabic)", "text", "e.g. الكويت", true],
  ["fx_rate", "Rate vs base currency", "number", "e.g. 0.118", true],
  ["shipping_fee", "Shipping fee", "number", "e.g. 2.00", true],
  ["shipping_threshold", "Free shipping over", "number", "0 for none", true],
  ["contact_phone", "Contact phone", "text", "+965 …", true],
  ["contact_email", "Contact email", "email", "contact@…", false],
  ["whatsapp_phone", "WhatsApp number", "text", "+965 …", false],
  ["address_en", "Address (English)", "text", "", true],
  ["address_ar", "Address (Arabic)", "text", "", true],
];

const EMPTY_REGION = {
  code: "", currency_code: "", name_en: "", name_ar: "", fx_rate: "1",
  shipping_fee: "2.00", shipping_threshold: "0", contact_phone: "", contact_email: "",
  whatsapp_phone: "", address_en: "", address_ar: "",
};

function NewRegionForm({ request, onSaved }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_REGION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setDraft(EMPTY_REGION);
    setError("");
    setOpen(false);
  }

  async function save() {
    const missing = NEW_REGION_FIELDS
      .filter(([field, , , , required]) => required && !String(draft[field] || "").trim())
      .map(([, label]) => label);
    if (missing.length) {
      setError(`Still needed: ${missing.join(", ")}`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await request("/admin/regions/", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          // The storefront reads the region out of the URL in lowercase, and
          // currency codes are upper by convention everywhere else.
          code: draft.code.trim().toLowerCase(),
          currency_code: draft.currency_code.trim().toUpperCase(),
          locale_code: "en",
          is_active: true,
        }),
      });
      reset();
      onSaved?.();
    } catch (err) {
      // DRF answers {field: [message]} — a duplicate code is the common one.
      let detail = "";
      try {
        const parsed = JSON.parse(err?.message || "{}");
        detail = Object.entries(parsed)
          .map(([field, messages]) => `${field}: ${[].concat(messages).join(" ")}`)
          .join(" · ");
      } catch {
        detail = err?.message || "";
      }
      setError(detail || "Could not create the region — check the values and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!request) return null;

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>Add a region</h3>
          <span>
            A new market gets its own currency, prices and shipping. After saving, set
            its product prices with &quot;Apply conversion rates&quot;.
          </span>
        </div>
        <button
          className={`admin-btn ${open ? "" : "admin-btn-primary"}`}
          onClick={() => (open ? reset() : setOpen(true))}
        >
          {open ? "Cancel" : "Add region"}
        </button>
      </div>

      {open && (
        <>
          <div className="admin-new-region-grid">
            {NEW_REGION_FIELDS.map(([field, label, type, placeholder, required]) => (
              <label key={field} className="admin-new-region-field">
                <span>{label}{required ? " *" : ""}</span>
                <input
                  className="admin-input"
                  type={type}
                  value={draft[field]}
                  placeholder={placeholder}
                  step={type === "number" ? "any" : undefined}
                  maxLength={field === "code" ? 2 : field === "currency_code" ? 3 : undefined}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          {error && <p className="admin-fx-msg err">{error}</p>}
          <div className="admin-new-region-actions">
            <button className="admin-btn admin-btn-primary" disabled={saving} onClick={save}>
              {saving ? "Creating…" : "Create region"}
            </button>
            <button className="admin-btn" onClick={reset}>Cancel</button>
          </div>
        </>
      )}
    </section>
  );
}

export function RegionsView({ rows, request, onSaved }) {
  const [editingThreshold, setEditingThreshold] = useState({});
  const [savingThreshold, setSavingThreshold] = useState({});
  const [thresholdError, setThresholdError] = useState({});

  const [editingWhatsapp, setEditingWhatsapp] = useState({});
  const [editingEta, setEditingEta] = useState({});
  const [savingEta, setSavingEta] = useState({});
  const [etaError, setEtaError] = useState({});
  const [savingWhatsapp, setSavingWhatsapp] = useState({});
  const [whatsappError, setWhatsappError] = useState({});

  const [editingFx, setEditingFx] = useState({});
  const [savingFx, setSavingFx] = useState({});
  const [fxError, setFxError] = useState({});

  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState(null);

  async function saveThreshold(code, value) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      setThresholdError((e) => ({ ...e, [code]: "Enter a valid positive number" }));
      return;
    }
    setSavingThreshold((s) => ({ ...s, [code]: true }));
    setThresholdError((e) => ({ ...e, [code]: null }));
    try {
      await request(`/admin/regions/${code}/`, {
        method: "PATCH",
        body: JSON.stringify({ shipping_threshold: num.toFixed(2) }),
      });
      setEditingThreshold((e) => ({ ...e, [code]: undefined }));
      onSaved?.();
    } catch {
      setThresholdError((e) => ({ ...e, [code]: "Save failed — try again" }));
    } finally {
      setSavingThreshold((s) => ({ ...s, [code]: false }));
    }
  }

  async function saveWhatsapp(code, value) {
    // Keep only digits + optional leading +; wa.me links strip the + anyway.
    const cleaned = String(value || "").replace(/[^\d+]/g, "");
    if (cleaned && cleaned.replace(/\D/g, "").length < 6) {
      setWhatsappError((e) => ({ ...e, [code]: "Enter a valid phone number (digits, with country code)" }));
      return;
    }
    setSavingWhatsapp((s) => ({ ...s, [code]: true }));
    setWhatsappError((e) => ({ ...e, [code]: null }));
    try {
      await request(`/admin/regions/${code}/`, {
        method: "PATCH",
        body: JSON.stringify({ whatsapp_phone: cleaned }),
      });
      setEditingWhatsapp((e) => ({ ...e, [code]: undefined }));
      onSaved?.();
    } catch {
      setWhatsappError((e) => ({ ...e, [code]: "Save failed — try again" }));
    } finally {
      setSavingWhatsapp((s) => ({ ...s, [code]: false }));
    }
  }

  async function saveDeliveryEta(code, minValue, maxValue) {
    const min = String(minValue || "").trim() === "" ? null : Number(minValue);
    const max = String(maxValue || "").trim() === "" ? null : Number(maxValue);
    const invalid = [min, max].some((v) => v !== null && (!Number.isInteger(v) || v < 0 || v > 60));
    if (invalid) {
      setEtaError((e) => ({ ...e, [code]: "Enter whole days between 0 and 60, or leave blank" }));
      return;
    }
    if (min !== null && max !== null && min > max) {
      setEtaError((e) => ({ ...e, [code]: "The earliest day cannot be after the latest" }));
      return;
    }
    setSavingEta((s) => ({ ...s, [code]: true }));
    setEtaError((e) => ({ ...e, [code]: null }));
    try {
      await request(`/admin/regions/${code}/`, {
        method: "PATCH",
        body: JSON.stringify({ delivery_eta_min_days: min, delivery_eta_max_days: max }),
      });
      setEditingEta((e) => ({ ...e, [code]: undefined }));
      onSaved?.();
    } catch {
      setEtaError((e) => ({ ...e, [code]: "Save failed — try again" }));
    } finally {
      setSavingEta((s) => ({ ...s, [code]: false }));
    }
  }

  async function saveFx(code, value) {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      setFxError((e) => ({ ...e, [code]: "Enter a rate greater than 0" }));
      return;
    }
    setSavingFx((s) => ({ ...s, [code]: true }));
    setFxError((e) => ({ ...e, [code]: null }));
    try {
      await request(`/admin/regions/${code}/`, {
        method: "PATCH",
        body: JSON.stringify({ fx_rate: num }),
      });
      setEditingFx((e) => ({ ...e, [code]: undefined }));
      onSaved?.();
    } catch {
      setFxError((e) => ({ ...e, [code]: "Save failed — try again" }));
    } finally {
      setSavingFx((s) => ({ ...s, [code]: false }));
    }
  }

  async function applyConversion() {
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await request(`/admin/pricing/apply-conversion/`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const updated = res?.updated ?? 0;
      const created = res?.created ?? 0;
      setApplyMsg({
        ok: true,
        text: `Done — ${updated + created} prices recomputed from ${res?.base_currency || "base"} (${updated} updated, ${created} new).`,
      });
      onSaved?.();
    } catch {
      setApplyMsg({ ok: false, text: "Apply failed — try again." });
    } finally {
      setApplying(false);
    }
  }

  if (!rows.length) {
    return (
      <div className="admin-regions">
        <section className="admin-panel-card">
          <div className="admin-panel-head"><h3>Regions</h3><span>No regions configured.</span></div>
        </section>
        <NewRegionForm request={request} onSaved={onSaved} />
      </div>
    );
  }
  return (
    <div className="admin-regions">
      <NewRegionForm request={request} onSaved={onSaved} />
      {request && (
        <section className="admin-panel-card admin-fx-banner">
          <div className="admin-panel-head">
            <div>
              <h3>Currency conversion</h3>
              <span>
                Set each region&apos;s rate vs the base currency, then apply it to recompute
                all product prices. The base region stays unchanged.
              </span>
            </div>
            <button
              className="admin-btn admin-btn-primary"
              disabled={applying}
              onClick={applyConversion}
            >
              {applying ? "Applying…" : "Apply conversion rates"}
            </button>
          </div>
          {applyMsg && (
            <p className={`admin-fx-msg ${applyMsg.ok ? "ok" : "err"}`}>{applyMsg.text}</p>
          )}
        </section>
      )}
      {rows.map((region) => {
        const code = region.code;
        const isEditing = editingThreshold[code] !== undefined;
        const isSaving = savingThreshold[code];
        const error = thresholdError[code];
        const isEditingWa = editingWhatsapp[code] !== undefined;
        const isSavingWa = savingWhatsapp[code];
        const waError = whatsappError[code];
        const isEditingEta = editingEta[code] !== undefined;
        const isSavingEta = savingEta[code];
        const etaErr = etaError[code];
        const isEditingFx = editingFx[code] !== undefined;
        const isSavingFx = savingFx[code];
        const fxErr = fxError[code];
        const isBase = !!region.is_default;
        return (
          <section key={region.id || code} className="admin-panel-card admin-region-card">
            <div className="admin-panel-head">
              <div>
                <h3>{region.name_en || region.name || code?.toUpperCase()} <span className="admin-badge neutral">{code?.toUpperCase()}</span></h3>
                <span>{region.currency_code} · {region.locale || "en/ar"}</span>
              </div>
              <span className={`admin-badge ${region.is_active ? "success" : "neutral"}`}>{region.is_active ? "Active" : "Inactive"}</span>
            </div>
            <div className="admin-settings-preview">
              {REGION_CONTENT_FIELDS.map(([field, label, kind]) => (
                <RegionContentRow
                  key={field}
                  code={code}
                  field={field}
                  label={label}
                  kind={kind}
                  value={region[field]}
                  request={request}
                  onSaved={onSaved}
                />
              ))}
              {region.payment_enabled_providers?.length > 0 && (
                <div className="admin-settings-row">
                  <strong>Payment providers</strong>
                  <span>{region.payment_enabled_providers.join(", ")}</span>
                </div>
              )}

              {/* Free shipping threshold — inline editable */}
              <div className="admin-settings-row admin-threshold-row">
                <strong>Free shipping above</strong>
                {isEditing ? (
                  <span className="admin-threshold-edit">
                    <span className="admin-threshold-currency">{region.currency_code}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="admin-threshold-input"
                      defaultValue={region.shipping_threshold || "0"}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveThreshold(code, e.target.value);
                        if (e.key === "Escape") setEditingThreshold((s) => ({ ...s, [code]: undefined }));
                      }}
                      autoFocus
                    />
                    <button
                      className="admin-btn admin-btn-xs admin-btn-primary"
                      disabled={isSaving}
                      onClick={(e) => saveThreshold(code, e.target.closest(".admin-threshold-edit").querySelector("input").value)}
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="admin-btn admin-btn-xs"
                      onClick={() => setEditingThreshold((s) => ({ ...s, [code]: undefined }))}
                    >
                      Cancel
                    </button>
                    {error && <span className="admin-threshold-error">{error}</span>}
                  </span>
                ) : (
                  <span className="admin-threshold-display">
                    <span>{region.currency_code} {region.shipping_threshold || "—"}</span>
                    {request && (
                      <button
                        className="admin-btn admin-btn-xs admin-btn-ghost"
                        onClick={() => setEditingThreshold((s) => ({ ...s, [code]: true }))}
                      >
                        Edit
                      </button>
                    )}
                  </span>
                )}
              </div>

              {/* WhatsApp number — inline editable, controls floating chat button */}
              <div className="admin-settings-row admin-threshold-row">
                <strong>WhatsApp number</strong>
                {isEditingWa ? (
                  <span className="admin-threshold-edit">
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="968XXXXXXXX"
                      className="admin-threshold-input"
                      defaultValue={region.whatsapp_phone || ""}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveWhatsapp(code, e.target.value);
                        if (e.key === "Escape") setEditingWhatsapp((s) => ({ ...s, [code]: undefined }));
                      }}
                      autoFocus
                    />
                    <button
                      className="admin-btn admin-btn-xs admin-btn-primary"
                      disabled={isSavingWa}
                      onClick={(e) => saveWhatsapp(code, e.target.closest(".admin-threshold-edit").querySelector("input").value)}
                    >
                      {isSavingWa ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="admin-btn admin-btn-xs"
                      onClick={() => setEditingWhatsapp((s) => ({ ...s, [code]: undefined }))}
                    >
                      Cancel
                    </button>
                    {waError && <span className="admin-threshold-error">{waError}</span>}
                  </span>
                ) : (
                  <span className="admin-threshold-display">
                    <span>{region.whatsapp_phone || "—"}</span>
                    {request && (
                      <button
                        className="admin-btn admin-btn-xs admin-btn-ghost"
                        onClick={() => setEditingWhatsapp((s) => ({ ...s, [code]: true }))}
                      >
                        Edit
                      </button>
                    )}
                  </span>
                )}
              </div>

              {/* Delivery promise — what the product page and checkout tell the
                  shopper. Blank keeps the generic "fast shipping" wording. */}
              <div className="admin-settings-row admin-threshold-row">
                <strong>Delivery estimate</strong>
                {isEditingEta ? (
                  <span className="admin-threshold-edit">
                    <input
                      type="number" min="0" max="60" step="1"
                      className="admin-threshold-input"
                      defaultValue={region.delivery_eta_min_days ?? ""}
                      placeholder="from"
                      autoFocus
                    />
                    <span className="admin-threshold-currency">to</span>
                    <input
                      type="number" min="0" max="60" step="1"
                      className="admin-threshold-input"
                      defaultValue={region.delivery_eta_max_days ?? ""}
                      placeholder="to"
                    />
                    <span className="admin-threshold-currency">days</span>
                    <button
                      className="admin-btn admin-btn-xs admin-btn-primary"
                      disabled={isSavingEta}
                      onClick={(e) => {
                        const inputs = e.target.closest(".admin-threshold-edit").querySelectorAll("input");
                        saveDeliveryEta(code, inputs[0].value, inputs[1].value);
                      }}
                    >
                      {isSavingEta ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="admin-btn admin-btn-xs"
                      onClick={() => setEditingEta((s) => ({ ...s, [code]: undefined }))}
                    >
                      Cancel
                    </button>
                    {etaErr && <span className="admin-threshold-error">{etaErr}</span>}
                  </span>
                ) : (
                  <span className="admin-threshold-display">
                    <span>
                      {region.delivery_eta_max_days
                        ? (region.delivery_eta_min_days && region.delivery_eta_min_days !== region.delivery_eta_max_days
                            ? `${region.delivery_eta_min_days}-${region.delivery_eta_max_days} days`
                            : `${region.delivery_eta_max_days} days`)
                        : "Not shown"}
                    </span>
                    {request && (
                      <button
                        className="admin-btn admin-btn-xs admin-btn-ghost"
                        onClick={() => setEditingEta((s) => ({ ...s, [code]: true }))}
                      >
                        Edit
                      </button>
                    )}
                  </span>
                )}
              </div>

              {/* Currency conversion rate — inline editable (base region is fixed at 1) */}
              <div className="admin-settings-row admin-threshold-row">
                <strong>Conversion rate</strong>
                {isBase ? (
                  <span className="admin-threshold-display">
                    <span>Base currency · 1.0</span>
                  </span>
                ) : isEditingFx ? (
                  <span className="admin-threshold-edit">
                    <span className="admin-threshold-currency">1 OMR =</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      className="admin-threshold-input"
                      defaultValue={region.fx_rate || "1"}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveFx(code, e.target.value);
                        if (e.key === "Escape") setEditingFx((s) => ({ ...s, [code]: undefined }));
                      }}
                      autoFocus
                    />
                    <span className="admin-threshold-currency">{region.currency_code}</span>
                    <button
                      className="admin-btn admin-btn-xs admin-btn-primary"
                      disabled={isSavingFx}
                      onClick={(e) => saveFx(code, e.target.closest(".admin-threshold-edit").querySelector("input").value)}
                    >
                      {isSavingFx ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="admin-btn admin-btn-xs"
                      onClick={() => setEditingFx((s) => ({ ...s, [code]: undefined }))}
                    >
                      Cancel
                    </button>
                    {fxErr && <span className="admin-threshold-error">{fxErr}</span>}
                  </span>
                ) : (
                  <span className="admin-threshold-display">
                    <span>1 OMR = {region.fx_rate || "1"} {region.currency_code}</span>
                    {request && (
                      <button
                        className="admin-btn admin-btn-xs admin-btn-ghost"
                        onClick={() => setEditingFx((s) => ({ ...s, [code]: true }))}
                      >
                        Edit
                      </button>
                    )}
                  </span>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Instagram Posts ──────────────────────────────────────────────────────────

export function InstagramPostsPanel({ rows = [], request, onSaved }) {
  const [posts, setPosts] = useState(rows);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ file: null, preview: "", href: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => { setPosts(rows); }, [rows]);

  function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setForm((f) => ({ ...f, file, preview }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.file) { setError("Please select an image to upload."); return; }
    setSaving(true); setError("");
    try {
      const fd = new FormData();
      fd.append("image_file", form.file);
      if (form.href.trim()) fd.append("href", form.href.trim());
      await request("/admin/instagram-posts/", { method: "POST", body: fd });
      if (form.preview) URL.revokeObjectURL(form.preview);
      setForm({ file: null, preview: "", href: "" });
      setAdding(false);
      onSaved?.();
    } catch { setError("Upload failed. Please try again."); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await request(`/admin/instagram-posts/${id}/`, { method: "DELETE" });
      onSaved?.();
    } catch { setError("Delete failed."); }
    finally { setDeletingId(null); }
  }

  function handleCancel() {
    if (form.preview) URL.revokeObjectURL(form.preview);
    setForm({ file: null, preview: "", href: "" });
    setAdding(false);
    setError("");
  }

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>Instagram Grid</h3>
          <span>{posts.length} post{posts.length !== 1 ? "s" : ""} · shown on homepage in 5-column mosaic</span>
        </div>
        {!adding && (
          <button type="button" className="admin-btn-primary" onClick={() => { setAdding(true); setError(""); }}>
            + Add post
          </button>
        )}
      </div>

      {adding && (
        <form className="ig-post-add-form" onSubmit={handleAdd}>
          <div className="ig-post-add-fields">
            <label>
              <span>Photo <span style={{color:"#c0392b"}}>*</span></span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleFilePick}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {form.file ? "Change photo" : "📁 Choose photo"}
                </button>
                {form.file && (
                  <span style={{ fontSize: 13, color: "#5a7a4a" }}>✓ {form.file.name}</span>
                )}
              </div>
            </label>
            <label>
              <span>Instagram post link (optional)</span>
              <input
                type="url"
                placeholder="https://www.instagram.com/p/..."
                value={form.href}
                onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
              />
            </label>
          </div>
          {form.preview && (
            <div className="ig-post-preview-thumb">
              <img src={form.preview} alt="preview" />
            </div>
          )}
          {error && <p className="admin-threshold-error">{error}</p>}
          <div className="ig-post-add-actions">
            <button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? "Uploading…" : "Save"}</button>
            <button type="button" className="admin-btn-ghost" onClick={handleCancel}>Cancel</button>
          </div>
        </form>
      )}

      {posts.length === 0 && !adding ? (
        <AdminEmpty message="No Instagram posts yet. Add the first one." />
      ) : (
        <div className="ig-admin-grid">
          {posts.map((post) => (
            <div key={post.id} className="ig-admin-tile">
              <img src={post.image_file || post.image} alt="" onError={(e) => { e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23e8f0e0'/%3E%3C/svg%3E"; }} />
              <div className="ig-admin-tile-overlay">
                {post.href && <a href={post.href} target="_blank" rel="noopener noreferrer" className="ig-admin-tile-link" title="Open post">↗</a>}
                <button
                  type="button"
                  className="ig-admin-tile-del"
                  onClick={() => handleDelete(post.id)}
                  disabled={deletingId === post.id}
                  title="Delete"
                >
                  {deletingId === post.id ? "…" : "×"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Hero Banner Carousel ─────────────────────────────────────────────────────

const HERO_BANNER_LINKS = [
  ["", "— No link (image only) —"],
  ["/collections", "All Collections"],
  ["/collections?collection=baby_sets", "Gift Sets"],
  ["/collections?collection=top_choices", "Parents Top Choices"],
  ["/collections?ordering=-id", "New Arrivals"],
  ["/collections?ordering=-rating", "Best Rated"],
];

const EMPTY_SLIDE_FORM = {
  file: null,
  preview: "",
  mobileFile: null,
  mobilePreview: "",
  href: "",
  alt_text_en: "",
  alt_text_ar: "",
};

// The banner adopts the shape of whatever is uploaded, so the size is worth
// stating plainly next to each slide rather than leaving it to be guessed.
function describeArtwork(width, height) {
  if (!width || !height) return "size unknown";
  const shape = width > height * 1.2 ? "wide" : height > width * 1.2 ? "tall" : "square";
  return `${width} × ${height} (${shape})`;
}

export function HeroBannerPanel({ rows = [], request, onSaved, canEdit = true }) {
  const [slides, setSlides] = useState(rows);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_SLIDE_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [replaceTarget, setReplaceTarget] = useState(null);
  const fileRef = useRef(null);
  const mobileFileRef = useRef(null);
  const replaceRef = useRef(null);

  useEffect(() => { setSlides(rows); }, [rows]);

  function pickFile(e, key) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setForm((f) => {
      const oldPreview = key === "file" ? f.preview : f.mobilePreview;
      if (oldPreview) URL.revokeObjectURL(oldPreview);
      return key === "file"
        ? { ...f, file, preview }
        : { ...f, mobileFile: file, mobilePreview: preview };
    });
  }

  function resetForm() {
    if (form.preview) URL.revokeObjectURL(form.preview);
    if (form.mobilePreview) URL.revokeObjectURL(form.mobilePreview);
    setForm(EMPTY_SLIDE_FORM);
    setAdding(false);
    setError("");
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.file) { setError("Choose a banner image to upload."); return; }
    setSaving(true); setError("");
    try {
      const fd = new FormData();
      fd.append("image_file", form.file);
      if (form.mobileFile) fd.append("image_file_mobile", form.mobileFile);
      if (form.href.trim()) fd.append("href", form.href.trim());
      if (form.alt_text_en.trim()) fd.append("alt_text_en", form.alt_text_en.trim());
      if (form.alt_text_ar.trim()) fd.append("alt_text_ar", form.alt_text_ar.trim());
      // New slides go to the end of the deck rather than jumping to the front.
      fd.append("sort_order", String(slides.length));
      await request("/admin/hero-banner-slides/", { method: "POST", body: fd });
      resetForm();
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function patchSlide(id, body) {
    setBusyId(id); setError("");
    try {
      await request(`/admin/hero-banner-slides/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Could not save that change.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    setBusyId(id); setError("");
    try {
      await request(`/admin/hero-banner-slides/${id}/`, { method: "DELETE" });
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  // Swapping artwork on a slide that is already live used to mean deleting it and
  // adding it back, which lost its place in the deck — and there was no way at all
  // to give an existing slide the phone-specific graphic.
  async function replaceImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !replaceTarget) return;
    const { id, field } = replaceTarget;
    setReplaceTarget(null);
    setBusyId(id); setError("");
    try {
      const fd = new FormData();
      fd.append(field, file);
      await request(`/admin/hero-banner-slides/${id}/`, { method: "PATCH", body: fd });
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Could not replace that image.");
    } finally {
      setBusyId(null);
    }
  }

  function askForImage(id, field) {
    setReplaceTarget({ id, field });
    // The state has to land before the picker opens, or the change handler fires
    // with no target to write to.
    setTimeout(() => replaceRef.current?.click(), 0);
  }

  // Slides carry arbitrary sort_order values, so a swap writes explicit
  // positions for both rows instead of nudging one number and hoping.
  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const a = slides[index];
    const b = slides[target];
    setBusyId(a.id); setError("");
    try {
      await request(`/admin/hero-banner-slides/${a.id}/`, {
        method: "PATCH", body: JSON.stringify({ sort_order: target }),
      });
      await request(`/admin/hero-banner-slides/${b.id}/`, {
        method: "PATCH", body: JSON.stringify({ sort_order: index }),
      });
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Could not reorder the slides.");
    } finally {
      setBusyId(null);
    }
  }

  const visibleCount = slides.filter((s) => s.is_visible !== false).length;

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>Hero Banner</h3>
          <span>
            {slides.length} slide{slides.length !== 1 ? "s" : ""}
            {slides.length ? ` · ${visibleCount} live` : ""} · full-width carousel at the top
            of the homepage · separate website and mobile artwork, each shown at its own shape
          </span>
        </div>
        {canEdit && !adding && (
          <button type="button" className="admin-btn-primary" onClick={() => { setAdding(true); setError(""); }}>
            + Add slide
          </button>
        )}
      </div>

      {adding && (
        <form className="ig-post-add-form" onSubmit={handleAdd}>
          <div className="ig-post-add-fields">
            <label>
              <span>Website image (desktop) <span style={{ color: "#c0392b" }}>*</span></span>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => pickFile(e, "file")} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button type="button" className="admin-btn-ghost" onClick={() => fileRef.current?.click()} style={{ whiteSpace: "nowrap" }}>
                  {form.file ? "Change image" : "📁 Choose image"}
                </button>
                {form.file && <span style={{ fontSize: 13, color: "#5a7a4a" }}>✓ {form.file.name}</span>}
              </div>
              <small className="admin-field-help">
                Shown on computers and tablets. Wide artwork suits it best — the banner
                takes its shape from whatever you upload, so nothing gets cropped.
              </small>
            </label>
            <label>
              <span>Mobile image (optional)</span>
              <input ref={mobileFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => pickFile(e, "mobileFile")} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button type="button" className="admin-btn-ghost" onClick={() => mobileFileRef.current?.click()} style={{ whiteSpace: "nowrap" }}>
                  {form.mobileFile ? "Change image" : "📁 Choose image"}
                </button>
                {form.mobileFile && <span style={{ fontSize: 13, color: "#5a7a4a" }}>✓ {form.mobileFile.name}</span>}
              </div>
              <small className="admin-field-help">
                Shown only on phones, and it can be a different shape — a tall
                portrait graphic here works next to a wide one above. Leave it empty
                and phones reuse the website image.
              </small>
            </label>
            <label>
              <span>Link when clicked</span>
              <input
                list="hero-banner-links"
                placeholder="/collections"
                value={form.href}
                onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
              />
              <datalist id="hero-banner-links">
                {HERO_BANNER_LINKS.filter(([value]) => value).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </datalist>
              <small className="admin-field-help">Leave empty for an image-only banner.</small>
            </label>
            <label>
              <span>Description EN (for screen readers)</span>
              <input
                type="text"
                placeholder="Hot deals up to 50% off"
                value={form.alt_text_en}
                onChange={(e) => setForm((f) => ({ ...f, alt_text_en: e.target.value }))}
              />
            </label>
            <label>
              <span>Description AR (optional)</span>
              <input
                type="text"
                dir="rtl"
                value={form.alt_text_ar}
                onChange={(e) => setForm((f) => ({ ...f, alt_text_ar: e.target.value }))}
              />
            </label>
          </div>
          {(form.preview || form.mobilePreview) && (
            <div className="hero-banner-admin-previews">
              {form.preview && (
                <figure className="hero-banner-admin-preview">
                  <img src={form.preview} alt="Website banner preview" />
                  <figcaption>Website</figcaption>
                </figure>
              )}
              {form.mobilePreview && (
                <figure className="hero-banner-admin-preview hero-banner-admin-preview--mobile">
                  <img src={form.mobilePreview} alt="Mobile banner preview" />
                  <figcaption>Mobile</figcaption>
                </figure>
              )}
            </div>
          )}
          {error && <p className="admin-threshold-error">{error}</p>}
          <div className="ig-post-add-actions">
            <button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? "Uploading…" : "Save slide"}</button>
            <button type="button" className="admin-btn-ghost" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {!adding && error && <p className="admin-threshold-error">{error}</p>}

      {/* One shared picker for every row's replace button — replaceTarget says
          which slide and which of its two images the chosen file belongs to. */}
      <input
        ref={replaceRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={replaceImage}
      />

      {slides.length === 0 && !adding ? (
        <AdminEmpty message="No banner slides yet. Add the first one to show the homepage carousel." />
      ) : (
        <div className="hero-banner-admin-list">
          {slides.map((slide, index) => (
            <div key={slide.id} className={`hero-banner-admin-row${slide.is_visible === false ? " is-hidden" : ""}`}>
              <div className="hero-banner-admin-thumb">
                <img
                  src={slide.image}
                  alt=""
                  onError={(e) => { e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='50'%3E%3Crect width='160' height='50' fill='%23e8f0e0'/%3E%3C/svg%3E"; }}
                />
              </div>
              <div className="hero-banner-admin-meta">
                <strong>{slide.alt_text_en || `Slide ${index + 1}`}</strong>
                <span>{slide.href ? `Links to ${slide.href}` : "No link"}</span>
                <span>Website: {describeArtwork(slide.image_width, slide.image_height)}</span>
                <span>
                  Mobile:{" "}
                  {slide.image_mobile
                    ? describeArtwork(slide.image_mobile_width, slide.image_mobile_height)
                    : "reusing the website image"}
                </span>
              </div>
              {canEdit ? (
                <div className="hero-banner-admin-actions">
                  <button type="button" className="admin-btn-ghost" onClick={() => move(index, -1)} disabled={index === 0 || busyId === slide.id} title="Move up">↑</button>
                  <button type="button" className="admin-btn-ghost" onClick={() => move(index, 1)} disabled={index === slides.length - 1 || busyId === slide.id} title="Move down">↓</button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => askForImage(slide.id, "image_file")}
                    disabled={busyId === slide.id}
                    title="Replace the image shown on computers"
                  >
                    Website image
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => askForImage(slide.id, "image_file_mobile")}
                    disabled={busyId === slide.id}
                    title="Set the image shown on phones"
                  >
                    {slide.image_mobile ? "Mobile image" : "+ Mobile image"}
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => patchSlide(slide.id, { is_visible: slide.is_visible === false })}
                    disabled={busyId === slide.id}
                  >
                    {slide.is_visible === false ? "Show" : "Hide"}
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    style={{ color: "#c0392b" }}
                    onClick={() => handleDelete(slide.id)}
                    disabled={busyId === slide.id}
                    title="Delete slide"
                  >
                    {busyId === slide.id ? "…" : "Delete"}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
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

// ─── Payment Gateways ─────────────────────────────────────────────────────────

const PAYMENT_GATEWAYS = [
  {
    key: "paytabs",
    name: "PayTabs",
    logo: "PT",
    color: "#1a73e8",
    desc: "Hosted payments for Saudi Arabia, UAE, and Oman. Supports cards, MADA, and wallets.",
    regions: ["SA", "AE", "OM"],
    requiredKeys: ["paytabs_profile_id", "paytabs_server_key"],
    setupRequired: false,
    notLive: false,
    fields: [
      { key: "paytabs_profile_id", label: "Profile ID",  type: "text",     placeholder: "12345",                                           hint: "PayTabs Merchant Portal → Account Info → Profile ID" },
      { key: "paytabs_server_key", label: "Server Key",  type: "password", placeholder: "SXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", hint: "PayTabs Merchant Portal → Developers → Server Key" },
      { key: "paytabs_region",     label: "Region Code", type: "text",     placeholder: "SA",                                              hint: "Region code: SA, AE, or OM. Per-region env vars take priority." },
    ],
  },
  {
    key: "hyperpay",
    name: "HyperPay",
    logo: "HP",
    color: "#e30613",
    desc: "Payment orchestration for GCC markets. Supports cards, MADA, and STC Pay.",
    regions: ["SA", "AE", "OM", "QA", "KW", "BH"],
    requiredKeys: ["hyperpay_entity_id", "hyperpay_access_token"],
    setupRequired: true,
    notLive: true,
    fields: [
      { key: "hyperpay_entity_id",    label: "Entity ID",     type: "text",     placeholder: "8a829418751a7eab01751e1234567890", hint: "HyperPay → Administration → Channels → Entity ID" },
      { key: "hyperpay_access_token", label: "Access Token",  type: "password", placeholder: "OGE4Mjk0MTg3...",                 hint: "HyperPay → Administration → Users → Access Token (Bearer)" },
    ],
  },
  {
    key: "telr",
    name: "Telr",
    logo: "TL",
    color: "#00adef",
    desc: "Multi-currency payment gateway for UAE and MENA region.",
    regions: ["AE", "SA", "OM"],
    requiredKeys: ["telr_store_id", "telr_auth_key"],
    setupRequired: true,
    notLive: true,
    fields: [
      { key: "telr_store_id", label: "Store ID",  type: "text",     placeholder: "12345",              hint: "Telr Merchant Portal → Settings → Store ID" },
      { key: "telr_auth_key", label: "Auth Key",  type: "password", placeholder: "abc123def456ghi789", hint: "Telr Merchant Portal → Settings → Auth Key" },
    ],
  },
  {
    key: "thawani",
    name: "Thawani",
    logo: "TW",
    color: "#00b4d8",
    desc: "Oman's leading payment gateway. Supports Thawani Pay wallet and cards.",
    regions: ["OM"],
    requiredKeys: ["thawani_publishable_key", "thawani_secret_key"],
    setupRequired: true,
    notLive: true,
    fields: [
      { key: "thawani_publishable_key", label: "Publishable Key",  type: "text",     placeholder: "pk_test_xxxxxxxxxxxxxxxxxxxx",          hint: "Thawani Merchant Portal → API Keys → Publishable Key" },
      { key: "thawani_secret_key",      label: "Secret Key",       type: "password", placeholder: "sk_test_xxxxxxxxxxxxxxxxxxxx",           hint: "Thawani Merchant Portal → API Keys → Secret Key" },
      { key: "thawani_webhook_secret",  label: "Webhook Secret",   type: "password", placeholder: "whsec_xxxxxxxxxxxxxxxxxxxx",             hint: "Optional — for webhook signature verification" },
      { key: "thawani_base_url",        label: "API Base URL",     type: "text",     placeholder: "https://uatcheckout.thawani.om",        hint: "Production URL: https://checkout.thawani.om — leave blank for default UAT" },
    ],
  },
  {
    key: "omannet",
    name: "OmanNet",
    logo: "ON",
    color: "#cc0000",
    desc: "National payment network for Oman. Supports debit cards and online banking.",
    regions: ["OM"],
    requiredKeys: ["omannet_merchant_id", "omannet_access_code", "omannet_sha_request"],
    setupRequired: true,
    notLive: true,
    fields: [
      { key: "omannet_merchant_id",    label: "Merchant ID",       type: "text",     placeholder: "testOMN001",              hint: "OmanNet merchant credentials — provided by your acquirer" },
      { key: "omannet_access_code",    label: "Access Code",       type: "password", placeholder: "A1B2C3D4E5F6G7H8",        hint: "Payment gateway access code" },
      { key: "omannet_sha_request",    label: "SHA Request Key",   type: "password", placeholder: "STRONGSHAREQUESTKEY...",  hint: "SHA passphrase for request signing" },
      { key: "omannet_sha_response",   label: "SHA Response Key",  type: "password", placeholder: "STRONGSHARESPONSEKEY...", hint: "SHA passphrase for response verification" },
      { key: "omannet_webhook_secret", label: "Webhook Secret",    type: "password", placeholder: "abc123...",               hint: "Optional — for webhook signature verification" },
    ],
  },
];

// ─── Paymob (region-aware) ────────────────────────────────────────────────────
// Paymob requires a separate Paymob-supported integration per region, so each
// region (Oman / Saudi / UAE) has its own credentials. Values entered here are
// stored in the database and override environment-variable fallbacks; blank
// fields never overwrite a working value. Secrets are write-only — the server
// returns only an "is set" indicator, never the stored secret.

const PAYMOB_REGIONS_META = [
  { code: "OM", name: "Oman",                  currency: "OMR", color: "#0f4c8c" },
  { code: "SA", name: "Saudi Arabia",          currency: "SAR", color: "#13803a" },
  { code: "AE", name: "United Arab Emirates",  currency: "AED", color: "#7a1f2b" },
];

const PAYMOB_FIELDS = [
  { key: "api_key",        label: "API Key",        type: "password", secret: true,  hint: "Paymob Dashboard → Settings → Account Info → API Key" },
  { key: "integration_id", label: "Integration ID (Card)", type: "text",             hint: "Paymob → Developers → Payment Integrations — the numeric MIGS-online card ID for this region" },
  { key: "apple_pay_integration_id", label: "Apple Pay Integration ID", type: "text", hint: "Paymob → Developers → Payment Integrations — the numeric MIGS-online (APPLE PAY) ID. Leave blank if Apple Pay is not enabled." },
  { key: "iframe_id",      label: "iFrame ID",      type: "text",                    hint: "Paymob → Developers → iFrames — the numeric ID" },
  { key: "hmac_secret",    label: "HMAC Secret",    type: "password", secret: true,  hint: "Paymob → Settings → Account Info → HMAC — used to verify callbacks" },
  { key: "secret_key",     label: "Secret Key (Unified Checkout)", type: "password", secret: true, hint: "Paymob → Settings → API keys → Secret key (xxx_sk_live_…). Required for MIGS integrations via Unified Checkout." },
  { key: "public_key",     label: "Public Key (Unified Checkout)", type: "password", secret: true, hint: "Paymob → Settings → API keys → Public key (xxx_pk_live_…). Required alongside the Secret Key." },
  { key: "base_url",       label: "API Base URL",   type: "text",                    hint: "Per-account host, e.g. https://oman.paymob.com/api or https://uae.paymob.com/api" },
  { key: "currency",       label: "Currency",       type: "text",                    hint: "Currency code for this region (e.g. OMR / SAR / AED)" },
];

function paymobStatusMeta(status) {
  if (status === "active")   return { label: "Active",        cls: "connected" };
  if (status === "disabled") return { label: "Disabled",      cls: "idle" };
  return { label: "Setup pending", cls: "idle" };
}

function PaymobRegionCard({ region, canEdit, request, onSaved }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const meta = PAYMOB_REGIONS_META.find((r) => r.code === region.region_code) || {};
  const st = paymobStatusMeta(region.status);
  const resolved = region.resolved || {};
  const envBacked = region.status === "active" && !region.has_db_row;

  function startEdit() {
    setError("");
    setDraft({
      enabled: region.enabled !== false,
      integration_id: region.integration_id || "",
      apple_pay_integration_id: region.apple_pay_integration_id || "",
      iframe_id: region.iframe_id || "",
      base_url: region.base_url || "",
      currency: region.currency || "",
      api_key: "",       // secrets are never prefilled
      hmac_secret: "",
      secret_key: "",
      public_key: "",
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = { region_code: region.region_code, enabled: !!draft.enabled };
      PAYMOB_FIELDS.forEach((f) => {
        const v = (draft[f.key] ?? "").toString();
        // Secrets are sent only when the admin typed a value, so a blank field
        // never overwrites a saved or env-provided credential.
        if (f.secret) { if (v.trim()) body[f.key] = v; }
        else body[f.key] = v;
      });
      await request("/admin/paymob-regions/", { method: "PATCH", body: JSON.stringify(body) });
      setOpen(false);
      await onSaved();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`admin-iv-card${region.status === "active" ? " connected" : ""}${open ? " expanded" : ""}`}>
      <div className="admin-iv-main" role="button" tabIndex={0} onClick={() => (open ? setOpen(false) : startEdit())} onKeyDown={(e) => e.key === "Enter" && (open ? setOpen(false) : startEdit())}>
        <div className="admin-iv-logo" style={{ background: meta.color || "#0f4c8c" }}>{region.region_code}</div>
        <div className="admin-iv-info">
          <strong>Paymob · {meta.name || region.region_label}</strong>
          <span>Currency {region.resolved?.currency || meta.currency}. Requires a Paymob integration for this region.</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {["api_key", "integration_id", "iframe_id", "hmac_secret", "secret_key", "public_key"].map((k) => (
              <span key={k} style={{ fontSize: "0.66rem", background: "var(--admin-surface-raised, #f3f4f6)", color: resolved[`has_${k === "api_key" ? "api_key" : k}`] ? "#13803a" : "var(--admin-muted)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>
                {resolved[`has_${k}`] ? "✓" : "—"} {k.replace(/_/g, " ")}
              </span>
            ))}
          </div>
          {envBacked && <span style={{ fontSize: "0.68rem", color: "var(--admin-muted)", marginTop: 4 }}>Resolved from environment variables — save here to manage from the panel.</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span className={`admin-iv-chip ${st.cls}`}>{st.label}</span>
          <span style={{ fontSize: "0.7rem", color: "var(--admin-muted)" }}>{open ? "▲ Close" : "▼ Configure"}</span>
        </div>
      </div>
      {open && (
        <div className="admin-iv-form">
          <div className="admin-iv-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input id={`paymob-enabled-${region.region_code}`} type="checkbox" checked={!!draft.enabled} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} style={{ width: 16, height: 16 }} />
            <label htmlFor={`paymob-enabled-${region.region_code}`} style={{ margin: 0 }}>Enabled for this region</label>
          </div>
          {PAYMOB_FIELDS.map((f) => {
            const isSet = f.key === "api_key" ? region.api_key_set
              : f.key === "hmac_secret" ? region.hmac_secret_set
              : f.key === "secret_key" ? region.secret_key_set
              : f.key === "public_key" ? region.public_key_set
              : false;
            return (
              <div key={f.key} className="admin-iv-field">
                <label>{f.label}{f.secret && isSet ? " (saved — leave blank to keep)" : ""}</label>
                <input
                  type={f.type || "text"}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  placeholder={f.secret && isSet ? "•••••••• saved" : (f.key === "currency" ? (meta.currency || "") : (f.key === "base_url" ? "https://accept.paymob.com/api" : ""))}
                  disabled={!canEdit}
                  autoComplete="off"
                />
                {f.hint && <span className="admin-iv-field-hint">{f.hint}</span>}
              </div>
            );
          })}
          {error && <div style={{ color: "#b91c1c", fontSize: "0.8rem" }}>{error}</div>}
          {canEdit && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="admin-btn-primary admin-btn-sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save credentials"}
              </button>
              <button className="admin-btn-sm active-outline" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PaymobRegionsPanel({ canEdit, request }) {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await request("/admin/paymob-regions/");
      setRegions(res?.regions || []);
    } catch (err) {
      setError(err.message || "Failed to load Paymob configuration");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="admin-iv-card-group" style={{ marginBottom: 24 }}>
      <div className="admin-iv-header">
        <h3 style={{ margin: "0 0 4px" }}>Paymob — per region</h3>
        <p style={{ margin: 0 }}>Configure Paymob separately for Oman, Saudi Arabia, and UAE. Each region needs its own Paymob-supported integration. Environment variables remain the fallback; values saved here override them and blank fields never disable a working config.</p>
      </div>
      {loading && <div style={{ padding: 12, color: "var(--admin-muted)" }}>Loading…</div>}
      {error && <div style={{ padding: 12, color: "#b91c1c" }}>{error}</div>}
      {!loading && !error && (
        <div className="admin-iv-list">
          {regions.map((region) => (
            <PaymobRegionCard key={region.region_code} region={region} canEdit={canEdit} request={request} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PaymentGatewaysView({ data, canEdit, onPatch, request }) {
  const [expanded, setExpanded] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const providerStatuses = data?.payment_provider_statuses && typeof data.payment_provider_statuses === "object"
    ? data.payment_provider_statuses
    : {};

  function providerStatusMeta(status) {
    if (status === "ready") return { label: "Ready", cls: "connected" };
    if (status === "missing_keys") return { label: "Missing keys", cls: "idle" };
    if (status === "test_mode_only") return { label: "Test mode only", cls: "idle" };
    if (status === "scaffold_only") return { label: "Scaffold only", cls: "idle" };
    if (status === "not_implemented") return { label: "Not implemented", cls: "idle" };
    return { label: "Not configured", cls: "idle" };
  }

  function isConnected(gw) {
    return gw.requiredKeys.every((k) => data?.[k]);
  }

  function toggle(key) {
    if (expanded === key) {
      setExpanded(null);
      setDraft({});
    } else {
      setExpanded(key);
      const gw = PAYMENT_GATEWAYS.find((g) => g.key === key);
      const initial = {};
      gw.fields.forEach((f) => { initial[f.key] = data?.[f.key] || ""; });
      setDraft(initial);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await onPatch(draft);
      setExpanded(null);
      setDraft({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-integrations-view">
      <div className="admin-iv-header">
        <h2>Payment Gateways</h2>
        <p>Enter credentials for each gateway. Keys are stored securely in the database and override environment variables set at deploy time.</p>
      </div>
      {request && <PaymobRegionsPanel canEdit={canEdit} request={request} />}
      <div className="admin-iv-list">
        {PAYMENT_GATEWAYS.map((gw) => {
          const connected = isConnected(gw);
          const providerStatus = providerStatuses?.[gw.key] || {};
          const statusKey = providerStatus?.status || (connected ? "ready" : "missing_keys");
          const statusMeta = providerStatusMeta(statusKey);
          const credentials = providerStatus?.credentials && typeof providerStatus.credentials === "object"
            ? providerStatus.credentials
            : {};
          const credentialEntries = Object.entries(credentials);
          const open = expanded === gw.key;
          return (
            <div key={gw.key} className={`admin-iv-card${statusKey === "ready" ? " connected" : ""}${open ? " expanded" : ""}`}>
              <div className="admin-iv-main" role="button" tabIndex={0} onClick={() => toggle(gw.key)} onKeyDown={(e) => e.key === "Enter" && toggle(gw.key)}>
                <div className="admin-iv-logo" style={{ background: gw.color }}>{gw.logo}</div>
                <div className="admin-iv-info">
                  <strong>{gw.name}</strong>
                  <span>{gw.desc}</span>
                  {providerStatus?.helper_text ? (
                    <span style={{ fontSize: "0.72rem", color: "var(--admin-muted)" }}>
                      {providerStatus.helper_text}
                    </span>
                  ) : gw.setupRequired ? (
                    <span style={{ fontSize: "0.72rem", color: "var(--admin-muted)" }}>
                      Setup required: this provider is not live until implementation and credentials are fully validated.
                    </span>
                  ) : null}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {gw.regions.map((r) => (
                      <span key={r} style={{ fontSize: "0.68rem", background: "var(--admin-surface-raised, #f3f4f6)", color: "var(--admin-muted)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{r}</span>
                    ))}
                  </div>
                  {credentialEntries.length ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                      {credentialEntries.map(([name, isSet]) => (
                        <span
                          key={name}
                          style={{
                            fontSize: "0.66rem",
                            background: "var(--admin-surface-raised, #f3f4f6)",
                            color: isSet ? "#13803a" : "var(--admin-muted)",
                            padding: "1px 6px",
                            borderRadius: 3,
                            fontWeight: 600,
                          }}
                        >
                          {isSet ? "✓" : "—"} {name.replace(/_set$/, "").replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span className={`admin-iv-chip ${statusMeta.cls}`}>
                    {statusMeta.label}
                  </span>
                  {gw.setupRequired ? <span className="admin-iv-chip idle">Setup required</span> : null}
                  {gw.notLive ? <span className="admin-iv-chip soon">Not live</span> : null}
                  <span style={{ fontSize: "0.7rem", color: "var(--admin-muted)" }}>{open ? "▲ Close" : "▼ Configure"}</span>
                </div>
              </div>
              {open && (
                <div className="admin-iv-form">
                  {gw.fields.map((f) => (
                    <div key={f.key} className="admin-iv-field">
                      <label>{f.label}</label>
                      <input
                        type={f.type || "text"}
                        value={draft[f.key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        disabled={!canEdit}
                        autoComplete="off"
                      />
                      {f.hint && <span className="admin-iv-field-hint">{f.hint}</span>}
                    </div>
                  ))}
                  {canEdit && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="admin-btn-primary admin-btn-sm" onClick={save} disabled={saving}>
                        {saving ? "Saving…" : "Save credentials"}
                      </button>
                      <button className="admin-btn-sm active-outline" onClick={() => toggle(gw.key)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
