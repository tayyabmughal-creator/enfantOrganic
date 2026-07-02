"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import { buildAnalyticsItem, pushDataLayerEvent } from "@/lib/analytics";
import { fbqTrack, snaptrTrack, ttqTrack } from "@/components/store/analytics/AnalyticsScripts";
import { API_BASE_URL, CUSTOMER_TOKEN_KEY } from "@/lib/config";
import { trackEvent } from "@/lib/eventTracking";
import { hasHtml, sanitizeHtml } from "@/lib/safeHtml";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";
import {
  addWishlistProduct,
  ensureWishlistSlugs,
  hasWishlistSession,
  removeWishlistProduct,
  subscribeWishlist,
} from "@/lib/wishlist";

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

function WhatsAppGlyph({ size = 20 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="currentColor" />
      <path
        fill="white"
        d="M24 11C16.8 11 11 16.8 11 24c0 2.3.6 4.4 1.6 6.3L11 37l6.9-1.6c1.8.9 3.8 1.4 5.9 1.4 7.2 0 13-5.8 13-13S31.2 11 24 11zm0 23.8c-2 0-3.9-.5-5.5-1.4l-.4-.2-3.8.9 1-3.7-.3-.4c-1-1.7-1.6-3.7-1.6-5.8 0-5.9 4.8-10.7 10.7-10.7S34.8 18.1 34.8 24 30 34.8 24 34.8zm5.9-7.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-1 1.2-.4.3-.7.1c-1.9-.9-3.2-1.7-4.4-3.8-.3-.6.3-.5.9-1.7.1-.2.1-.4-.1-.6l-1.5-3.7c-.4-.9-.8-.8-1.1-.8h-.9c-.3 0-.7.1-1.1.5-.4.4-1.4 1.3-1.4 3.2s1.4 3.7 1.6 4 2.8 4.2 6.7 5.9c2.5 1 3.4 1.1 4.7.9.7-.1 2.3-1 2.6-1.9.3-.9.3-1.7.2-1.9 0-.2-.3-.3-.6-.5z"
      />
    </svg>
  );
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

function getCompatibleValues(variants, groupName, selectedOptions) {
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

export default function ProductDetailClient({ locale, product, region }) {
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
  const detailPoints = Array.isArray(product.details) ? product.details : [];
  const editorialReviews = Array.isArray(product.reviews) ? product.reviews : [];
  const customerReviews = Array.isArray(product.customer_reviews) ? product.customer_reviews : [];
  const [selectedImage, setSelectedImage] = useState(galleryImages[0] || product.image);
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
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isWishSubmitting, setIsWishSubmitting] = useState(false);
  const [wishFeedback, setWishFeedback] = useState("");
  const [showAllReviews, setShowAllReviews] = useState(false);
  const lastTrackedViewItemRef = useRef("");
  const [selectedOptions, setSelectedOptions] = useState(
    Object.fromEntries(optionGroups.map((group) => [group.name, group.values[0]])),
  );
  const selectedVariant = findSelectedVariant(variants, selectedOptions);
  const selectedPricing = selectedVariant?.pricing?.amount != null ? selectedVariant.pricing : product.pricing;
  const selectedVariantStock = selectedVariant?.stock_quantity;
  const isOutOfStock = selectedVariantStock != null
    ? Number(selectedVariantStock) <= 0
    : Boolean(product?.stock_status?.track_inventory) && !Boolean(product?.stock_status?.is_in_stock);
  const reviewCount = Number(product.review_count || customerReviews.length || editorialReviews.length || 0);
  const vendorLabel = String(product.vendor || product.brand || "ENFANT ORGANICS").toUpperCase();
  const compareAmount = Number(selectedPricing?.compare_amount || 0);
  const showComparePrice = compareAmount > Number(selectedPricing?.amount || 0);

  const [showMobileBar, setShowMobileBar] = useState(false);
  const actionsRef = useRef(null);

  const socialProofPills = [
    { icon: "heart", label: isAr ? "محبوب من عائلات إنفانت" : "Loved by Enfant families" },
    { icon: "check", label: product.organic_certification_name || (isAr ? "عناية موثوقة يوميًا" : "Trusted everyday care") },
  ];

  const trustFeatures = [
    { icon: "truck", title: isAr ? "شحن سريع" : "Fast shipping", copy: t.freeShipping },
    { icon: "check", title: isAr ? "منتج أصلي" : "Original product", copy: t.originalProducts },
    { icon: "shield", title: isAr ? "دفع آمن" : "Secure payment", copy: t.securePayment },
  ];

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
      setSelectedImage(selectedVariant.image);
    }
  }, [selectedVariant?.id, selectedVariant?.image]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentUrl(window.location.href);
    }
  }, [locale, product.slug, region]);

  useEffect(() => {
    let active = true;

    async function syncWishlist() {
      if (!hasWishlistSession()) {
        if (active) setIsWishlisted(false);
        return;
      }
      try {
        const slugs = await ensureWishlistSlugs({ region, locale });
        if (active) setIsWishlisted(slugs.has(product.slug));
      } catch {
        if (active) setIsWishlisted(false);
      }
    }

    syncWishlist();

    const unsubscribe = subscribeWishlist((detail) => {
      if (detail?.region !== region) return;
      const nextSlugs = new Set(detail?.slugs || []);
      setIsWishlisted(nextSlugs.has(product.slug));
    });

    return () => {
      active = false;
      unsubscribe();
    };
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
    if (lastTrackedViewItemRef.current === key) {
      return;
    }
    const item = buildAnalyticsItem(product);
    if (!item) {
      return;
    }
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
    fbqTrack("ViewContent", {
      content_ids: [product.slug],
      content_name: product.name_en || product.name || "",
      content_type: "product",
      content_category: item?.item_category || "",
      value: Number(product.pricing?.amount || 0),
      currency: product.pricing?.currency_code || "",
    });
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

  const showWishFeedback = (message) => {
    setWishFeedback(message);
    window.setTimeout(() => setWishFeedback(""), 2200);
  };

  const handleWishlistToggle = async () => {
    if (isWishSubmitting) return;
    setIsWishSubmitting(true);

    try {
      if (isWishlisted) {
        await removeWishlistProduct(product.slug, { locale, region });
        showWishFeedback(isAr ? "تمت إزالة المنتج من المفضلة." : "Removed from wishlist.");
      } else {
        await addWishlistProduct(product.slug, { locale, region });
        showWishFeedback(isAr ? "تم حفظ المنتج في المفضلة." : "Saved to wishlist.");
      }
    } catch (error) {
      if (error?.code === "AUTH_REQUIRED") {
        showWishFeedback(
          isAr
            ? "يرجى تسجيل الدخول لحفظ المنتجات في المفضلة."
            : "Please sign in to save items to your wishlist.",
        );
      } else {
        showWishFeedback(
          isAr
            ? "تعذر تحديث المفضلة. حاول مرة أخرى."
            : "Unable to update wishlist. Please try again.",
        );
      }
    } finally {
      setIsWishSubmitting(false);
    }
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
        <div className={`gallery-layout ${galleryImages.length === 1 ? "is-single" : ""}`}>
          <div className="main-product-image-shell">
            <div className={`main-product-image ${galleryImages.length === 1 ? "is-single" : ""}`}>
              <img src={selectedImage} alt={product.name} />
            </div>
            <div className="image-zoom-hint">
              <Icon name="search" size={14} />
              <span>{isAr ? "تكبير" : "Hover to zoom"}</span>
            </div>
          </div>
          {galleryImages.length > 1 ? (
            <div className="thumb-list" aria-label={isAr ? "صور المنتج" : "Product gallery"}>
              {galleryImages.map((image) => (
                <button
                  key={image}
                  type="button"
                  className={`thumb-button ${selectedImage === image ? "is-active" : ""}`}
                  onClick={() => setSelectedImage(image)}
                >
                  <img src={image} alt={product.name} loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Product Summary ─────────────────────────────────── */}
        <div className="product-summary">
          {/* Header */}
          <div className="summary-block product-summary-header">
            <div className="product-meta-row">
              <span className="summary-eyebrow">{vendorLabel}</span>
              <span className="summary-badge">{product.badge || product.category?.name}</span>
            </div>

            <h1>{product.name}</h1>

            <div className="product-reviews product-reviews-inline product-reviews--premium">
              <StarRating rating={product.rating || 5} size={18} />
              <span className="review-count">{reviewCount}</span>
              <span className="product-review-caption">
                {isAr ? "تقييم" : "reviews"}
              </span>
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
                <span className="save-badge">
                  {isAr ? "وفر" : "Save"} {Math.round((1 - Number(selectedPricing?.amount || 0) / compareAmount) * 100)}%
                </span>
              ) : null}
            </div>

            {product.short_description ? (
              <p className="product-short-copy">{product.short_description}</p>
            ) : null}
          </div>

          {/* Purchase Meta */}
          <div className="product-purchase-meta">
            {optionGroups.map((group) => {
              const compatible = getCompatibleValues(variants, group.name, selectedOptions);
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
                {product?.stock_status?.is_low_stock ? (
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
                <button ref={addBtnRef} type="button" className="secondary-action product-cart-action" onClick={() => addCurrentProduct()}>
                  <Icon name="bag" size={18} />
                  <span>{t.addToCart}</span>
                </button>
                <button type="button" className="primary-action product-buy-action" onClick={buyCurrentProduct}>
                  <Icon name="sparkle" size={17} />
                  <span>{isAr ? "اشترِ الآن" : "Buy it now"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Trust Grid */}
          <div className="product-trust-grid">
            {trustFeatures.map((feature) => (
              <div key={feature.title} className="product-trust-item">
                <span className="product-trust-icon">
                  <Icon name={feature.icon} size={18} />
                </span>
                <div>
                  <strong>{feature.title}</strong>
                  <span>{feature.copy}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Social Proof */}
          <div className="product-proof-row">
            {socialProofPills.map((pill) => (
              <span key={pill.label} className="product-proof-pill">
                <Icon name={pill.icon} size={14} />
                {pill.label}
              </span>
            ))}
          </div>

          {/* Footer: Payment + Wishlist */}
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
                <button
                  type="button"
                  className={`product-wishlist-button${isWishlisted ? " is-active" : ""}`}
                  onClick={handleWishlistToggle}
                  disabled={isWishSubmitting}
                >
                  <Icon name="heart" size={18} />
                  <span>{isAr ? "المفضلة" : "Wishlist"}</span>
                </button>
                <Link className="product-continue-link" href={buildStorePath(locale, "/collections", region)}>
                  {t.continueShopping}
                </Link>
              </div>
              {wishFeedback ? <p className="product-wishlist-feedback">{wishFeedback}</p> : null}
            </div>
          </div>

          {/* Share */}
          <div className="summary-block product-share-block">
            <div className="product-share-header">
              <h4>{isAr ? "شاركي المنتج" : "Share this product"}</h4>
              <span className="product-share-label">
                <Icon name="link" size={14} />
                {isAr ? "مشاركة سريعة" : "Quick share"}
              </span>
            </div>
            <div className="product-share-actions">
              <button
                type="button"
                className="product-share-button"
                onClick={() => {
                  const url = encodeURIComponent(getShareUrl());
                  const text = encodeURIComponent(shareTitle);
                  openShareLink(`https://wa.me/?text=${text}%20${url}`);
                }}
              >
                WhatsApp
              </button>
              <button
                type="button"
                className="product-share-button"
                onClick={() => {
                  const url = encodeURIComponent(getShareUrl());
                  openShareLink(`https://www.facebook.com/sharer/sharer.php?u=${url}`);
                }}
              >
                Facebook
              </button>
              <button
                type="button"
                className="product-share-button"
                onClick={() => {
                  const url = encodeURIComponent(getShareUrl());
                  const text = encodeURIComponent(shareTitle);
                  openShareLink(`https://twitter.com/intent/tweet?text=${text}&url=${url}`);
                }}
              >
                X
              </button>
              <button
                type="button"
                className="product-share-button"
                onClick={copyProductLink}
              >
                <Icon name="link" size={14} />
                <span>{isAr ? "نسخ الرابط" : "Copy link"}</span>
              </button>
            </div>
            {copyFeedback ? <p className="product-share-feedback">{copyFeedback}</p> : null}
          </div>
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
              <svg className="detail-accordion-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div className="detail-accordion-body">
              <div className="detail-accordion-inner">
                <DescriptionText description={product.description} />
              </div>
            </div>
          </div>

          {/* Details */}
          {(detailPoints.length > 0 || product.origin_source || product.shelf_life) ? (
            <div className={`detail-accordion-item${openAccordion === "details" ? " is-open" : ""}`}>
              <button
                type="button"
                className="detail-accordion-header"
                onClick={() => toggleAccordion("details")}
                aria-expanded={openAccordion === "details"}
              >
                <span>{t.details}</span>
                <svg className="detail-accordion-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div className="detail-accordion-body">
                <div className="detail-accordion-inner">
                  <ul className="detail-accordion-list">
                    {detailPoints.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                    {product.origin_source ? <li>{product.origin_source}</li> : null}
                    {product.shelf_life ? <li>{product.shelf_life}</li> : null}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          {/* Reviews */}
          <div className={`detail-accordion-item${openAccordion === "reviews" ? " is-open" : ""}`}>
            <button
              type="button"
              className="detail-accordion-header"
              onClick={() => toggleAccordion("reviews")}
              aria-expanded={openAccordion === "reviews"}
            >
              <span>{t.reviews}{reviewCount > 0 ? ` (${reviewCount})` : ""}</span>
              <svg className="detail-accordion-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div className="detail-accordion-body">
              <div className="detail-accordion-inner">
                <div className="review-list">
                  {customerReviews.length
                    ? (() => {
                        const displayed = showAllReviews ? customerReviews : customerReviews.slice(0, 5);
                        return (
                          <>
                            {displayed.map((review) => (
                              <article key={`${review.customer_name}-${review.created_at}`} className="product-review-item">
                                <div className="product-review-head">
                                  <strong>{review.customer_name}</strong>
                                  <span className="product-review-rating">
                                    {"★".repeat(Math.max(1, Math.min(5, Number(review.rating || 5))))}
                                  </span>
                                </div>
                                {review.title ? <h5>{review.title}</h5> : null}
                                <p>{review.comment}</p>
                                {Array.isArray(review.images) && review.images.length ? (
                                  <div className="product-review-images" aria-label={isAr ? "صور المراجعة" : "Review photos"}>
                                    {review.images.map((image) => (
                                      <img key={image} src={image} alt="" loading="lazy" />
                                    ))}
                                  </div>
                                ) : null}
                              </article>
                            ))}
                            {customerReviews.length > 5 && (
                              <button
                                type="button"
                                className="review-view-all-btn"
                                onClick={() => setShowAllReviews((v) => !v)}
                              >
                                {showAllReviews
                                  ? (isAr ? "عرض أقل" : "Show Less")
                                  : (isAr ? `عرض الكل (${customerReviews.length})` : `View All (${customerReviews.length})`)}
                              </button>
                            )}
                          </>
                        );
                      })()
                    : editorialReviews.length
                      ? editorialReviews.map((review) => (
                          <article key={`${review.name}-${review.copy}`} className="product-review-item">
                            <strong>{review.name}</strong>
                            <p>{review.copy}</p>
                          </article>
                        ))
                      : (
                        <article className="product-review-item">
                          <strong>{isAr ? "لا توجد مراجعات بعد" : "No reviews yet"}</strong>
                          <p>
                            {isAr
                              ? "كوني أول من يشارك تجربته مع هذا المنتج."
                              : "Be the first to share feedback on this product."}
                          </p>
                        </article>
                      )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile Sticky Bar ───────────────────────────────── */}
      {!isOutOfStock && (
        <div className={`mobile-product-sticky-bar ${showMobileBar ? "is-visible" : ""}`}>
          <div className="mobile-sticky-price">
            <strong>{formatMoney(selectedPricing, locale)}</strong>
            {showComparePrice && (
              <span>{formatMoney({ ...selectedPricing, amount: compareAmount, prefix: "" }, locale)}</span>
            )}
          </div>
          <button
            type="button"
            className="mobile-sticky-whatsapp"
            onClick={() => {
              const url = encodeURIComponent(getShareUrl());
              const text = encodeURIComponent(shareTitle);
              openShareLink(`https://wa.me/?text=${text}%20${url}`);
            }}
            aria-label={isAr ? "مشاركة عبر واتساب" : "Share on WhatsApp"}
          >
            <WhatsAppGlyph size={22} />
          </button>
          <button type="button" className="secondary-action product-cart-action" onClick={() => addCurrentProduct()}>
            <Icon name="bag" size={18} />
          </button>
          <button type="button" className="primary-action product-buy-action" onClick={buyCurrentProduct}>
            <span>{isAr ? "اشترِ الآن" : "Buy Now"}</span>
          </button>
        </div>
      )}
    </>
  );
}
