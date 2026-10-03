"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Icon from "@/components/icons/Icon";
import SiteImage from "@/components/ui/SiteImage";
import ProductVideoTile from "@/components/store/product/ProductVideoTile";
import ProductReviewsSection from "@/components/store/product/ProductReviewsSection";
import { ProductReviewShowcase } from "@/components/store/product/ProductReviewShowcase";
import {
  ProductComparisonSection,
  ProductFeaturesSection,
  ProductHowItWorksSection,
} from "@/components/store/product/ProductPageSections";
import { useStore } from "@/components/store/cart/StoreProvider";
import { buildAnalyticsItem, pushDataLayerEvent } from "@/lib/analytics";
import { fbqTrack, snaptrTrack, ttqTrack } from "@/components/store/analytics/AnalyticsScripts";
import { API_BASE_URL, CUSTOMER_TOKEN_KEY } from "@/lib/config";
import { trackEvent } from "@/lib/eventTracking";
import { hasHtml, sanitizeHtml } from "@/lib/safeHtml";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";

const DESC_ICONS = ["leaf", "shield", "check", "sparkle"];

function pickIcon(text, index) {
  const t = text.toLowerCase();
  if (t.includes("natural") || t.includes("organic") || t.includes("ingredient") || t.includes("plant") || t.includes("extract")) return "leaf";
  if (t.includes("safe") || t.includes("protect") || t.includes("dermatol") || t.includes("certif") || t.includes("tested") || t.includes("clinically")) return "shield";
  if (t.includes("pure") || t.includes("clean") || t.includes("free") || t.includes("paraben") || t.includes("alcohol") || t.includes("dye")) return "check";
  if (t.includes("hydrat") || t.includes("moistur") || t.includes("nourish") || t.includes("soft") || t.includes("sooth") || t.includes("calm")) return "sparkle";
  return DESC_ICONS[index % DESC_ICONS.length];
}

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1FFFF}✅🚫✨💗☁️]/u;
const STRIP_EMOJI_RE = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1FFFF}✅🚫✨💗☁️\s]+/u;

function cleanTitle(raw) {
  const piped = raw.includes("|") ? raw.split("|").pop().trim() : raw;
  return piped.length > 60 ? piped.slice(0, 58).replace(/\s\S*$/, "").trim() : piped.trim();
}

function buildCard(text, index) {
  const clean = text.replace(STRIP_EMOJI_RE, "").trim();
  const colonIdx = clean.indexOf(":");
  const hasTitle = colonIdx > 0 && colonIdx < 65;
  const rawTitle = hasTitle ? clean.slice(0, colonIdx) : clean.slice(0, 60).replace(/\s\S*$/, "");
  const title = cleanTitle(rawTitle);
  const body = hasTitle ? clean.slice(colonIdx + 1).trim() : clean;
  return { icon: pickIcon(clean, index), title, body };
}

function parseDescSections(description) {
  if (!description) return [];

  const emojiParts = description
    .split(/(?=[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1FFFF}✅🚫✨💗☁️])/u)
    .map(s => s.trim())
    .filter(s => s.replace(STRIP_EMOJI_RE, "").length > 25);

  const candidates = emojiParts.length > 1 ? emojiParts.slice(1) : emojiParts;

  if (candidates.length >= 3) {
    const total = candidates.length;
    const indices = total <= 4
      ? [0, 1, 2, 3].slice(0, total)
      : [0, Math.floor(total / 3), Math.floor((2 * total) / 3), total - 1];
    return indices.map((idx, i) => buildCard(candidates[idx], i));
  }

  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  if (!sentences.length) return [];

  const bucketSize = Math.ceil(sentences.length / 4);
  return [0, 1, 2, 3].map(i => {
    const bucket = sentences.slice(i * bucketSize, (i + 1) * bucketSize);
    if (!bucket.length) return null;
    const [first, ...rest] = bucket;
    const colonIdx = first.indexOf(":");
    const hasTitle = colonIdx > 0 && colonIdx < 65;
    const rawTitle = hasTitle ? first.slice(0, colonIdx) : first.slice(0, 60).replace(/\s\S*$/, "");
    const title = cleanTitle(rawTitle);
    const body = hasTitle
      ? [first.slice(colonIdx + 1).trim(), ...rest].join(" ").trim()
      : rest.join(" ").trim() || first;
    return { icon: pickIcon(first + " " + body, i), title, body };
  }).filter(Boolean);
}

function AccordionPlus() {
  return (
    <svg className="detail-accordion-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path className="detail-accordion-icon-v" d="M12 5v14" />
    </svg>
  );
}

function DescriptionText({ description }) {
  if (!description) return null;
  if (hasHtml(description)) {
    return <div className="product-desc-text rich-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }} />;
  }
  return (
    <div className="product-desc-text">
      {description.split(/\n+/).filter(Boolean).map((para, i) => (
        <p key={i}>{para}</p>
      ))}
    </div>
  );
}

function optionPillLabel(groupName, value, variants, selectedOptions) {
  const normalizedGroup = String(groupName || "").toLowerCase();
  const matchCurrentSelection = (variant) =>
    Object.entries(selectedOptions || {}).every(
      ([name, selected]) => name === groupName || variant.options?.[name] === selected,
    );
  const variant =
    variants.find((item) => item.options?.[groupName] === value && matchCurrentSelection(item)) ||
    variants.find((item) => item.options?.[groupName] === value);
  const options = variant?.options || {};
  const secondaryEntry = Object.entries(options).find(([name, optionValue]) => {
    const normalizedName = String(name || "").toLowerCase();
    return (
      name !== groupName &&
      String(optionValue || "").trim() &&
      normalizedGroup !== "size" &&
      (normalizedName.includes("size") || normalizedName.includes("capacity") || normalizedName.includes("volume"))
    );
  });
  return {
    primary: value,
    secondary: secondaryEntry?.[1] || "",
  };
}

function findSelectedVariant(variants, selectedOptions) {
  if (!Array.isArray(variants) || !variants.length) return null;
  const selectedEntries = Object.entries(selectedOptions || {});
  return (
    variants.find((variant) =>
      selectedEntries.every(([name, value]) => variant.options?.[name] === value),
    ) || variants[0] || null
  );
}

