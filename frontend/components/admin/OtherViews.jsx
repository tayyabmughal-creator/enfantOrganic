"use client";
import { useState, useEffect, useCallback } from "react";
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

// ─── Integration catalogue ────────────────────────────────────────────────────

const INTEGRATIONS_BY_CATEGORY = {
  social: [
    {
      id: "facebook",
      name: "Meta / Facebook",
      abbr: "f",
      color: "#1877F2",
      desc: "Facebook Pixel for event tracking, Facebook Shops catalog sync, and dynamic product ads targeting.",
      fields: [
        { key: "facebook_pixel_id", label: "Pixel ID",         placeholder: "123456789012345",  hint: "Events Manager → Pixels → your pixel ID" },
        { key: "facebook_app_id",   label: "App ID (optional)", placeholder: "987654321012345", hint: "Meta App Dashboard → App settings → Basic" },
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
      (integration.fields || []).forEach((f) => { fields[f.key] = form[f.key] || ""; });
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
      (integration.fields || []).forEach((f) => { fields[f.key] = ""; });
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
                        <input
                          type="text"
                          className="admin-input"
                          value={form[field.key] || ""}
                          placeholder={field.placeholder}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                        />
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

export function RegionsView({ rows, request, onSaved }) {
  const [editingThreshold, setEditingThreshold] = useState({});
  const [savingThreshold, setSavingThreshold] = useState({});
  const [thresholdError, setThresholdError] = useState({});

  const [editingWhatsapp, setEditingWhatsapp] = useState({});
  const [savingWhatsapp, setSavingWhatsapp] = useState({});
  const [whatsappError, setWhatsappError] = useState({});

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

  if (!rows.length) {
    return (
      <section className="admin-panel-card">
        <div className="admin-panel-head"><h3>Regions</h3><span>No regions configured.</span></div>
      </section>
    );
  }
  return (
    <div className="admin-regions">
      {rows.map((region) => {
        const code = region.code;
        const isEditing = editingThreshold[code] !== undefined;
        const isSaving = savingThreshold[code];
        const error = thresholdError[code];
        const isEditingWa = editingWhatsapp[code] !== undefined;
        const isSavingWa = savingWhatsapp[code];
        const waError = whatsappError[code];
        return (
          <section key={region.id || code} className="admin-panel-card admin-region-card">
            <div className="admin-panel-head">
              <div>
                <h3>{region.name || code?.toUpperCase()} <span className="admin-badge neutral">{code?.toUpperCase()}</span></h3>
                <span>{region.currency_code} · {region.locale || "en/ar"}</span>
              </div>
              <span className={`admin-badge ${region.is_active ? "success" : "neutral"}`}>{region.is_active ? "Active" : "Inactive"}</span>
            </div>
            <div className="admin-settings-preview">
              {region.seller_legal_name && <div className="admin-settings-row"><strong>Legal name</strong><span>{region.seller_legal_name}</span></div>}
              {region.contact_email && <div className="admin-settings-row"><strong>Contact email</strong><span>{region.contact_email}</span></div>}
              {region.contact_phone && <div className="admin-settings-row"><strong>Contact phone</strong><span>{region.contact_phone}</span></div>}
              {region.seller_address_en && <div className="admin-settings-row"><strong>Address</strong><span>{region.seller_address_en}</span></div>}
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
  const [form, setForm] = useState({ image: "", href: "" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { setPosts(rows); }, [rows]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.image.trim()) { setError("Image URL is required."); return; }
    setSaving(true); setError("");
    try {
      await request("/admin/instagram-posts/", { method: "POST", body: JSON.stringify({ image: form.image.trim(), href: form.href.trim() }) });
      setForm({ image: "", href: "" });
      setAdding(false);
      onSaved?.();
    } catch { setError("Failed to save. Check the URL and try again."); }
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
              <span>Image URL</span>
              <input
                type="url"
                placeholder="https://cdn.example.com/photo.jpg"
                value={form.image}
                onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                required
              />
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
          {form.image && (
            <div className="ig-post-preview-thumb">
              <img src={form.image} alt="preview" onError={(e) => { e.target.style.display = "none"; }} />
            </div>
          )}
          {error && <p className="admin-threshold-error">{error}</p>}
          <div className="ig-post-add-actions">
            <button type="submit" className="admin-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" className="admin-btn-ghost" onClick={() => { setAdding(false); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}

      {posts.length === 0 && !adding ? (
        <AdminEmpty message="No Instagram posts yet. Add the first one." />
      ) : (
        <div className="ig-admin-grid">
          {posts.map((post) => (
            <div key={post.id} className="ig-admin-tile">
              <img src={post.image} alt="" onError={(e) => { e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23e8f0e0'/%3E%3C/svg%3E"; }} />
              <div className="ig-admin-tile-overlay">
                <a href={post.href} target="_blank" rel="noopener noreferrer" className="ig-admin-tile-link" title="Open post">↗</a>
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
  { key: "integration_id", label: "Integration ID", type: "text",                    hint: "Paymob → Developers → Payment Integrations — the numeric ID for this region" },
  { key: "iframe_id",      label: "iFrame ID",      type: "text",                    hint: "Paymob → Developers → iFrames — the numeric ID" },
  { key: "hmac_secret",    label: "HMAC Secret",    type: "password", secret: true,  hint: "Paymob → Settings → Account Info → HMAC — used to verify callbacks" },
  { key: "base_url",       label: "API Base URL",   type: "text",                    hint: "Leave blank to use the default https://accept.paymob.com/api" },
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
      iframe_id: region.iframe_id || "",
      base_url: region.base_url || "",
      currency: region.currency || "",
      api_key: "",       // secrets are never prefilled
      hmac_secret: "",
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
            {["api_key", "integration_id", "iframe_id", "hmac_secret"].map((k) => (
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
            const isSet = f.key === "api_key" ? region.api_key_set : f.key === "hmac_secret" ? region.hmac_secret_set : false;
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
          const open = expanded === gw.key;
          return (
            <div key={gw.key} className={`admin-iv-card${connected ? " connected" : ""}${open ? " expanded" : ""}`}>
              <div className="admin-iv-main" role="button" tabIndex={0} onClick={() => toggle(gw.key)} onKeyDown={(e) => e.key === "Enter" && toggle(gw.key)}>
                <div className="admin-iv-logo" style={{ background: gw.color }}>{gw.logo}</div>
                <div className="admin-iv-info">
                  <strong>{gw.name}</strong>
                  <span>{gw.desc}</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                    {gw.regions.map((r) => (
                      <span key={r} style={{ fontSize: "0.68rem", background: "var(--admin-surface-raised, #f3f4f6)", color: "var(--admin-muted)", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{r}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span className={`admin-iv-chip ${connected ? "connected" : "idle"}`}>
                    {connected ? "Connected" : "Not configured"}
                  </span>
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
