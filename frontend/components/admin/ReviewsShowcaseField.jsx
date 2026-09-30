"use client";

import { BLOCK, Enabled, ImageInput, ROW2, Text } from "./PageSectionsField";

const MAX_IMAGES = 12;

// Site settings has no product to attach a file to, so uploads go through the
// review-photo endpoint, which just stores an image and returns its /media URL.
async function uploadImage(file) {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("enfhant-admin-token") : null;
  const body = new FormData();
  body.append("files", file);
  const response = await fetch("/api/admin/reviews/images/", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.detail || "Upload failed.");
  return Array.isArray(data.urls) ? data.urls : [];
}

export default function ReviewsShowcaseField({ field, value, editor, setEditor }) {
  const name = field[0];
  const label = field[1];
  const data = { enabled: true, ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}) };
  const images = Array.isArray(data.images) && data.images.length ? data.images : [{ image_en: "", image_ar: "" }];
  const photos = Array.isArray(data.photos) ? data.photos : [];

  const commit = (patch) => setEditor({ ...editor, [name]: { ...data, ...patch } });
  const setImage = (index, patch) => commit({ images: images.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const setPhoto = (index, image) => commit({ photos: photos.map((item, i) => (i === index ? { image } : item)) });

  return (
    <div className="admin-label full-width">
      <span>{label}</span>
      <small className="admin-field-help">
        Used on every product page and on the &ldquo;Read more reviews&rdquo; page. Leave Arabic fields empty to reuse the
        English text or image.
      </small>

      <div style={{ ...BLOCK, marginTop: 10 }}>
        <Enabled checked={data.enabled !== false} onChange={(enabled) => commit({ enabled })} label="Show the reviews showcase" />
        <div style={ROW2}>
          <Text label="Customer count line (EN)" value={data.count_text_en} placeholder="20,000+ happy customers" onChange={(count_text_en) => commit({ count_text_en })} />
          <Text label="Customer count line (AR)" value={data.count_text_ar} onChange={(count_text_ar) => commit({ count_text_ar })} />
        </div>
        <div style={ROW2}>
          <Text label="Heading (EN)" value={data.title_en} placeholder="Real reviews from real customers" onChange={(title_en) => commit({ title_en })} />
          <Text label="Heading (AR)" value={data.title_ar} onChange={(title_ar) => commit({ title_ar })} />
        </div>
        <div style={ROW2}>
          <Text textarea label="Short text (EN)" value={data.subtitle_en} onChange={(subtitle_en) => commit({ subtitle_en })} />
          <Text textarea label="Short text (AR)" value={data.subtitle_ar} onChange={(subtitle_ar) => commit({ subtitle_ar })} />
        </div>
        <div style={ROW2}>
          <Text label="Button text (EN)" value={data.button_en} placeholder="Read more reviews" onChange={(button_en) => commit({ button_en })} />
          <Text label="Button text (AR)" value={data.button_ar} onChange={(button_ar) => commit({ button_ar })} />
        </div>
      </div>

      <details open style={{ ...BLOCK, marginTop: 10 }}>
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>Moving review images (designer images with the review text on them)</summary>
        {images.map((item, index) => (
          <div key={index} style={{ ...BLOCK, background: "#fafafa" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Image {index + 1}</strong>
              {images.length > 1 ? (
                <button type="button" className="admin-btn-secondary" onClick={() => commit({ images: images.filter((_, i) => i !== index) })}>Remove</button>
              ) : null}
            </div>
            <ImageInput label="English image (shown on the English site)" value={item.image_en} onChange={(image_en) => setImage(index, { image_en })} uploader={uploadImage} />
            <ImageInput label="Arabic image (shown on the Arabic site)" value={item.image_ar} onChange={(image_ar) => setImage(index, { image_ar })} uploader={uploadImage} />
          </div>
        ))}
        {images.length < MAX_IMAGES ? (
          <button type="button" className="admin-btn-secondary" style={{ width: "fit-content" }} onClick={() => commit({ images: [...images, { image_en: "", image_ar: "" }] })}>
            + Add image
          </button>
        ) : null}
      </details>

      <details style={{ ...BLOCK, marginTop: 10 }}>
        <summary style={{ fontWeight: 700, cursor: "pointer" }}>Customer photo strip (above the review list; falls back to photos from reviews)</summary>
        {photos.map((item, index) => (
          <div key={index} style={{ ...BLOCK, background: "#fafafa" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Photo {index + 1}</strong>
              <button type="button" className="admin-btn-secondary" onClick={() => commit({ photos: photos.filter((_, i) => i !== index) })}>Remove</button>
            </div>
            <ImageInput label="Photo" value={item.image} onChange={(image) => setPhoto(index, image)} uploader={uploadImage} />
          </div>
        ))}
        {photos.length < MAX_IMAGES ? (
          <button type="button" className="admin-btn-secondary" style={{ width: "fit-content" }} onClick={() => commit({ photos: [...photos, { image: "" }] })}>
            + Add photo
          </button>
        ) : null}
      </details>
    </div>
  );
}