function getCompatibleValues(variants, groupName, selectedOptions, groupValues = []) {
  // Plenty of products carry a descriptive option group — "Size: 500 ml" — with no
  // variants behind it. Deriving availability from an empty variant list marked
  // every such value unavailable, which rendered the only size faded and struck
  // through. With nothing to be incompatible with, every value stays selectable.
  if (!Array.isArray(variants) || !variants.length) {
    return new Set(groupValues);
  }

  return new Set(
    variants
      .filter((v) =>
        Object.entries(selectedOptions).every(
          ([name, val]) => name === groupName || v.options?.[name] === val,
        ),
      )
      .map((v) => v.options?.[groupName])
      .filter(Boolean),
  );
}

function resolveOptionsOnChange(groupName, value, variants, current) {
  const next = { ...current, [groupName]: value };
  const valid = variants.find((v) =>
    Object.entries(next).every(([n, val]) => v.options?.[n] === val),
  );
  if (valid) return next;
  const fallback = variants.find((v) => v.options?.[groupName] === value);
  return fallback ? { ...next, ...fallback.options } : next;
}

function StarRating({ rating = 5, size = 16 }) {
  const fullStars = Math.max(0, Math.min(5, Math.floor(Number(rating || 5))));
  return (
    <span className="star-rating" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={i < fullStars ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.4"
          className={`star ${i < fullStars ? "is-filled" : ""}`}
        >
          <path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.6 6.3 20.6l1.1-6.4L2.8 9.7l6.4-.9L12 3Z" />
        </svg>
      ))}
    </span>
  );
}

// "How will customer leave a review on a product?" — they could not. The only
// endpoint wanted a signed-in customer with a delivered order, and checkout here
// is guest-first and often phone-only, so nothing was ever submitted.
// The form lives in a dialog opened from the top of the reviews section: nobody
// scrolls past every review to find a "write one" link at the bottom.
const REVIEW_MAX_PHOTOS = 4;
const REVIEW_MAX_PHOTO_MB = 6;

