"use client";

import { useState } from "react";

const ICON_CHOICES = ["leaf", "shield", "drop", "heart", "sparkle", "check", "star", "clock"];
const FEATURE_COUNT = 4;
const COMPARISON_ROWS = 5;
const MAX_STEPS = 8;

const blankFeature = () => ({ icon: "leaf", title_en: "", title_ar: "", text_en: "", text_ar: "" });
const blankRow = () => ({ label_en: "", label_ar: "", us: true, other: false });

function pad(list, count, make) {
  const items = Array.isArray(list) ? list.slice(0, count) : [];
  while (items.length < count) items.push(make());
  return items;
}

export const BLOCK = { display: "grid", gap: 10, padding: 14, border: "1px solid #e5e5e5", borderRadius: 10, background: "#fff" };
export const ROW2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };

export function Text({ label, value, onChange, textarea = false, placeholder = "" }) {
  const Tag = textarea ? "textarea" : "input";
  return (
    <label className="admin-label" style={{ margin: 0 }}>
      {label}
      <Tag
        className={`admin-input${textarea ? " admin-textarea" : ""}`}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...(textarea ? { rows: 2 } : { type: "text" })}
      />
    </label>
  );
}

export function ImageInput({ label, value, onChange, slug, onGalleryUpload, uploader }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canUpload = typeof uploader === "function" || (Boolean(slug) && typeof onGalleryUpload === "function");

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const urls = uploader ? await uploader(file) : await onGalleryUpload(slug, file);
      const url = Array.isArray(urls) ? urls[0] : urls;
      if (url) onChange(url);
    } catch (err) {
      setError(err?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-label" style={{ margin: 0 }}>
      <span>{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {value ? (
          <img src={value} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e5e5" }} />
        ) : null}
        <input
          type="text"
          className="admin-input"
          style={{ flex: "1 1 220px" }}
          value={value ?? ""}
          placeholder="Image URL"
          onChange={(event) => onChange(event.target.value)}
        />
        {canUpload ? (
          <label className="admin-btn-secondary" style={{ cursor: "pointer" }}>
            <input type="file" accept="image/*" onChange={pick} disabled={busy} style={{ display: "none" }} />
            {busy ? "Uploading…" : "Upload"}
          </label>
        ) : null}
        {value ? (
          <button type="button" className="admin-btn-secondary" onClick={() => onChange("")}>Remove</button>
        ) : null}
      </div>
      {!canUpload ? <small className="admin-field-help">Save the product first to enable uploads, or paste an image URL.</small> : null}
      {error ? <small className="admin-field-help" style={{ color: "#c0392b" }}>{error}</small> : null}
    </div>
  );
}

export function Enabled({ checked, onChange, label }) {
  return (
    <label className="admin-label admin-check-label" style={{ margin: 0 }}>
      <input type="checkbox" className="admin-checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function PageSectionsField({ field, value, editor, setEditor, onGalleryUpload }) {
  const name = field[0];
  const label = field[1];
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const slug = editor?.slug;

  const features = { enabled: true, image: "", title_en: "", title_ar: "", ...(data.features || {}) };
  const featureItems = pad(features.items, FEATURE_COUNT, blankFeature);
  const how = { enabled: true, title_en: "", title_ar: "", subtitle_en: "", subtitle_ar: "", ...(data.how_it_works || {}) };
  const steps = Array.isArray(how.steps) && how.steps.length ? how.steps : [{ image_en: "", image_ar: "" }];
  const comparison = {
    enabled: true,
    title_en: "",
    title_ar: "",
    subtitle_en: "",
    subtitle_ar: "",
    us_label_en: "",
    us_label_ar: "",
    other_label_en: "",
    other_label_ar: "",
    ...(data.comparison || {}),
  };
  const rows = pad(comparison.rows, COMPARISON_ROWS, blankRow);

  const commit = (section, next) => setEditor({ ...editor, [name]: { ...data, [section]: next } });
  const setFeatures = (patch) => commit("features", { ...features, items: featureItems, ...patch });
  const setHow = (patch) => commit("how_it_works", { ...how, steps, ...patch });
  const setComparison = (patch) => commit("comparison", { ...comparison, rows, ...patch });

  const setItem = (index, patch) =>
    setFeatures({ items: featureItems.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const setStep = (index, patch) =>
    setHow({ steps: steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) });
  const setRow = (index, patch) =>
    setComparison({ rows: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  const cellValue = (raw) => (typeof raw === "string" ? "text" : raw ? "yes" : "no");
  const cellChange = (index, key, kind, current) => {
    if (kind === "yes") setRow(index, { [key]: true });
    else if (kind === "no") setRow(index, { [key]: false });
    else setRow(index, { [key]: typeof current === "string" ? current : "" });
  };

  return (
    <div className="admin-label full-width">
      <span>{label}</span>
      <small className="admin-field-help">
        Shown below the product description, in this order: Features, How it works, Comparison table. A section with
        no content stays hidden. Leave the Arabic fields empty to reuse the English text.
      </small>

      <details open style={{ ...BLOCK, marginTop: 10 }}>
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>1 · Features (picture, headline and 4 features)</summary>
        <Enabled checked={features.enabled !== false} onChange={(enabled) => setFeatures({ enabled })} label="Show this section" />
        <ImageInput label="Picture" value={features.image} onChange={(image) => setFeatures({ image })} slug={slug} onGalleryUpload={onGalleryUpload} />
        <div style={ROW2}>
          <Text label="Headline (EN)" value={features.title_en} onChange={(title_en) => setFeatures({ title_en })} />
          <Text label="Headline (AR)" value={features.title_ar} onChange={(title_ar) => setFeatures({ title_ar })} />
        </div>
        {featureItems.map((item, index) => (
          <div key={index} style={{ ...BLOCK, background: "#fafafa" }}>
            <strong>Feature {index + 1}</strong>
            <label className="admin-label" style={{ margin: 0 }}>
              Icon
              <select className="admin-input" value={item.icon || "leaf"} onChange={(event) => setItem(index, { icon: event.target.value })}>
                {ICON_CHOICES.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
              </select>
            </label>
            <div style={ROW2}>
              <Text label="Small heading (EN)" value={item.title_en} onChange={(title_en) => setItem(index, { title_en })} />
              <Text label="Small heading (AR)" value={item.title_ar} onChange={(title_ar) => setItem(index, { title_ar })} />
            </div>
            <div style={ROW2}>
              <Text textarea label="Details (EN)" value={item.text_en} onChange={(text_en) => setItem(index, { text_en })} />
              <Text textarea label="Details (AR)" value={item.text_ar} onChange={(text_ar) => setItem(index, { text_ar })} />
            </div>
          </div>
        ))}
      </details>

      <details style={{ ...BLOCK, marginTop: 10 }}>
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>2 · How it works (swipeable step cards)</summary>
        <Enabled checked={how.enabled !== false} onChange={(enabled) => setHow({ enabled })} label="Show this section" />
        <div style={ROW2}>
          <Text label="Heading (EN)" value={how.title_en} placeholder="How it works" onChange={(title_en) => setHow({ title_en })} />
          <Text label="Heading (AR)" value={how.title_ar} onChange={(title_ar) => setHow({ title_ar })} />
        </div>
        <div style={ROW2}>
          <Text textarea label="Short text (EN)" value={how.subtitle_en} onChange={(subtitle_en) => setHow({ subtitle_en })} />
          <Text textarea label="Short text (AR)" value={how.subtitle_ar} onChange={(subtitle_ar) => setHow({ subtitle_ar })} />
        </div>
        {steps.map((step, index) => (
          <div key={index} style={{ ...BLOCK, background: "#fafafa" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Step {index + 1}</strong>
              {steps.length > 1 ? (
                <button type="button" className="admin-btn-secondary" onClick={() => setHow({ steps: steps.filter((_, i) => i !== index) })}>Remove</button>
              ) : null}
            </div>
            <ImageInput label="English image" value={step.image_en} onChange={(image_en) => setStep(index, { image_en })} slug={slug} onGalleryUpload={onGalleryUpload} />
            <ImageInput label="Arabic image (optional)" value={step.image_ar} onChange={(image_ar) => setStep(index, { image_ar })} slug={slug} onGalleryUpload={onGalleryUpload} />
            <div style={ROW2}>
              <Text label="Step title (EN, optional)" value={step.title_en} onChange={(title_en) => setStep(index, { title_en })} />
              <Text label="Step title (AR, optional)" value={step.title_ar} onChange={(title_ar) => setStep(index, { title_ar })} />
            </div>
            <div style={ROW2}>
              <Text textarea label="Step text (EN, optional)" value={step.text_en} onChange={(text_en) => setStep(index, { text_en })} />
              <Text textarea label="Step text (AR, optional)" value={step.text_ar} onChange={(text_ar) => setStep(index, { text_ar })} />
            </div>
          </div>
        ))}
        {steps.length < MAX_STEPS ? (
          <button type="button" className="admin-btn-secondary" style={{ width: "fit-content" }} onClick={() => setHow({ steps: [...steps, { image_en: "", image_ar: "" }] })}>
            + Add step
          </button>
        ) : null}
        <small className="admin-field-help">
          The scrolling stats line under these images is edited in Site Settings → &ldquo;Product page proof ticker&rdquo;.
        </small>
      </details>

      <details style={{ ...BLOCK, marginTop: 10 }}>
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>3 · Comparison table (5 rows × 3 columns)</summary>
        <Enabled checked={comparison.enabled !== false} onChange={(enabled) => setComparison({ enabled })} label="Show this section" />
        <div style={ROW2}>
          <Text label="Heading (EN)" value={comparison.title_en} placeholder="How we stack up" onChange={(title_en) => setComparison({ title_en })} />
          <Text label="Heading (AR)" value={comparison.title_ar} onChange={(title_ar) => setComparison({ title_ar })} />
        </div>
        <div style={ROW2}>
          <Text textarea label="Text (EN)" value={comparison.subtitle_en} onChange={(subtitle_en) => setComparison({ subtitle_en })} />
          <Text textarea label="Text (AR)" value={comparison.subtitle_ar} onChange={(subtitle_ar) => setComparison({ subtitle_ar })} />
        </div>
        <div style={ROW2}>
          <Text label="Our column title (EN)" value={comparison.us_label_en} placeholder="Enfant Organic" onChange={(us_label_en) => setComparison({ us_label_en })} />
          <Text label="Our column title (AR)" value={comparison.us_label_ar} onChange={(us_label_ar) => setComparison({ us_label_ar })} />
        </div>
        <div style={ROW2}>
          <Text label="Other brands column title (EN)" value={comparison.other_label_en} placeholder="Other brands" onChange={(other_label_en) => setComparison({ other_label_en })} />
          <Text label="Other brands column title (AR)" value={comparison.other_label_ar} onChange={(other_label_ar) => setComparison({ other_label_ar })} />
        </div>
        {rows.map((row, index) => (
          <div key={index} style={{ ...BLOCK, background: "#fafafa" }}>
            <strong>Row {index + 1}</strong>
            <div style={ROW2}>
              <Text label="Feature (EN)" value={row.label_en} onChange={(label_en) => setRow(index, { label_en })} />
              <Text label="Feature (AR)" value={row.label_ar} onChange={(label_ar) => setRow(index, { label_ar })} />
            </div>
            {[["us", "Our column"], ["other", "Other brands column"]].map(([key, title]) => {
              const kind = cellValue(row[key]);
              return (
                <div key={key} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="admin-label" style={{ margin: 0 }}>
                    {title}
                    <select className="admin-input" value={kind} onChange={(event) => cellChange(index, key, event.target.value, row[key])}>
                      <option value="yes">✓ Yes</option>
                      <option value="no">✕ No</option>
                      <option value="text">Custom text</option>
                    </select>
                  </label>
                  {kind === "text" ? (
                    <div style={{ flex: "1 1 200px" }}>
                      <Text label="Text" value={row[key]} onChange={(text) => setRow(index, { [key]: text })} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </details>
    </div>
  );
}