function WriteReviewModal({ slug, locale, open, onClose }) {
  const isAr = locale === "ar";
  const [form, setForm] = useState({
    customer_name: "", rating: 5, title: "", comment: "", order_number: "", email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState("");

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  function addPhotos(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    const next = [...photos];
    let message = "";
    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        message = isAr ? "اختر ملفات صور فقط." : "Please choose image files only.";
        continue;
      }
      if (file.size > REVIEW_MAX_PHOTO_MB * 1024 * 1024) {
        message = isAr
          ? `الصورة أكبر من ${REVIEW_MAX_PHOTO_MB} ميجابايت.`
          : `A photo is larger than ${REVIEW_MAX_PHOTO_MB} MB.`;
        continue;
      }
      if (next.length >= REVIEW_MAX_PHOTOS) {
        message = isAr
          ? `يمكنك إضافة ${REVIEW_MAX_PHOTOS} صور كحد أقصى.`
          : `You can add up to ${REVIEW_MAX_PHOTOS} photos.`;
        break;
      }
      next.push({
        id: `${Date.now()}-${next.length}-${file.name}`,
        file,
        preview: URL.createObjectURL(file),
      });
    }
    setPhotos(next);
    setPhotoError(message);
  }

  function removePhoto(id) {
    setPhotos((current) => {
      const hit = current.find((photo) => photo.id === id);
      if (hit) URL.revokeObjectURL(hit.preview);
      return current.filter((photo) => photo.id !== id);
    });
    setPhotoError("");
  }

  useEffect(() => {
    if (open) return;
    setPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.preview));
      return current.length ? [] : current;
    });
    setPhotoError("");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form, rating: Number(form.rating) };
      let options;
      if (photos.length) {
        // Photos need a multipart body; the browser sets its boundary header.
        const body = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== "" && value != null) body.append(key, String(value));
        });
        photos.forEach((photo) => body.append("images", photo.file));
        options = { method: "POST", body };
      } else {
        options = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        };
      }
      const response = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(slug)}/reviews/`, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // DRF returns {field: [message]}; show the first thing it objected to.
        const first = Object.values(data).flat()[0];
        throw new Error(typeof first === "string" ? first : (isAr ? "تعذّر إرسال المراجعة." : "Could not send your review."));
      }
      setDone(data);
    } catch (err) {
      setError(err?.message || (isAr ? "تعذّر إرسال المراجعة." : "Could not send your review."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="review-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="review-modal" role="dialog" aria-modal="true" aria-label={isAr ? "اكتب مراجعة" : "Write a review"}>
        <button type="button" className="review-modal-close" onClick={onClose} aria-label={isAr ? "إغلاق" : "Close"}>
          ×
        </button>

        {done ? (
          <div className="review-form-done">
            <strong>{isAr ? "شكرًا لك!" : "Thank you!"}</strong>
            <p>
              {isAr
                ? "تم إرسال مراجعتك وستظهر بعد المراجعة."
                : "Your review has been sent and will appear once it is approved."}
            </p>
            <button type="button" className="primary-action" onClick={onClose}>
              {isAr ? "إغلاق" : "Close"}
            </button>
          </div>
        ) : (
          <form className="review-form" onSubmit={submit}>
            <h3 className="review-modal-title">{isAr ? "اكتب مراجعة" : "Write a review"}</h3>

            <fieldset className="review-star-picker">
              <legend>{isAr ? "التقييم" : "Your rating"}</legend>
              <div className="review-star-picker-stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`review-star${Number(form.rating) >= value ? " is-on" : ""}`}
                    onClick={() => setForm((prev) => ({ ...prev, rating: value }))}
                    aria-label={`${value} ${isAr ? "نجوم" : "stars"}`}
                    aria-pressed={Number(form.rating) === value}
                  >
                    ★
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="review-form-row">
              <label>
                <span>{isAr ? "الاسم" : "Your name"}</span>
                <input value={form.customer_name} onChange={set("customer_name")} required maxLength={160} />
              </label>
              <label>
                <span>{isAr ? "العنوان (اختياري)" : "Title (optional)"}</span>
                <input value={form.title} onChange={set("title")} maxLength={160} />
              </label>
            </div>
            <label>
              <span>{isAr ? "مراجعتك" : "Your review"}</span>
              <textarea value={form.comment} onChange={set("comment")} required rows={4} maxLength={4000} />
            </label>
            <div className="review-photos">
              <span className="review-photos-label">{isAr ? "أضف صورًا (اختياري)" : "Add photos (optional)"}</span>
              <div className="review-photos-row">
                {photos.map((photo) => (
                  <div key={photo.id} className="review-photo-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.preview} alt="" />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      aria-label={isAr ? "إزالة الصورة" : "Remove photo"}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {photos.length < REVIEW_MAX_PHOTOS ? (
                  <label className="review-photo-add">
                    <input type="file" accept="image/*" multiple onChange={addPhotos} />
                    <span aria-hidden="true">+</span>
                    <small>{isAr ? "إضافة صورة" : "Add photo"}</small>
                  </label>
                ) : null}
              </div>
              <small className="review-form-help">
                {isAr
                  ? `حتى ${REVIEW_MAX_PHOTOS} صور، ${REVIEW_MAX_PHOTO_MB} ميجابايت لكل صورة.`
                  : `Up to ${REVIEW_MAX_PHOTOS} photos, ${REVIEW_MAX_PHOTO_MB} MB each.`}
              </small>
              {photoError ? <div className="review-form-error">{photoError}</div> : null}
            </div>
            <div className="review-form-row">
              <label>
                <span>{isAr ? "رقم الطلب (اختياري)" : "Order number (optional)"}</span>
                <input value={form.order_number} onChange={set("order_number")} placeholder="EO-…" />
              </label>
              <label>
                <span>{isAr ? "البريد الإلكتروني للطلب" : "Order email"}</span>
                <input type="email" value={form.email} onChange={set("email")} />
              </label>
            </div>
            <small className="review-form-help">
              {isAr
                ? "أضف رقم الطلب والبريد الإلكتروني للحصول على شارة \"شراء موثّق\"."
                : "Add your order number and email to earn a \"verified purchase\" badge."}
            </small>
            {error ? <div className="review-form-error">{error}</div> : null}
            <div className="review-form-actions">
              <button type="submit" className="primary-action" disabled={submitting}>
                {submitting ? (isAr ? "جارٍ الإرسال…" : "Sending…") : (isAr ? "إرسال المراجعة" : "Submit review")}
              </button>
              <button type="button" className="secondary-action" onClick={onClose}>
                {isAr ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// An offer strip right under the price — the position the client asked for. Empty text hides it; a deadline turns it into a live countdown.
function UrgencyStrip({ urgency }) {
  const text = String(urgency?.text || "").trim();
  const endsAt = urgency?.endsAt ? new Date(urgency.endsAt) : null;
  const hasDeadline = endsAt && !Number.isNaN(endsAt.getTime());
  // The clock is read only after mount: the server and the first client render must
  // print the same text, and "now" differs between them.
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!hasDeadline) return undefined;
    setRemaining(endsAt - Date.now());
    const timer = setInterval(() => setRemaining(endsAt - Date.now()), 1000);
    return () => clearInterval(timer);
    // endsAt is derived from a string prop, so compare on that.
  }, [hasDeadline, urgency?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!text) return null;
  // A deadline that has passed takes the strip with it rather than showing 00:00.
  if (hasDeadline && remaining !== null && remaining <= 0) return null;

  const pad = (value) => String(Math.floor(value)).padStart(2, "0");
  const countdown = hasDeadline && remaining !== null
    ? `${pad(remaining / 86400000)}d ${pad((remaining / 3600000) % 24)}h ${pad((remaining / 60000) % 60)}m ${pad((remaining / 1000) % 60)}s`
    : "";

  return (
    <div className="product-urgency-strip">
      <span className="product-urgency-text">{text}</span>
      {countdown ? <span className="product-urgency-countdown">{countdown}</span> : null}
    </div>
  );
}

export default function ProductDetailClient({ locale, product, region, deliveryEta, urgency, productVideoPanel, fbtProducts, socialProofItems, reviewsShowcase }) {
  const { addItem, flyToCart } = useStore();
  const addBtnRef = useRef(null);
  const router = useRouter();
  const t = uiText(locale);
  const isAr = locale === "ar";
  const galleryImages = Array.from(
    new Set((product.gallery?.length ? product.gallery : [product.image]).filter(Boolean)),
  );
  const optionGroups = Array.isArray(product.option_groups) ? product.option_groups : [];
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const editorialReviews = Array.isArray(product.reviews) ? product.reviews : [];
  const customerReviews = Array.isArray(product.customer_reviews) ? product.customer_reviews : [];
  const [selectedImage, setSelectedImage] = useState(galleryImages[0] || product.image);
  // A variant's own photo is not always part of the gallery; lead with it then.
  const slideImages = selectedImage && !galleryImages.includes(selectedImage)
    ? [selectedImage, ...galleryImages]
    : galleryImages;
  const galleryTrackRef = useRef(null);
  const slideSyncFrameRef = useRef(0);
  const pendingSlideScrollRef = useRef("");

  // Scroll the phone rail so `index` sits at its start edge. Measured with
  // rects so the same delta works in RTL, and assigned (not smooth) because
  // Chrome drops smooth programmatic scrolls on snap containers.
  const scrollTrackTo = (index) => {
    const track = galleryTrackRef.current;
    const slide = track?.children?.[index];
    if (!track || !slide || track.scrollWidth <= track.clientWidth) return;
    const isRtl = getComputedStyle(track).direction === "rtl";
    const trackRect = track.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const padStart = parseFloat(getComputedStyle(track).paddingInlineStart) || 0;
    track.scrollLeft += isRtl
      ? slideRect.right - (trackRect.right - padStart)
      : slideRect.left - (trackRect.left + padStart);
  };

  const showSlide = (image) => {
    setSelectedImage(image);
    scrollTrackTo(slideImages.indexOf(image));
  };

  const syncSlideFromScroll = () => {
    cancelAnimationFrame(slideSyncFrameRef.current);
    slideSyncFrameRef.current = requestAnimationFrame(() => {
      const track = galleryTrackRef.current;
      if (!track) return;
      const isRtl = getComputedStyle(track).direction === "rtl";
      const trackRect = track.getBoundingClientRect();
      let closest = 0;
      let closestDistance = Infinity;
      Array.from(track.children).forEach((slide, index) => {
        const rect = slide.getBoundingClientRect();
        const distance = Math.abs(isRtl ? trackRect.right - rect.right : rect.left - trackRect.left);
        if (distance < closestDistance) {
          closestDistance = distance;
          closest = index;
        }
      });
      const image = slideImages[closest];
      if (image && image !== selectedImage) setSelectedImage(image);
    });
  };
  const [openAccordion, setOpenAccordion] = useState("description");
  const toggleAccordion = (key) => setOpenAccordion(prev => prev === key ? "" : key);
  const [quantity, setQuantity] = useState(1);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notifySubmitting, setNotifySubmitting] = useState(false);
  const [notifySuccess, setNotifySuccess] = useState("");
  const [notifyError, setNotifyError] = useState("");
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const lastTrackedViewItemRef = useRef("");
  const lastPixelViewItemRef = useRef("");
  const [selectedOptions, setSelectedOptions] = useState(
    Object.fromEntries(optionGroups.map((group) => [group.name, group.values[0]])),
  );
  const selectedVariant = findSelectedVariant(variants, selectedOptions);
  const selectedPricing = selectedVariant?.pricing?.amount != null ? selectedVariant.pricing : product.pricing;
  const selectedVariantStock = selectedVariant?.stock_quantity;
  const isOutOfStock = selectedVariantStock != null
    ? Number(selectedVariantStock) <= 0
    : Boolean(product?.stock_status?.track_inventory) && !Boolean(product?.stock_status?.is_in_stock);
  const reviewCount = Number(product.review_count || customerReviews.length || 0);
  const currentAmount = Number(selectedPricing?.amount || 0);
  const compareAmount = Number(selectedPricing?.compare_amount || 0);
  const showComparePrice = compareAmount > currentAmount;
  const discountPercent = showComparePrice
    ? Math.round((1 - currentAmount / compareAmount) * 100)
    : 0;
  const productVideoUrls = Array.isArray(productVideoPanel?.videos)
    ? productVideoPanel.videos.filter((url) => typeof url === "string" && url.trim()).slice(0, 3)
    : [];
  const showProductVideoPanel = Boolean(productVideoPanel?.enabled && productVideoUrls.length);

  // Frequently Bought Together
  const fbtList = Array.isArray(fbtProducts) ? fbtProducts.filter(Boolean) : [];
  const showFbt = fbtList.length > 0;
  const [fbtTier, setFbtTier] = useState(1); // 1 = just this product, 2 = +1 companion, 3 = +2 companions

  const [showMobileBar, setShowMobileBar] = useState(false);
  const actionsRef = useRef(null);

  // The market's own delivery promise when the admin has set one; otherwise the
  // generic wording, rather than inventing a lead time nobody committed to.
  const etaMin = Number(deliveryEta?.min) || 0;
  const etaMax = Number(deliveryEta?.max) || 0;
  const deliveryCopy = etaMax > 0
    ? (isAr
        ? (etaMin && etaMin !== etaMax ? `التوصيل خلال ${etaMin}-${etaMax} يوم` : `التوصيل خلال ${etaMax} يوم`)
        : (etaMin && etaMin !== etaMax ? `Delivery in ${etaMin}-${etaMax} days` : `Delivery in ${etaMax} days`))
    : t.freeShipping;

  const accordionSections = [
    product.usage_instructions
      ? {
          key: "how",
          title: isAr ? "طريقة الاستخدام" : "How it works",
          body: <DescriptionText description={product.usage_instructions} />,
        }
      : null,
    product.ingredients
      ? {
          key: "ingredients",
          title: isAr ? "المكونات" : "Ingredients",
          body: <DescriptionText description={product.ingredients} />,
        }
      : null,
    {
      key: "shipping",
      title: isAr ? "الشحن والتوصيل" : "Shipping & Delivery",
      body: (
        <div className="product-desc-text">
          {etaMax > 0 ? <p>{deliveryCopy}</p> : null}
          <p>
            {isAr ? "تعرف على تفاصيل التوصيل في " : "See full delivery details in our "}
            <Link href={buildStorePath(locale, "/shipping-policy", region)}>
              {isAr ? "سياسة الشحن" : "Shipping Policy"}
            </Link>
            {isAr ? " و" : " and "}
            <Link href={buildStorePath(locale, "/return-policy", region)}>
              {isAr ? "سياسة الإرجاع" : "Return Policy"}
            </Link>
            .
          </p>
        </div>
      ),
    },
  ].filter(Boolean);

  const paymentLogos = [
    {
      key: "applepay",
      svg: (
        <svg viewBox="0 0 72 28" xmlns="http://www.w3.org/2000/svg" style={{ height: 20, width: "auto" }}>
          <path d="M13.5 6.3c.7-.9 1.2-2.1 1.1-3.3-1.1.1-2.3.7-3.1 1.6-.7.8-1.3 2-1.1 3.1 1.2.1 2.4-.5 3.1-1.4z" fill="#111" />
          <path d="M14.6 8c-1.7-.1-3.1.9-3.9.9-.8 0-2.1-.9-3.4-.8-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.7 2.5 2.9 2.5 1.1 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.2 2.8-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.4-.9-2.4-3.6 0-2.3 1.8-3.3 1.9-3.4-1.1-1.6-2.7-2.1-3.3-2.1z" fill="#111" />
          <text x="22" y="20" fontFamily="-apple-system,BlinkMacSystemFont,Helvetica Neue,sans-serif" fontSize="14" fontWeight="400" fill="#111">Pay</text>
        </svg>
      ),
    },
    {
      key: "visa",
      svg: (
        <svg viewBox="0 0 60 24" xmlns="http://www.w3.org/2000/svg" style={{ height: 18, width: "auto" }}>
          <text x="4" y="18" fontFamily="Arial,sans-serif" fontSize="18" fontWeight="900" fontStyle="italic" fill="#1A1F71" letterSpacing="-1">VISA</text>
        </svg>
      ),
    },
    {
      key: "mastercard",
      svg: (
        <svg viewBox="0 0 50 30" xmlns="http://www.w3.org/2000/svg" style={{ height: 20, width: "auto" }}>
          <circle cx="18" cy="15" r="12" fill="#EB001B" />
          <circle cx="32" cy="15" r="12" fill="#F79E1B" />
          <path d="M25 6.8a12 12 0 0 1 0 16.4A12 12 0 0 1 25 6.8Z" fill="#FF5F00" />
        </svg>
      ),
    },
    {
      key: "cod",
      svg: (
        <svg viewBox="0 0 72 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ height: 20, width: "auto" }}>
          <rect x="1" y="7" width="26" height="14" rx="2.5" stroke="#4a7c4e" strokeWidth="1.5" />
          <circle cx="14" cy="14" r="3.5" stroke="#4a7c4e" strokeWidth="1.3" />
          <line x1="1" y1="11" x2="27" y2="11" stroke="#4a7c4e" strokeWidth="1" />
          <line x1="1" y1="17" x2="27" y2="17" stroke="#4a7c4e" strokeWidth="1" />
          <text x="31" y="19" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="800" letterSpacing="0.5" fill="#4a7c4e">COD</text>
        </svg>
      ),
    },
  ];

  useEffect(() => {
    if (selectedVariant?.image) {
      pendingSlideScrollRef.current = selectedVariant.image;
      setSelectedImage(selectedVariant.image);
    }
  }, [selectedVariant?.id, selectedVariant?.image]);

  // Bring the rail round to a variant's photo once it has rendered as a slide.
  useEffect(() => {
    if (!pendingSlideScrollRef.current || pendingSlideScrollRef.current !== selectedImage) return;
    pendingSlideScrollRef.current = "";
    scrollTrackTo(slideImages.indexOf(selectedImage));
  }, [selectedImage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentUrl(window.location.href);
    }
  }, [locale, product.slug, region]);

  useEffect(() => {
    if (!isOutOfStock || typeof window === "undefined") return;
    const token = localStorage.getItem(CUSTOMER_TOKEN_KEY) || "";
    if (!token) return;
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/account/profile/`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (cancelled) return;
        if (payload?.email) {
          setNotifyEmail(String(payload.email));
        }
      } catch {
        // Non-fatal: guests can still enter email manually.
      }
    };
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [isOutOfStock]);

  useEffect(() => {
    const key = `${region}:${product.slug}`;
    const item = buildAnalyticsItem(product);
    if (!item) {
      return;
    }
    // Pixels + admin funnel dedupe on their own ref: tying it to the
    // consent-gated dataLayer push below made every re-render re-fire
    // ViewContent (double counts on Meta/TikTok/Snap) when consent was unset.
    if (lastPixelViewItemRef.current !== key) {
      lastPixelViewItemRef.current = key;
      trackEvent("product_view", { productSlug: product.slug, regionCode: region });
      snaptrTrack("VIEW_CONTENT", {
        item_ids: [product.slug],
        item_category: item?.item_category || "",
        price: Number(product.pricing?.amount || 0),
        currency: product.pricing?.currency_code || "",
        description: product.name_en || product.name || "",
        number_items: 1,
      });
      // Meta ViewContent — value/currency from the same pricing source as the other events.
      fbqTrack(
        "ViewContent",
        {
          content_ids: [product.slug],
          content_name: product.name_en || product.name || "",
          content_type: "product",
          content_category: item?.item_category || "",
          value: Number(product.pricing?.amount || 0),
          currency: product.pricing?.currency_code || "",
        },
        // A browse event has no checkout details, so the region is the only
        // customer-information key available — the server turns it into `country`.
        // Without it Meta reported these events as having no user_data at all.
        { regionCode: product.pricing?.region_code || region || "" },
      );
      // TikTok ViewContent.
      ttqTrack("ViewContent", {
        contents: [
          {
            content_id: product.slug,
            content_type: "product",
            content_name: product.name_en || product.name || "",
            quantity: 1,
            price: Number(product.pricing?.amount || 0),
          },
        ],
        value: Number(product.pricing?.amount || 0),
        currency: product.pricing?.currency_code || "",
      });
    }
    if (lastTrackedViewItemRef.current !== key) {
      const didPush = pushDataLayerEvent("view_item", {
        locale,
        region,
        ecommerce: {
          currency: product.pricing?.currency_code || "",
          value: Number(product.pricing?.amount || 0),
          items: [item],
        },
      });
      if (didPush) {
        lastTrackedViewItemRef.current = key;
      }
    }
  }, [locale, product, region]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowMobileBar(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px -60px 0px" }
    );
    if (actionsRef.current) observer.observe(actionsRef.current);
    return () => observer.disconnect();
  }, []);

  const addCurrentProduct = () => {
    addItem({ ...product, pricing: selectedPricing, image: selectedVariant?.image || product.image, locale }, quantity, selectedOptions, selectedVariant);
    flyToCart(addBtnRef.current);
  };

  const buyCurrentProduct = () => {
    addItem({ ...product, pricing: selectedPricing, image: selectedVariant?.image || product.image, locale }, quantity, selectedOptions, selectedVariant);
    router.push(buildStorePath(locale, "/checkout", region));
  };

  const addFbtBundle = () => {
    // Always add the main product
    addItem({ ...product, pricing: selectedPricing, image: selectedVariant?.image || product.image, locale }, 1, selectedOptions, selectedVariant);
    // Add companion products for the selected tier
    const companions = fbtList.slice(0, fbtTier - 1);
    companions.forEach((companion) => {
      const companionPricing = Array.isArray(companion.pricing) ? companion.pricing[0] : companion.pricing;
      addItem({ ...companion, pricing: companionPricing, locale }, 1, {}, null);
    });
    flyToCart(addBtnRef.current);
  };

  const getShareUrl = () => {
    if (currentUrl) {
      return currentUrl;
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}${buildStorePath(locale, `/product/${product.slug}`, region)}`;
    }
    return buildStorePath(locale, `/product/${product.slug}`, region);
  };

  const shareTitle = product.name;

  const openShareLink = (url) => {
    if (typeof window === "undefined") {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyProductLink = async () => {
    const url = getShareUrl();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopyFeedback(isAr ? "تم نسخ رابط المنتج." : "Product link copied.");
    } catch {
      setCopyFeedback(isAr ? "تعذر نسخ الرابط." : "Unable to copy the link.");
    }
    window.setTimeout(() => setCopyFeedback(""), 2200);
  };

  const submitBackInStockRequest = async (event) => {
    event.preventDefault();
    if (notifySubmitting) return;
    setNotifyError("");
    setNotifySuccess("");

    const cleanEmail = String(notifyEmail || "").trim();
    if (!cleanEmail) {
      setNotifyError(isAr ? "يرجى إدخال بريد إلكتروني صالح." : "Please enter a valid email.");
      return;
    }

    setNotifySubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/stock-notify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_slug: product.slug,
          region,
          email: cleanEmail,
          phone: String(notifyPhone || "").trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          data?.email?.[0] ||
          data?.product_slug?.[0] ||
          data?.detail ||
          data?.error ||
          (isAr ? "تعذر حفظ طلب التنبيه الآن." : "Unable to save your notify request right now.");
        setNotifyError(String(detail));
        return;
      }
      setNotifySuccess(
        data?.detail || (isAr ? "تم تسجيل طلبك. سنبلغك فور توفر المنتج." : "You're on the list. We'll notify you when this product is back."),
      );
    } catch {
      setNotifyError(isAr ? "تعذر حفظ طلب التنبيه الآن." : "Unable to save your notify request right now.");
    } finally {
      setNotifySubmitting(false);
    }
  };

  return (
    <>
      <div className="product-layout">
        {/* ── Gallery ─────────────────────────────────────────── */}
        <div className={`gallery-layout ${slideImages.length === 1 ? "is-single" : ""}`}>
          {/* Vertical thumbnail strip — shown on desktop, hidden on mobile */}
          {galleryImages.length > 1 ? (
            <div className="thumb-list">
              {galleryImages.map((image, index) => (
                <button
                  key={`thumb-${image}-${index}`}
                  type="button"
                  className={`thumb-button ${selectedImage === image ? "is-active" : ""}`}
                  onClick={() => setSelectedImage(image)}
                  aria-label={isAr ? `الصورة ${index + 1}` : `Image ${index + 1}`}
                >
                  <SiteImage src={image} alt="" width={120} height={120} loading="lazy" sizes="80px" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="main-product-image-shell">
            {/* Desktop shows only the active slide; phones get a swipe rail with
                the next image peeking in so shoppers know there is more. */}
            <div
              ref={galleryTrackRef}
              className={`gallery-track ${slideImages.length === 1 ? "is-single" : ""}`}
              onScroll={syncSlideFromScroll}
            >
              {slideImages.map((image, index) => (
                <div
                  key={`${image}-${index}`}
                  className={`main-product-image gallery-slide ${image === selectedImage ? "is-active" : ""} ${slideImages.length === 1 ? "is-single" : ""}`}
                >
                  {/* First slide is the LCP element on product pages — must not be lazy. */}
                  <SiteImage
                    src={image}
                    alt={index === 0 ? product.name : `${product.name} ${index + 1}`}
                    width={900}
                    height={900}
                    priority={index === 0}
                    loading={index === 0 ? undefined : "lazy"}
                    sizes="(max-width: 640px) 88vw, (max-width: 900px) 100vw, 50vw"
                  />
                </div>
              ))}
            </div>
            {slideImages.length > 1 ? (() => {
              const activeImageIndex = Math.max(0, slideImages.indexOf(selectedImage));
              const nextImageIndex = (activeImageIndex + 1) % slideImages.length;
              return (
                <button
                  type="button"
                  className="gallery-next-preview"
                  onClick={() => showSlide(slideImages[nextImageIndex])}
                  aria-label={isAr ? "عرض الصورة التالية" : "View next product image"}
                >
                  <SiteImage
                    src={slideImages[nextImageIndex]}
                    alt=""
                    width={112}
                    height={112}
                    loading="lazy"
                    sizes="56px"
                  />
                  <span>{nextImageIndex + 1}/{slideImages.length}</span>
                </button>
              );
            })() : null}
            <div className="image-zoom-hint">
              <Icon name="search" size={14} />
              <span>{isAr ? "تكبير" : "Hover to zoom"}</span>
            </div>
          </div>
          {slideImages.length > 1 ? (
            <div className="gallery-image-indicators" role="group" aria-label={isAr ? "صور المنتج" : "Product gallery"}>
              {slideImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={`gallery-image-indicator ${selectedImage === image ? "is-active" : ""}`}
                  onClick={() => showSlide(image)}
                  aria-label={isAr ? `الصورة ${index + 1} من ${slideImages.length}` : `View image ${index + 1} of ${slideImages.length}`}
                  aria-pressed={selectedImage === image}
                >
                  <span />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Product Summary ─────────────────────────────────── */}
        <div className="product-summary">
          {/* Header */}
          <div className="summary-block product-summary-header">
            {product.badge ? (
              <div className="product-meta-row">
                <span className="summary-badge">{product.badge}</span>
              </div>
            ) : null}

            <h1>{product.name}</h1>

            <div className="product-reviews product-reviews-inline product-reviews--premium">
              {reviewCount > 0 ? (
                <>
                  <StarRating rating={product.rating || 5} size={18} />
                  <span className="review-count">{reviewCount}</span>
                  <span className="product-review-caption">
                    {isAr ? "تقييم" : "reviews"}
                  </span>
                </>
              ) : (
                <span className="product-review-caption">
                  {isAr ? "لا توجد مراجعات بعد" : "No reviews yet"}
                </span>
              )}
              {/* Right where the shopper is already looking at the stars — not
                  at the far end of the review list. */}
              <button
                type="button"
                className="review-write-link"
                onClick={() => setReviewFormOpen(true)}
              >
                {isAr ? "اكتب مراجعة" : "Write a review"}
              </button>
            </div>

            <div className="product-pricing large product-pricing--premium">
              <strong>{formatMoney(selectedPricing, locale)}</strong>
              {showComparePrice ? (
                <span className="compare-price">
                  {formatMoney(
                    { ...selectedPricing, amount: selectedPricing.compare_amount, prefix: "" },
                    locale,
                  )}
                </span>
              ) : null}
              {showComparePrice ? (
                <span className="product-discount-badge">
                  {isAr ? `${discountPercent}% خصم` : `${discountPercent}% off`}
                </span>
              ) : null}
            </div>

            <UrgencyStrip urgency={urgency} />

            {product.short_description ? (
              <p className="product-short-copy">{product.short_description}</p>
            ) : null}
          </div>

          {/* Purchase Meta */}
          <div className="product-purchase-meta">
            {optionGroups.map((group) => {
              const compatible = getCompatibleValues(variants, group.name, selectedOptions, group.values);
              return (
                <div key={group.name} className="summary-block product-option-block">
                  <h4>{group.name}</h4>
                  <div className="option-pills">
                    {group.values.map((value) => {
                      const label = optionPillLabel(group.name, value, variants, selectedOptions);
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`option-pill ${selectedOptions[group.name] === value ? "is-active" : ""} ${!compatible.has(value) ? "is-unavailable" : ""}`}
                          onClick={() =>
                            setSelectedOptions((current) =>
                              resolveOptionsOnChange(group.name, value, variants, current),
                            )
                          }
                        >
                          <span>{label.primary}</span>
                          {label.secondary ? <small>{label.secondary}</small> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="summary-block product-quantity-block">
              <div className="summary-label-row">
                <h4>{t.quantity}</h4>
                {!isOutOfStock && product?.stock_status?.is_low_stock ? (
                  <span className="summary-helper-pill summary-helper-pill--urgent">
                    {isAr ? "كمية محدودة" : "Only a few left"}
                  </span>
                ) : null}
              </div>
              <div className="quantity-control">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
                  <Icon name="minus" size={16} />
                </button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity((value) => value + 1)}>
                  <Icon name="plus" size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Actions — Desktop */}
          <div className="summary-actions desktop-product-actions" ref={actionsRef}>
            {isOutOfStock ? (
              <div className="product-stock-notify-card">
                <p className="product-stock-notify-title">
                  {isAr ? "المنتج غير متوفر حالياً" : "This product is currently out of stock"}
                </p>
                <p className="product-stock-notify-copy">
                  {isAr
                    ? "أضف بريدك الإلكتروني وسنخبرك فور توفره."
                    : "Leave your email and we'll notify you as soon as it's available."}
                </p>
                <form className="product-stock-notify-form" onSubmit={submitBackInStockRequest}>
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(event) => setNotifyEmail(event.target.value)}
                    placeholder={isAr ? "البريد الإلكتروني" : "Email address"}
                    autoComplete="email"
                    required
                  />
                  <input
                    type="tel"
                    value={notifyPhone}
                    onChange={(event) => setNotifyPhone(event.target.value)}
                    placeholder={isAr ? "رقم الهاتف (اختياري)" : "Phone (optional)"}
                    autoComplete="tel"
                  />
                  <button type="submit" className="primary-action" disabled={notifySubmitting}>
                    {notifySubmitting
                      ? (isAr ? "جارٍ الحفظ..." : "Saving...")
                      : (isAr ? "أخبرني عند التوفر" : "Notify me when available")}
                  </button>
                </form>
                {notifySuccess ? <p className="product-stock-notify-success">{notifySuccess}</p> : null}
                {notifyError ? <p className="product-stock-notify-error">{notifyError}</p> : null}
              </div>
            ) : (
              <div className="product-cta-stack">
                <button ref={addBtnRef} type="button" className="product-cart-action product-cart-action--primary" onClick={() => addCurrentProduct()}>
                  <Icon name="bag" size={20} />
                  <span>{t.addToCart}</span>
                </button>
                <button type="button" className="product-buy-action" onClick={() => buyCurrentProduct()}>
                  <span>{t.buyNow}</span>
                </button>
              </div>
            )}
          </div>

          {showProductVideoPanel ? (
            <div className="product-video-panel" role="group" aria-label={isAr ? "فيديوهات المنتج" : "Product videos"}>
              {productVideoUrls.map((videoUrl, index) => (
                <ProductVideoTile
                  key={`${videoUrl}-${index}`}
                  src={videoUrl}
                  label={isAr ? `تشغيل فيديو المنتج ${index + 1}` : `Play product video ${index + 1}`}
                  closeLabel={isAr ? "إغلاق الفيديو" : "Close video"}
                />
              ))}
            </div>
          ) : null}

          {/* Footer: Payment */}
          <div className="product-summary-footer">
            <div className="product-payment-block">
              <p>{isAr ? "خيارات دفع آمنة" : "Secure checkout"}</p>
              <div className="product-payment-methods">
                {paymentLogos.map((method) => (
                  <span key={method.key} className="product-payment-chip">
                    {method.svg}
                  </span>
                ))}
              </div>
            </div>

            <div className="product-summary-side-actions">
              <div className="product-utility-row">
                <Link className="product-continue-link" href={buildStorePath(locale, "/collections", region)}>
                  {t.continueShopping}
                </Link>
              </div>
            </div>
          </div>

          {/* ── Frequently Bought Together ───────────────────── */}
          {showFbt ? (() => {
            const mainPrice = Number(selectedPricing?.amount || 0);
            const mainCompare = Number(selectedPricing?.compare_amount || mainPrice);
            const mainSave = mainCompare > mainPrice ? Math.round((1 - mainPrice / mainCompare) * 100) : 0;

            const tiers = [
              { tier: 1, label: isAr ? "فقط هذا المنتج" : "Just this product", products: [product], badge: null },
              fbtList.length >= 1 ? {
                tier: 2,
                label: isAr ? `هذا المنتج + ${fbtList[0].name}` : `This + ${fbtList[0].name}`,
                products: [product, fbtList[0]],
                badge: isAr ? "الأكثر شيوعاً" : "MOST POPULAR",
              } : null,
              fbtList.length >= 2 ? {
                tier: 3,
                label: isAr ? `هذا المنتج + ${fbtList[0].name} + ${fbtList[1].name}` : `This + ${fbtList[0].name} + ${fbtList[1].name}`,
                products: [product, fbtList[0], fbtList[1]],
                badge: isAr ? "أفضل قيمة" : "BEST VALUE",
              } : null,
            ].filter(Boolean);

            const getPricing = (p, idx) => {
              if (idx === 0) return { amount: mainPrice, compare: mainCompare, save: mainSave };
              const pr = p.pricing;
              const amt = Number(pr?.amount || 0);
              const cmp = Number(pr?.compare_amount || amt);
              const sv = cmp > amt ? Math.round((1 - amt / cmp) * 100) : 0;
              return { amount: amt, compare: cmp, save: sv };
            };

            const tierTotal = (tierProducts) =>
              tierProducts.reduce((sum, p, i) => sum + getPricing(p, i).amount, 0);
            const tierCompare = (tierProducts) =>
              tierProducts.reduce((sum, p, i) => sum + getPricing(p, i).compare, 0);

            const currency = selectedPricing?.currency_code || "";
            const prefix = selectedPricing?.prefix || "";
            const fmt = (n) => `${prefix}${n.toFixed(3)}`;

            return (
              <div className="fbt-section">
                <h4 className="fbt-title">
                  {isAr ? "اشتر معاً ووفّر أكثر" : "Frequently Bought Together"}
                </h4>
                <div className="fbt-tiers">
                  {tiers.map(({ tier, products: tierProducts, badge }) => {
                    const total = tierTotal(tierProducts);
                    const compare = tierCompare(tierProducts);
                    const totalSave = compare > total ? Math.round((1 - total / compare) * 100) : 0;
                    const isSelected = fbtTier === tier;
                    return (
                      <label key={tier} className={`fbt-tier${isSelected ? " is-selected" : ""}${badge === (isAr ? "الأكثر شيوعاً" : "MOST POPULAR") ? " is-popular" : ""}`}>
                        <input
                          type="radio"
                          name="fbt-tier"
                          value={tier}
                          checked={isSelected}
                          onChange={() => setFbtTier(tier)}
                          className="fbt-radio"
                        />
                        <div className="fbt-tier-inner">
                          {badge ? <span className="fbt-badge">{badge}</span> : null}
                          <div className="fbt-images">
                            {tierProducts.map((p, i) => (
                              <span key={i} className="fbt-img-wrap">
                                {i > 0 ? <span className="fbt-plus" aria-hidden="true">+</span> : null}
                                <SiteImage src={p.image} alt={p.name || ""} width={64} height={64} loading="lazy" sizes="56px" className="fbt-img" />
                              </span>
                            ))}
                          </div>
                          <div className="fbt-tier-info">
                            <div className="fbt-price-row">
                              <span className="fbt-price">{fmt(total)} {currency}</span>
                              {compare > total ? (
                                <span className="fbt-compare">{fmt(compare)}</span>
                              ) : null}
                              {totalSave > 0 ? (
                                <span className="fbt-save">{isAr ? `${totalSave}% خصم` : `${totalSave}% off`}</span>
                              ) : null}
                            </div>
                            <div className="fbt-per-item">
                              {tierProducts.map((p, i) => {
                                const { amount, save } = getPricing(p, i);
                                return (
                                  <span key={i} className="fbt-item-pill">
                                    {p.name} — {prefix}{amount.toFixed(3)}
                                    {save > 0 ? <em> ({save}% {isAr ? "خصم" : "off"})</em> : null}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="fbt-add-btn"
                  onClick={addFbtBundle}
                  aria-label={isAr ? "أضف الحزمة إلى السلة" : "Add bundle to cart"}
                >
                  <Icon name="bag" size={20} />
                  <span>{isAr ? "أضف الحزمة إلى السلة" : "Add Bundle to Cart"}</span>
                </button>
              </div>
            );
          })() : null}
        </div>

        {/* ── Accordion ───────────────────────────────────────── */}
        <div className="detail-accordion-row">
          {/* Description */}
          <div className={`detail-accordion-item${openAccordion === "description" ? " is-open" : ""}`}>
            <button
              type="button"
              className="detail-accordion-header"
              onClick={() => toggleAccordion("description")}
              aria-expanded={openAccordion === "description"}
            >
              <span>{t.description}</span>
              <AccordionPlus />
            </button>
            <div className="detail-accordion-body">
              <div className="detail-accordion-inner">
                <DescriptionText description={product.description} />
              </div>
            </div>
          </div>

          {accordionSections.map((section) => (
            <div key={section.key} className={`detail-accordion-item${openAccordion === section.key ? " is-open" : ""}`}>
              <button
                type="button"
                className="detail-accordion-header"
                onClick={() => toggleAccordion(section.key)}
                aria-expanded={openAccordion === section.key}
              >
                <span>{section.title}</span>
                <AccordionPlus />
              </button>
              <div className="detail-accordion-body">
                <div className="detail-accordion-inner">{section.body}</div>
              </div>
            </div>
          ))}

        </div>

        {/* ── Product page sections (admin-managed per product) ── */}
        <div className="product-extra-sections">
          <ProductFeaturesSection features={product.page_sections?.features} productName={product.name} />
          <ProductHowItWorksSection
            section={product.page_sections?.how_it_works}
            proofItems={socialProofItems}
            isAr={isAr}
          />
          <ProductComparisonSection section={product.page_sections?.comparison} isAr={isAr} />
          <ProductReviewShowcase
            showcase={reviewsShowcase}
            reviewCount={reviewCount}
            isAr={isAr}
            readMoreHref={buildStorePath(locale, "/reviews", region)}
          />
          <ProductReviewsSection
            reviews={customerReviews}
            editorialReviews={editorialReviews}
            rating={product.rating}
            reviewCount={reviewCount}
            productName={product.name}
            productImage={galleryImages[0] || product.image}
            isAr={isAr}
            onWrite={() => setReviewFormOpen(true)}
            allReviewsHref={buildStorePath(locale, "/reviews", region)}
          />
        </div>
      </div>

      <WriteReviewModal
        slug={product.slug}
        locale={locale}
        open={reviewFormOpen}
        onClose={() => setReviewFormOpen(false)}
      />

      {/* ── Mobile Sticky Bar ───────────────────────────────── */}
      {!isOutOfStock && (
        <div className={`mobile-product-sticky-bar ${showMobileBar ? "is-visible" : ""}`}>
          <div className="mobile-sticky-price">
            <div className="mobile-sticky-price-main">
              <strong>{formatMoney(selectedPricing, locale)}</strong>
              {showComparePrice ? (
                <span className="product-discount-badge">{isAr ? `${discountPercent}% خصم` : `${discountPercent}% off`}</span>
              ) : null}
            </div>
            {showComparePrice && (
              <span className="mobile-sticky-compare">{formatMoney({ ...selectedPricing, amount: compareAmount, prefix: "" }, locale)}</span>
            )}
          </div>
          <div className="mobile-sticky-actions">
            <button type="button" className="product-cart-action product-cart-action--primary" onClick={() => addCurrentProduct()}>
              <Icon name="bag" size={16} />
              <span>{t.addToCart}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
