"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useStore } from "@/components/store/cart/StoreProvider";
import Icon from "@/components/icons/Icon";
import { buildAnalyticsItems, pushDataLayerEvent } from "@/lib/analytics";
import { getAttributionSnapshot, trackEvent } from "@/lib/eventTracking";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";
import { API_BASE_URL as CONFIG_API_BASE_URL, CUSTOMER_TOKEN_KEY, safeRedirectUrl } from "@/lib/config";
import { readJson } from "@/lib/http";
import { appendRegionQuery } from "@/lib/regionResolver";
import { saveOrderLookupToken } from "@/lib/orderLookupToken";

const API_BASE_URL = CONFIG_API_BASE_URL;
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const PAYMOB_APPLE_PAY_INTEGRATION_ID = process.env.NEXT_PUBLIC_PAYMOB_APPLE_PAY_INTEGRATION_ID || "";
const AUTH_TOKEN_KEY = CUSTOMER_TOKEN_KEY;
const GOOGLE_SCRIPT_ID = "enfant-google-maps-script";

const REGION_SETTINGS = {
  om: {
    countryCode: "OM",
    countryNameEn: "Oman",
    countryNameAr: "عُمان",
    center: { lat: 23.588, lng: 58.3829 },
    bounds: { south: 16.6, west: 51.9, north: 26.4, east: 60.0 },
  },
  ae: {
    countryCode: "AE",
    countryNameEn: "United Arab Emirates",
    countryNameAr: "الإمارات العربية المتحدة",
    center: { lat: 25.2048, lng: 55.2708 },
    bounds: { south: 22.6, west: 51.0, north: 26.1, east: 56.5 },
  },
  sa: {
    countryCode: "SA",
    countryNameEn: "Saudi Arabia",
    countryNameAr: "المملكة العربية السعودية",
    center: { lat: 24.7136, lng: 46.6753 },
    bounds: { south: 16.0, west: 34.4, north: 32.2, east: 55.7 },
  },
};

const BASE_PAYMENT_METHODS = [
  {
    value: "cod",
    label: "Cash on Delivery",
    labelAr: "الدفع عند الاستلام",
    description: "Pay when your order arrives at your door",
    descriptionAr: "ادفع عند وصول طلبك",
  },
  {
    value: "whatsapp",
    label: "WhatsApp Confirmation",
    labelAr: "تأكيد عبر واتساب",
    description: "Place order and confirm via WhatsApp",
    descriptionAr: "اطلب وأكد عبر واتساب",
  },
  {
    value: "bank_transfer",
    label: "Bank Transfer",
    labelAr: "تحويل بنكي",
    description: "Transfer to our bank account — details sent after order",
    descriptionAr: "حوّل إلى حسابنا البنكي — التفاصيل تُرسل بعد الطلب",
  },
];

const GATEWAY_PROVIDER_LABELS = {
  paytabs: "PayTabs",
  paymob: "Paymob",
  hyperpay: "HyperPay",
  telr: "Telr",
  thawani: "Thawani",
  omannet: "OmanNet",
};

const ONLINE_PROVIDER_KEYS = Object.keys(GATEWAY_PROVIDER_LABELS);

function getStoredToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function getRegionKey(region) {
  const normalized = String(region || "om").toLowerCase();
  if (normalized === "uae") return "ae";
  return REGION_SETTINGS[normalized] ? normalized : "om";
}

function getCountryName(regionKey, isAr) {
  const config = REGION_SETTINGS[regionKey] || REGION_SETTINGS.om;
  return isAr ? config.countryNameAr : config.countryNameEn;
}

function loadGoogleMapsScript({ apiKey, language, regionCode }) {
  if (!apiKey) {
    return Promise.reject(new Error("MISSING_GOOGLE_MAPS_API_KEY"));
  }
  if (typeof window === "undefined") {
    return Promise.reject(new Error("WINDOW_UNAVAILABLE"));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }
  if (window.__enfantGoogleMapsPromise) {
    return window.__enfantGoogleMapsPromise;
  }

  window.__enfantGoogleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps?.places) resolve(window.google);
        else reject(new Error("GOOGLE_MAPS_NOT_READY"));
      });
      existing.addEventListener("error", () => reject(new Error("GOOGLE_MAPS_SCRIPT_FAILED")));
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=places&language=${encodeURIComponent(language)}&region=${encodeURIComponent(regionCode)}`;
    script.onload = () => {
      if (window.google?.maps?.places) resolve(window.google);
      else reject(new Error("GOOGLE_MAPS_NOT_READY"));
    };
    script.onerror = () => reject(new Error("GOOGLE_MAPS_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });

  return window.__enfantGoogleMapsPromise;
}

function mapAddressToForm(address, regionKey, isAr) {
  return {
    name: address.full_name || "",
    phone: address.phone || "",
    address_line_1: address.address_line_1 || "",
    address_line_2: address.address_line_2 || "",
    building: address.building || "",
    floor: address.floor || "",
    apartment: address.apartment || "",
    landmark: address.landmark || "",
    area: address.area || "",
    city: address.city || "",
    postcode: address.postcode || "",
    country: address.country || getCountryName(regionKey, isAr),
    formatted_address: address.formatted_address || "",
    place_id: address.place_id || "",
    lat:
      address.latitude === null || address.latitude === undefined || address.latitude === ""
        ? ""
        : String(address.latitude),
    lng:
      address.longitude === null || address.longitude === undefined || address.longitude === ""
        ? ""
        : String(address.longitude),
    location_notes: address.location_notes || "",
    sms_opt_in: Boolean(address.sms_opt_in),
    whatsapp_opt_in: Boolean(address.whatsapp_opt_in),
  };
}

function extractAddressComponent(components, type) {
  const match = Array.isArray(components)
    ? components.find((component) => component.types?.includes(type))
    : null;
  return match?.long_name || "";
}

// Shared mapper used by both Places Autocomplete (place_changed) and reverse
// geocode (marker drag, map click, geolocation). Returns a partial form patch.
// Empty Google fields fall back to whatever the form currently holds.
function buildAddressPatchFromGoogleResult(result, current = {}) {
  const components = result?.address_components || [];
  const city =
    extractAddressComponent(components, "locality") ||
    extractAddressComponent(components, "administrative_area_level_1");
  const area =
    extractAddressComponent(components, "sublocality") ||
    extractAddressComponent(components, "neighborhood") ||
    extractAddressComponent(components, "administrative_area_level_2");
  const postcode = extractAddressComponent(components, "postal_code");
  const country = extractAddressComponent(components, "country");
  const formatted = result?.formatted_address || result?.name || "";

  return {
    place_id: result?.place_id || current.place_id || "",
    formatted_address: formatted || current.formatted_address || "",
    address_line_1: formatted || current.address_line_1 || "",
    city: city || current.city || "",
    area: area || current.area || "",
    postcode: postcode || current.postcode || "",
    country: country || current.country || "",
  };
}

function reverseGeocodeLocation(geocoder, lat, lng, language) {
  if (!geocoder) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      geocoder.geocode({ location: { lat, lng }, language }, (results, status) => {
        if (status === "OK" && Array.isArray(results) && results.length > 0) {
          resolve(results[0]);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

function formatEtaText(etaMin, etaMax, isAr) {
  const min = Number(etaMin);
  const max = Number(etaMax);
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;

  if (hasMin && hasMax) {
    if (min === max) {
      return isAr ? `خلال ${min} أيام` : `${min} days`;
    }
    return isAr ? `من ${min} إلى ${max} أيام` : `${min}-${max} days`;
  }
  if (hasMin) {
    return isAr ? `ابتداءً من ${min} أيام` : `From ${min} days`;
  }
  if (hasMax) {
    return isAr ? `حتى ${max} أيام` : `Up to ${max} days`;
  }
  return isAr ? "—" : "—";
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function PaymentBadgeIcon({ name }) {
  if (name === "Visa") {
    return (
      <svg viewBox="0 0 48 16" aria-hidden="true" className="pbi-svg pbi-visa">
        <text x="2" y="13" fontFamily="Arial, sans-serif" fontStyle="italic" fontWeight="900" fontSize="14" fill="#1434CB" letterSpacing="-0.5">VISA</text>
      </svg>
    );
  }
  if (name === "Mastercard") {
    return (
      <svg viewBox="0 0 38 24" aria-hidden="true" className="pbi-svg pbi-mc">
        <circle cx="13" cy="12" r="12" fill="#EB001B" />
        <circle cx="25" cy="12" r="12" fill="#F79E1B" />
        <path d="M19 4.8a12 12 0 0 1 0 14.4A12 12 0 0 1 19 4.8z" fill="#FF5F00" />
      </svg>
    );
  }
  if (name === "Apple Pay") {
    return (
      <svg viewBox="0 0 72 30" aria-hidden="true" className="pbi-svg pbi-applepay">
        <rect width="72" height="30" rx="5" fill="#000" />
        {/* Accurate Apple logo — MDI apple path, scaled to fit */}
        <g transform="translate(9,4) scale(0.92)">
          <path fill="#fff" d="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.78,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z" />
        </g>
        <text x="32" y="21" fontFamily="-apple-system, 'Helvetica Neue', sans-serif" fontSize="13" fontWeight="500" fill="#fff" letterSpacing="0.3">Pay</text>
      </svg>
    );
  }
  if (name === "Mada") {
    return (
      <svg viewBox="0 0 48 16" aria-hidden="true" className="pbi-svg pbi-mada">
        <text x="2" y="13" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="13" fill="#1B2F82">mada</text>
      </svg>
    );
  }
  if (name === "Google Pay") {
    return (
      <svg viewBox="0 0 56 24" aria-hidden="true" className="pbi-svg pbi-gpay">
        <text x="2" y="17" fontFamily="Arial, sans-serif" fontWeight="500" fontSize="13" fill="#5F6368">G</text>
        <text x="13" y="17" fontFamily="Arial, sans-serif" fontWeight="500" fontSize="13" fill="#3C4043">Pay</text>
      </svg>
    );
  }
  return <span>{name}</span>;
}

export default function CheckoutClient({ locale, region, regionConfig: regionSettingsData = null }) {
  const router = useRouter();
  const t = uiText(locale);
  const { cartItems, subtotal, clearCart, refreshCartPricing, repricingInFlight } = useStore();
  const isAr = locale === "ar";
  const regionKey = useMemo(() => getRegionKey(region), [region]);
  const regionConfig = REGION_SETTINGS[regionKey] || REGION_SETTINGS.om;
  const backendRegionConfig = useMemo(
    () => (regionSettingsData && typeof regionSettingsData === "object" ? regionSettingsData : {}),
    [regionSettingsData],
  );

  const mapContainerRef = useRef(null);
  const placeInputRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const autocompleteRef = useRef(null);
  const geocoderRef = useRef(null);
  const reverseGeocodeReqIdRef = useRef(0);
  const mapClickListenerRef = useRef(null);
  const markerDragListenerRef = useRef(null);
  const placeListenerRef = useRef(null);
  const hasAutoAddressPrefillRef = useRef(false);
  const lastBeginCheckoutSignatureRef = useRef("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    sms_opt_in: false,
    whatsapp_opt_in: false,
    address_line_1: "",
    address_line_2: "",
    building: "",
    floor: "",
    apartment: "",
    landmark: "",
    area: "",
    city: "",
    postcode: "",
    country: getCountryName(regionKey, isAr),
    formatted_address: "",
    place_id: "",
    lat: "",
    lng: "",
    location_notes: "",
    coupon_code: "",
    gift_card_code: "",
    notes: "",
    payment_method: "cod",
  });

  const [submitting, setSubmitting] = useState(false);
  const [pricingRefreshing, setPricingRefreshing] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [validatingGiftCard, setValidatingGiftCard] = useState(false);
  const [couponPreview, setCouponPreview] = useState(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [giftCardMessage, setGiftCardMessage] = useState("");
  const [activeDiscountField, setActiveDiscountField] = useState("coupon");
  const [error, setError] = useState("");
  const [paymentRecovery, setPaymentRecovery] = useState(null);
  const [applePayAvailable, setApplePayAvailable] = useState(false);

  useEffect(() => {
    if (!PAYMOB_APPLE_PAY_INTEGRATION_ID) return;
    try {
      setApplePayAvailable(
        Boolean(typeof window !== "undefined" && window.ApplePaySession && window.ApplePaySession.canMakePayments()),
      );
    } catch {
      setApplePayAvailable(false);
    }
  }, []);

  // Record a checkout_initiated event once when the checkout page mounts.
  useEffect(() => {
    trackEvent("checkout_initiated", { regionCode: region });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  const [mapStatus, setMapStatus] = useState(GOOGLE_MAPS_API_KEY ? "idle" : "missing_key");
  const [mapNotice, setMapNotice] = useState("");
  const [geocodingPin, setGeocodingPin] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [geolocationError, setGeolocationError] = useState("");
  const [onlineProvider, setOnlineProvider] = useState("");

  const mapPinRequired = Boolean(backendRegionConfig?.require_map_pin);
  const hasPin =
    form.lat !== "" && form.lng !== "" && Number.isFinite(Number(form.lat)) && Number.isFinite(Number(form.lng));

  const enabledProviders = useMemo(() => {
    const raw = backendRegionConfig?.payment_enabled_providers;
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  }, [backendRegionConfig]);

  const providerOptions = useMemo(() => {
    const raw = backendRegionConfig?.payment_provider_options;
    if (Array.isArray(raw) && raw.length) {
      return raw
        .map((item) => ({
          key: String(item?.key || "").trim().toLowerCase(),
          label: String(item?.label || "").trim() || GATEWAY_PROVIDER_LABELS[String(item?.key || "").trim().toLowerCase()] || "Provider",
          enabled: Boolean(item?.enabled),
          configured: Boolean(item?.configured),
          available: Boolean(item?.available),
          warning: String(item?.warning || ""),
        }))
        .filter((item) => ONLINE_PROVIDER_KEYS.includes(item.key));
    }
    return enabledProviders
      .filter((provider) => ONLINE_PROVIDER_KEYS.includes(provider))
      .map((provider) => ({
        key: provider,
        label: GATEWAY_PROVIDER_LABELS[provider] || "Provider",
        enabled: true,
        configured: true,
        available: true,
        warning: "",
      }));
  }, [backendRegionConfig, enabledProviders]);

  const availableOnlineProviders = useMemo(
    () => providerOptions.filter((item) => item.enabled && item.configured),
    [providerOptions],
  );

  const defaultOnlineProvider = useMemo(() => {
    const configured = String(backendRegionConfig?.default_payment_provider || "").trim().toLowerCase();
    if (configured && availableOnlineProviders.some((item) => item.key === configured)) {
      return configured;
    }
    return availableOnlineProviders[0]?.key || "";
  }, [backendRegionConfig, availableOnlineProviders]);

  const isOnlineProviderEnabled = availableOnlineProviders.length > 0;
  const activeOnlineProvider = onlineProvider || defaultOnlineProvider;
  const onlineProviderLabel = GATEWAY_PROVIDER_LABELS[activeOnlineProvider] || "Gateway";
  const applePayRegionEnabled = useMemo(() => {
    const hasPaymobOnline = availableOnlineProviders.some((item) => item.key === "paymob");
    if (!hasPaymobOnline) return false;

    const supported = backendRegionConfig?.payment_supported_methods;
    const badges = supported?.badges && typeof supported.badges === "object" ? supported.badges : {};
    if (Object.prototype.hasOwnProperty.call(badges, "apple_pay")) {
      return Boolean(badges.apple_pay);
    }

    const wallets = Array.isArray(supported?.wallets) ? supported.wallets : [];
    const normalizedWallets = wallets.map((item) => String(item || "").trim().toLowerCase());
    return normalizedWallets.includes("apple_pay") || normalizedWallets.includes("applepay");
  }, [availableOnlineProviders, backendRegionConfig]);

  useEffect(() => {
    if (!PAYMOB_APPLE_PAY_INTEGRATION_ID || !applePayRegionEnabled) {
      setApplePayAvailable(false);
      return;
    }
    try {
      setApplePayAvailable(
        Boolean(typeof window !== "undefined" && window.ApplePaySession && window.ApplePaySession.canMakePayments()),
      );
    } catch {
      setApplePayAvailable(false);
    }
  }, [applePayRegionEnabled]);

  const paymentBadges = useMemo(() => {
    if (!isOnlineProviderEnabled) return [];
    const configuredBadges = backendRegionConfig?.payment_supported_methods?.badges || {};
    const hasFlag = (key, fallback = false) =>
      Object.prototype.hasOwnProperty.call(configuredBadges, key)
        ? Boolean(configuredBadges[key])
        : fallback;

    const badges = [];
    if (hasFlag("visa", true)) badges.push("Visa");
    if (hasFlag("mastercard", true)) badges.push("Mastercard");
    // Mada (a Saudi-only domestic network) is only shown if a real Mada-capable
    // integration is configured for the region — never via the Oman OMR account.
    if (regionKey === "sa" && hasFlag("mada", false)) badges.push("Mada");
    // Apple Pay only renders when the Paymob Apple Pay integration is actually
    // configured (build-time env), so we never advertise a method we can't take.
    if (PAYMOB_APPLE_PAY_INTEGRATION_ID && hasFlag("apple_pay", true)) badges.push("Apple Pay");
    // Google Pay is intentionally not offered: there is no Google Pay flow wired
    // up, so it must never appear as an accepted method.
    return badges;
  }, [backendRegionConfig, isOnlineProviderEnabled, regionKey]);

  const paymentMethods = useMemo(() => {
    const list = [...BASE_PAYMENT_METHODS];
    if (isOnlineProviderEnabled) {
      list.splice(1, 0, {
        value: "online",
        label: "Pay Online",
        labelAr: "الدفع الإلكتروني",
        description: `Secure payment via ${onlineProviderLabel}`,
        descriptionAr: `دفع آمن عبر ${onlineProviderLabel}`,
        badge: onlineProviderLabel,
      });
    }
    return list;
  }, [isOnlineProviderEnabled, onlineProviderLabel]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      country: getCountryName(regionKey, isAr),
    }));
  }, [regionKey, isAr]);

  useEffect(() => {
    if (!cartItems.length) return;
    setPricingRefreshing(true);
    refreshCartPricing(locale, region).finally(() => setPricingRefreshing(false));
  }, [cartItems.length, locale, refreshCartPricing, region]);

  useEffect(() => {
    if (!isOnlineProviderEnabled) {
      setOnlineProvider("");
      return;
    }
    if (!activeOnlineProvider || !availableOnlineProviders.some((item) => item.key === activeOnlineProvider)) {
      setOnlineProvider(defaultOnlineProvider);
    }
  }, [activeOnlineProvider, availableOnlineProviders, defaultOnlineProvider, isOnlineProviderEnabled]);

  useEffect(() => {
    if (paymentMethods.some((method) => method.value === form.payment_method)) {
      return;
    }
    setForm((current) => ({
      ...current,
      payment_method: paymentMethods[0]?.value || "cod",
    }));
  }, [form.payment_method, paymentMethods]);

  const summaryPricing = useMemo(() => {
    if (!cartItems[0]) return null;
    return { ...cartItems[0].pricing, amount: subtotal, prefix: "" };
  }, [cartItems, subtotal]);

  // The region's expected currency vs. the currency the cart is actually priced
  // in. They diverge when region repricing fails silently (e.g. the browser API
  // call is rejected) — leaving "SAR region" showing an OMR total. We surface
  // this instead of letting the order submit with a mismatched currency.
  const regionCurrency = useMemo(
    () => String(backendRegionConfig?.currency_code || "").trim().toUpperCase(),
    [backendRegionConfig],
  );
  const cartCurrency = useMemo(
    () => String(summaryPricing?.currency_code || "").trim().toUpperCase(),
    [summaryPricing],
  );
  const currencyMismatch = Boolean(regionCurrency && cartCurrency && regionCurrency !== cartCurrency);

  // Providers the region wants to offer but which the backend reports as not
  // configured (e.g. Paymob for a region whose credentials aren't set yet).
  // Shown as an explicit notice rather than silently hidden.
  const unconfiguredEnabledProviders = useMemo(
    () => providerOptions.filter((item) => item.enabled && !item.configured),
    [providerOptions],
  );

  const syncMarkerPosition = useCallback((lat, lng, shouldCenter = false) => {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;
    if (!markerRef.current || !mapRef.current || !window.google?.maps) return;

    const position = { lat: nextLat, lng: nextLng };
    markerRef.current.setPosition(position);
    if (shouldCenter) {
      mapRef.current.setCenter(position);
    }
  }, []);

  const updateCoordinates = useCallback((lat, lng, options = {}) => {
    const { keepAddressFields = true } = options;
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;

    setForm((current) => ({
      ...current,
      lat: nextLat.toFixed(6),
      lng: nextLng.toFixed(6),
      ...(keepAddressFields
        ? {}
        : {
            place_id: "",
            formatted_address: "",
          }),
    }));
  }, []);

  // Reverse-geocode a point and patch the address fields. Ignores stale
  // responses (the user may drop a second pin before the first lookup returns).
  const runReverseGeocode = useCallback(
    async (lat, lng) => {
      if (!geocoderRef.current) return;
      const reqId = reverseGeocodeReqIdRef.current + 1;
      reverseGeocodeReqIdRef.current = reqId;
      setGeocodingPin(true);
      const result = await reverseGeocodeLocation(
        geocoderRef.current,
        lat,
        lng,
        isAr ? "ar" : "en",
      );
      if (reqId !== reverseGeocodeReqIdRef.current) return;
      setGeocodingPin(false);
      if (!result) return;
      setForm((current) => ({ ...current, ...buildAddressPatchFromGoogleResult(result, current) }));
    },
    [isAr],
  );

  const useMyCurrentLocation = useCallback(() => {
    if (typeof window === "undefined" || !window.navigator?.geolocation) {
      setGeolocationError(
        isAr
          ? "تحديد الموقع غير مدعوم على هذا المتصفح."
          : "Geolocation is not supported in this browser.",
      );
      return;
    }
    if (mapStatus !== "ready") return;

    setGeolocationError("");
    setGeolocating(true);
    window.navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeolocating(false);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        updateCoordinates(lat, lng, { keepAddressFields: false });
        syncMarkerPosition(lat, lng, true);
        void runReverseGeocode(lat, lng);
      },
      (err) => {
        setGeolocating(false);
        let message;
        if (err?.code === 1) {
          message = isAr
            ? "تم رفض إذن الموقع. فعّله من إعدادات المتصفح وحاول مجدداً."
            : "Location permission was denied. Enable it in your browser settings and try again.";
        } else if (err?.code === 2) {
          message = isAr
            ? "تعذر تحديد موقعك حالياً."
            : "Your location is currently unavailable.";
        } else if (err?.code === 3) {
          message = isAr ? "انتهت مهلة تحديد الموقع." : "Locating you timed out.";
        } else {
          message = isAr ? "تعذر استخدام موقعك." : "Could not use your location.";
        }
        setGeolocationError(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [isAr, mapStatus, runReverseGeocode, syncMarkerPosition, updateCoordinates]);

  const applySavedAddress = useCallback(
    (address) => {
      if (!address) return;
      const mapped = mapAddressToForm(address, regionKey, isAr);
      setForm((current) => ({
        ...current,
        ...mapped,
        email: current.email,
        coupon_code: current.coupon_code,
        gift_card_code: current.gift_card_code,
        notes: current.notes,
        payment_method: current.payment_method,
        sms_opt_in: current.sms_opt_in,
        whatsapp_opt_in: current.whatsapp_opt_in,
      }));
      if (mapped.lat && mapped.lng) {
        syncMarkerPosition(mapped.lat, mapped.lng, true);
      }
    },
    [isAr, regionKey, syncMarkerPosition],
  );

  const updateField = useCallback((event) => {
    const { name, value, type, checked } = event.target;
    const nextValue = type === "checkbox" ? checked : value;
    setForm((current) => ({ ...current, [name]: nextValue }));
    if (name === "coupon_code") {
      setCouponMessage("");
    }
    if (name === "gift_card_code") {
      setGiftCardMessage("");
    }
  }, []);

  const setPaymentMethod = useCallback((value) => {
    setForm((current) => ({ ...current, payment_method: value }));
  }, []);

  const checkoutItemsPayload = useCallback(
    () =>
      cartItems.map((item) => ({
        slug: item.slug,
        quantity: item.quantity,
        selected_options_text: item.selectedOptionsText || "",
      })),
    [cartItems],
  );

  const previewMoney = useCallback(
    (amount) =>
      formatMoney(
        {
          ...(summaryPricing || {}),
          amount: Number(amount || 0),
          currency_code: couponPreview?.currency_code || summaryPricing?.currency_code,
          region_code: summaryPricing?.region_code || region,
          prefix: "",
        },
        locale,
      ),
    [couponPreview?.currency_code, locale, region, summaryPricing],
  );

  const analyticsItems = useMemo(
    () =>
      buildAnalyticsItems(cartItems, (item) => ({
        item_variant: item.selectedOptionsText || "",
      })),
    [cartItems],
  );

  const runCouponValidation = useCallback(
    async ({ couponCode = "", giftCardCode = "", city = "", area = "", silent = false } = {}) => {
      const normalizedCouponCode = String(couponCode || "").trim();
      const normalizedGiftCardCode = String(giftCardCode || "").trim();
      if (!cartItems.length) {
        if (!silent) {
          setCouponMessage(isAr ? "أضف منتجات قبل تطبيق الكوبون." : "Add products before applying a coupon.");
        }
        return false;
      }
      if (!silent) {
        setValidatingCoupon(true);
        setCouponMessage("");
      }
      try {
        const response = await fetch(`${API_BASE_URL}/coupons/validate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            region,
            coupon_code: normalizedCouponCode,
            gift_card_code: normalizedGiftCardCode,
            city,
            area,
            items: checkoutItemsPayload(),
          }),
        });
        const data = await readJson(response, { isAr });
        if (!response.ok) throw new Error(data.detail || JSON.stringify(data));
        if (!data.valid) {
          setCouponPreview(null);
          if (!silent) {
            setCouponMessage(data.error || data.message || (isAr ? "الكوبون غير صالح." : "Coupon is not valid."));
          }
          return false;
        }
        setCouponPreview(data);
        if (!silent) {
          setCouponMessage(
            normalizedCouponCode
              ? (data.message || (isAr ? "تم تطبيق الكوبون." : "Coupon applied."))
              : "",
          );
        }
        return true;
      } catch (err) {
        if (silent) {
          setCouponPreview(null);
        } else {
          setCouponMessage(err.message || (isAr ? "تعذر التحقق من الكوبون." : "Unable to validate coupon."));
        }
        return false;
      } finally {
        if (!silent) {
          setValidatingCoupon(false);
        }
      }
    },
    [cartItems.length, checkoutItemsPayload, isAr, region],
  );

  const validateCouponCode = useCallback(
    async (options = {}) =>
      runCouponValidation({
        silent: Boolean(options.silent),
        couponCode:
          Object.prototype.hasOwnProperty.call(options, "couponCode")
            ? options.couponCode
            : form.coupon_code,
        giftCardCode:
          Object.prototype.hasOwnProperty.call(options, "giftCardCode")
            ? options.giftCardCode
            : form.gift_card_code,
        city:
          Object.prototype.hasOwnProperty.call(options, "city")
            ? options.city
            : form.city,
        area:
          Object.prototype.hasOwnProperty.call(options, "area")
            ? options.area
            : form.area,
      }),
    [form.area, form.city, form.coupon_code, form.gift_card_code, runCouponValidation],
  );

  const runGiftCardValidation = useCallback(
    async ({ couponCode = "", giftCardCode = "", city = "", area = "" } = {}) => {
      const normalizedCouponCode = String(couponCode || "").trim();
      const normalizedGiftCardCode = String(giftCardCode || "").trim();
      if (!normalizedGiftCardCode) {
        setGiftCardMessage(
          isAr ? "أدخل كود بطاقة الهدية أولاً." : "Enter a gift card code first.",
        );
        return false;
      }
      if (!cartItems.length) {
        setGiftCardMessage(
          isAr ? "أضف منتجات قبل تطبيق بطاقة الهدية." : "Add products before applying a gift card.",
        );
        return false;
      }
      setValidatingGiftCard(true);
      setGiftCardMessage("");
      try {
        const response = await fetch(`${API_BASE_URL}/gift-cards/validate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            region,
            coupon_code: normalizedCouponCode,
            gift_card_code: normalizedGiftCardCode,
            city,
            area,
            items: checkoutItemsPayload(),
          }),
        });
        const data = await readJson(response, { isAr });
        if (!response.ok || !data.valid) {
          setCouponPreview(null);
          setGiftCardMessage(
            data.error || data.message || (isAr ? "بطاقة الهدية غير صالحة." : "Gift card is not valid."),
          );
          return false;
        }
        setCouponPreview(data);
        setGiftCardMessage(data.message || (isAr ? "تم تطبيق بطاقة الهدية." : "Gift card applied."));
        return true;
      } catch (err) {
        setGiftCardMessage(err.message || (isAr ? "تعذر التحقق من بطاقة الهدية." : "Unable to validate gift card."));
        return false;
      } finally {
        setValidatingGiftCard(false);
      }
    },
    [cartItems.length, checkoutItemsPayload, isAr, region],
  );

  const validateGiftCardCode = useCallback(
    async (options = {}) =>
      runGiftCardValidation({
        couponCode:
          Object.prototype.hasOwnProperty.call(options, "couponCode")
            ? options.couponCode
            : form.coupon_code,
        giftCardCode:
          Object.prototype.hasOwnProperty.call(options, "giftCardCode")
            ? options.giftCardCode
            : form.gift_card_code,
        city:
          Object.prototype.hasOwnProperty.call(options, "city")
            ? options.city
            : form.city,
        area:
          Object.prototype.hasOwnProperty.call(options, "area")
            ? options.area
            : form.area,
      }),
    [form.area, form.city, form.coupon_code, form.gift_card_code, runGiftCardValidation],
  );

  useEffect(() => {
    if (!cartItems.length) {
      setCouponPreview(null);
      return;
    }
    // Debounce the silent auto-revalidation so typing in any checkout field
    // (and rapid cart/region changes) doesn't fire a /coupons/validate/ request
    // per keystroke. The explicit "Apply" button still validates instantly.
    const handle = setTimeout(() => {
      validateCouponCode({
        silent: true,
        couponCode: form.coupon_code,
        giftCardCode: form.gift_card_code,
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [cartItems.length, form.coupon_code, form.gift_card_code, locale, region, subtotal, validateCouponCode]);

  useEffect(() => {
    if (form.gift_card_code && !form.coupon_code) {
      setActiveDiscountField("gift_card");
      return;
    }
    if (form.coupon_code && !form.gift_card_code) {
      setActiveDiscountField("coupon");
    }
  }, [form.coupon_code, form.gift_card_code]);

  const removeCouponCode = useCallback(() => {
    setForm((current) => ({ ...current, coupon_code: "" }));
    setCouponMessage("");
    void validateCouponCode({ silent: true, couponCode: "" });
  }, [validateCouponCode]);

  const removeGiftCardCode = useCallback(() => {
    setForm((current) => ({ ...current, gift_card_code: "" }));
    setGiftCardMessage("");
    void validateCouponCode({ silent: true, giftCardCode: "" });
  }, [validateCouponCode]);

  useEffect(() => {
    let isMounted = true;
    const token = getStoredToken();
    if (!token) return undefined;

    const loadAddresses = async () => {
      setLoadingAddresses(true);
      try {
        const response = await fetch(`${API_BASE_URL}${appendRegionQuery("/account/addresses/", region)}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) return;
        const data = await readJson(response, { isAr });
        if (!isMounted || !Array.isArray(data)) return;
        setSavedAddresses(data);
        const preferred = data.find((item) => item.is_default) || data[0];
        if (preferred) {
          setSelectedAddressId(String(preferred.id));
          if (!hasAutoAddressPrefillRef.current) {
            applySavedAddress(preferred);
            hasAutoAddressPrefillRef.current = true;
          }
        }
      } catch {
        // Intentionally silent: checkout should work without account addresses.
      } finally {
        if (isMounted) {
          setLoadingAddresses(false);
        }
      }
    };

    loadAddresses();
    return () => {
      isMounted = false;
    };
  }, [applySavedAddress]);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setMapStatus("missing_key");
      setMapNotice(
        isAr
          ? "خدمة الخرائط غير مفعلة حالياً، يمكنك إكمال العنوان يدوياً."
          : "Map service is not configured right now. You can complete your address manually.",
      );
      return;
    }

    let cancelled = false;
    setMapStatus("loading");
    setMapNotice("");

    loadGoogleMapsScript({
      apiKey: GOOGLE_MAPS_API_KEY,
      language: isAr ? "ar" : "en",
      regionCode: regionConfig.countryCode,
    })
      .then(() => {
        if (!cancelled) {
          setMapStatus("ready");
        }
      })
      .catch((loadError) => {
        if (cancelled) return;
        setMapStatus("error");
        setMapNotice(
          isAr
            ? "تعذر تحميل خرائط Google حالياً، استخدم إدخال العنوان اليدوي."
            : "Google Maps is currently unavailable, so manual address entry is being used.",
        );
        console.error(loadError);
      });

    return () => {
      cancelled = true;
    };
  }, [isAr, regionConfig.countryCode]);

  useEffect(() => {
    if (mapStatus !== "ready") return;
    if (!mapContainerRef.current || !placeInputRef.current || !window.google?.maps?.places) return;

    const googleMaps = window.google.maps;
    const hasCoordinates =
      form.lat !== "" && form.lng !== "" && Number.isFinite(Number(form.lat)) && Number.isFinite(Number(form.lng));
    const startPosition = hasCoordinates
      ? { lat: Number(form.lat), lng: Number(form.lng) }
      : { lat: regionConfig.center.lat, lng: regionConfig.center.lng };

    const restrictionBounds = regionConfig.bounds
      ? new googleMaps.LatLngBounds(
          { lat: regionConfig.bounds.south, lng: regionConfig.bounds.west },
          { lat: regionConfig.bounds.north, lng: regionConfig.bounds.east },
        )
      : null;

    if (!geocoderRef.current && googleMaps.Geocoder) {
      geocoderRef.current = new googleMaps.Geocoder();
    }

    if (!mapRef.current) {
      mapRef.current = new googleMaps.Map(mapContainerRef.current, {
        center: startPosition,
        zoom: hasCoordinates ? 16 : 11,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        clickableIcons: false,
        gestureHandling: "greedy",
        ...(restrictionBounds
          ? { restriction: { latLngBounds: restrictionBounds, strictBounds: false } }
          : {}),
      });

      markerRef.current = new googleMaps.Marker({
        map: mapRef.current,
        position: startPosition,
        draggable: true,
      });

      markerDragListenerRef.current = markerRef.current.addListener("dragend", () => {
        const position = markerRef.current?.getPosition();
        if (!position) return;
        const lat = position.lat();
        const lng = position.lng();
        updateCoordinates(lat, lng, { keepAddressFields: false });
        void runReverseGeocode(lat, lng);
      });

      mapClickListenerRef.current = mapRef.current.addListener("click", (event) => {
        if (!event.latLng) return;
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        markerRef.current?.setPosition({ lat, lng });
        updateCoordinates(lat, lng, { keepAddressFields: false });
        void runReverseGeocode(lat, lng);
      });
    } else {
      if (restrictionBounds && mapRef.current.setOptions) {
        mapRef.current.setOptions({
          restriction: { latLngBounds: restrictionBounds, strictBounds: false },
        });
      }
      syncMarkerPosition(startPosition.lat, startPosition.lng, true);
    }

    if (!autocompleteRef.current) {
      autocompleteRef.current = new googleMaps.places.Autocomplete(placeInputRef.current, {
        componentRestrictions: { country: regionConfig.countryCode.toLowerCase() },
        fields: ["address_components", "formatted_address", "geometry", "name", "place_id"],
        types: ["geocode"],
        ...(restrictionBounds ? { bounds: restrictionBounds, strictBounds: false } : {}),
      });
      placeListenerRef.current = autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current?.getPlace?.();
        if (!place?.geometry?.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setForm((current) => ({
          ...current,
          lat: lat.toFixed(6),
          lng: lng.toFixed(6),
          ...buildAddressPatchFromGoogleResult(place, current),
        }));
        syncMarkerPosition(lat, lng, true);
      });
    } else {
      if (autocompleteRef.current.setComponentRestrictions) {
        autocompleteRef.current.setComponentRestrictions({
          country: regionConfig.countryCode.toLowerCase(),
        });
      }
      if (restrictionBounds && autocompleteRef.current.setBounds) {
        autocompleteRef.current.setBounds(restrictionBounds);
      }
    }
  }, [
    form.lat,
    form.lng,
    mapStatus,
    regionConfig.bounds,
    regionConfig.center.lat,
    regionConfig.center.lng,
    regionConfig.countryCode,
    runReverseGeocode,
    syncMarkerPosition,
    updateCoordinates,
  ]);

  useEffect(() => {
    return () => {
      mapClickListenerRef.current?.remove?.();
      markerDragListenerRef.current?.remove?.();
      placeListenerRef.current?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!analyticsItems.length) {
      return;
    }
    const signature = analyticsItems
      .map((item) => `${item.item_id}:${item.quantity}`)
      .join("|");
    if (signature === lastBeginCheckoutSignatureRef.current) {
      return;
    }
    const didPush = pushDataLayerEvent("begin_checkout", {
      locale,
      region,
      ecommerce: {
        currency: couponPreview?.currency_code || summaryPricing?.currency_code || "",
        value: asNumber(couponPreview?.final_total ?? subtotal),
        coupon: form.coupon_code || undefined,
        items: analyticsItems,
      },
    });
    if (didPush) {
      lastBeginCheckoutSignatureRef.current = signature;
    }
  }, [
    analyticsItems,
    couponPreview?.currency_code,
    couponPreview?.final_total,
    form.coupon_code,
    locale,
    region,
    subtotal,
    summaryPricing?.currency_code,
  ]);

  async function submitOrder(opts = {}) {
    const applePayExpress = opts.applePay === true;
    let createdOrderContext = null;
    setError("");
    setPaymentRecovery(null);
    if (!cartItems.length) {
      setError(isAr ? "سلة التسوق فارغة." : "Your cart is empty.");
      return;
    }
    if (mapPinRequired && !hasPin) {
      setError(
        isAr
          ? "يرجى تحديد موقع التوصيل على الخريطة قبل تأكيد الطلب."
          : "Please pin your delivery location on the map before placing the order.",
      );
      if (typeof document !== "undefined") {
        const block = document.getElementById("checkout-location");
        if (block) block.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    // Never submit an order whose cart currency doesn't match the selected
    // region — re-trigger repricing and ask the shopper to retry.
    if (currencyMismatch || repricingInFlight) {
      setError(
        isAr
          ? `يتم تحديث الأسعار إلى عملة ${regionCurrency}. يرجى الانتظار لحظة ثم المحاولة مجدداً.`
          : `Prices are still updating to ${regionCurrency}. Please wait a moment and try again.`,
      );
      void refreshCartPricing(locale, region);
      return;
    }
    setSubmitting(true);
    try {
      const pricingIsValid = await validateCouponCode();
      if (!pricingIsValid) {
        setSubmitting(false);
        return;
      }

      const payload = {
        region,
        locale,
        customer: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          sms_opt_in: Boolean(form.sms_opt_in),
          whatsapp_opt_in: Boolean(form.whatsapp_opt_in),
          address_line_1: form.address_line_1,
          address_line_2: form.address_line_2,
          building: form.building,
          floor: form.floor,
          apartment: form.apartment,
          landmark: form.landmark,
          area: form.area,
          city: form.city,
          postcode: form.postcode,
          country: form.country,
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
          place_id: form.place_id,
          formatted_address: form.formatted_address,
          location_notes: form.location_notes,
        },
        payment_method: applePayExpress ? "online" : form.payment_method,
        coupon_code: form.coupon_code,
        gift_card_code: form.gift_card_code,
        notes: form.notes,
        items: checkoutItemsPayload(),
        analytics: getAttributionSnapshot({ regionCode: region }),
      };

      const orderValue = asNumber(couponPreview?.final_total ?? subtotal);
      const currencyCode = couponPreview?.currency_code || summaryPricing?.currency_code || "";
      const shippingAmount = asNumber(couponPreview?.shipping_amount);
      const taxAmount = asNumber(couponPreview?.tax_amount);
      const effectiveOnlineProvider = applePayExpress ? "paymob" : activeOnlineProvider;
      const paymentType = applePayExpress
        ? "online_paymob_apple_pay"
        : form.payment_method === "online" && activeOnlineProvider
          ? `online_${activeOnlineProvider}`
          : form.payment_method;

      pushDataLayerEvent("add_shipping_info", {
        locale,
        region,
        ecommerce: {
          currency: currencyCode,
          value: orderValue,
          shipping_tier: couponPreview?.shipping_method || "standard",
          items: analyticsItems,
        },
      });

      pushDataLayerEvent("add_payment_info", {
        locale,
        region,
        ecommerce: {
          currency: currencyCode,
          value: orderValue + shippingAmount + taxAmount,
          payment_type: paymentType,
          items: analyticsItems,
        },
      });

      const response = await fetch(`${API_BASE_URL}/checkout/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson(response, { isAr });
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));
      saveOrderLookupToken(data.order_number, data.lookup_token);
      createdOrderContext = {
        orderNumber: data.order_number,
        lookupToken: data.lookup_token || "",
        provider: effectiveOnlineProvider,
      };

      if (applePayExpress || form.payment_method === "online") {
        const initiateBody = {
          order_number: data.order_number,
          provider: effectiveOnlineProvider,
          region,
          lookup_token: data.lookup_token || "",
        };
        if (applePayExpress) initiateBody.payment_type = "apple_pay";
        const payRes = await fetch(`${API_BASE_URL}/payments/initiate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(initiateBody),
        });
        const payData = await readJson(payRes, { isAr });
        if (!payRes.ok) {
          setPaymentRecovery({
            orderNumber: data.order_number,
            lookupToken: data.lookup_token || "",
            provider: effectiveOnlineProvider,
          });
          setError(
            payData.error ||
              (isAr
                ? `تعذر بدء الدفع الآن. تم حفظ الطلب ${data.order_number} ويمكنك إعادة المحاولة.`
                : `Unable to start payment right now. Order ${data.order_number} is saved and can be retried.`),
          );
          return;
        }
        // Validate redirect against the trusted payment-origin allowlist.
        const candidate = payData.redirect_url || payData.iframe_url || "";
        const safe = safeRedirectUrl(candidate);
        if (!safe) {
          setPaymentRecovery({
            orderNumber: data.order_number,
            lookupToken: data.lookup_token || "",
            provider: effectiveOnlineProvider,
          });
          setError(
            isAr
              ? `وجهة الدفع غير موثوقة. تم حفظ الطلب ${data.order_number} ويمكنك إعادة المحاولة.`
              : `Untrusted payment redirect. Order ${data.order_number} is saved and can be retried.`,
          );
          return;
        }
        window.location.href = safe;
        return;
      }

      clearCart();
      // Prefer the per-order lookup_token returned by /checkout/ (unguessable);
      // fall back to email_or_phone for older API responses that don't yet
      // include the token.
      const trackingParam = data.lookup_token
        ? `&t=${encodeURIComponent(data.lookup_token)}`
        : `&email_or_phone=${encodeURIComponent(form.email || form.phone)}`;
      router.push(`${buildStorePath(locale, `/thank-you/${data.order_number}`, region)}${trackingParam}`);
    } catch (err) {
      if (createdOrderContext) {
        setPaymentRecovery(createdOrderContext);
      }
      const fallbackMessage = createdOrderContext
        ? (
          isAr
            ? `تعذر بدء الدفع الآن. تم حفظ الطلب ${createdOrderContext.orderNumber} ويمكنك إعادة المحاولة.`
            : `Unable to start payment right now. Order ${createdOrderContext.orderNumber} is saved and can be retried.`
        )
        : (isAr ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again.");
      setError(err.message || fallbackMessage);
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = useMemo(() => {
    if (submitting) {
      if (form.payment_method === "online") return isAr ? "جارٍ التحضير..." : "Preparing payment...";
      return isAr ? "جارٍ تقديم الطلب..." : "Placing order...";
    }
    if (form.payment_method === "online") return isAr ? "المتابعة للدفع" : "Continue to Payment";
    return isAr ? "تقديم الطلب" : "Place Order";
  }, [submitting, form.payment_method, isAr]);

  return (
    <section className="checkout-page section-shell">
      <header className="checkout-hero">
        <div className="checkout-hero-copy">
          <p className="checkout-eyebrow">{t.cart}</p>
          <h1 className="checkout-title">{t.checkout}</h1>
        </div>
        <ol className="checkout-steps" aria-label={isAr ? "خطوات الدفع" : "Checkout steps"}>
          <li className="checkout-step is-active">
            <span className="checkout-step-num">1</span>
            <span>{isAr ? "التفاصيل" : "Details"}</span>
          </li>
          <li className="checkout-step-connector is-active" aria-hidden="true" />
          <li className="checkout-step is-active">
            <span className="checkout-step-num">2</span>
            <span>{isAr ? "التوصيل" : "Delivery"}</span>
          </li>
          <li className="checkout-step-connector" aria-hidden="true" />
          <li className="checkout-step">
            <span className="checkout-step-num">3</span>
            <span>{isAr ? "الدفع" : "Pay"}</span>
          </li>
        </ol>
      </header>

      {cartItems.length === 0 ? (
        <div className="empty-checkout-card">
          <h2>{isAr ? "سلة التسوق فارغة" : "Your cart is empty"}</h2>
          <p>{isAr ? "أضف منتجات قبل الدفع." : "Add some products before checkout."}</p>
          <a href={buildStorePath(locale, "/collections", region)} className="primary-action">
            {isAr ? "متابعة التسوق" : "Continue Shopping"}
          </a>
        </div>
      ) : (
        <div className="checkout-grid">
          <form
            id="checkout-form"
            className="checkout-form"
            onSubmit={(event) => {
              event.preventDefault();
              return submitOrder();
            }}
          >
            <div className="form-card checkout-panel">
              {/* ── Contact Information ── */}
              <div className="checkout-sub-card">
                <div className="checkout-sub-card-head">
                  <span className="checkout-sub-card-icon" aria-hidden="true">👤</span>
                  <div>
                    <h3>{isAr ? "معلومات التواصل" : "Contact Information"}</h3>
                    <p>{isAr ? "لإرسال تأكيد الطلب وتحديثات التوصيل" : "We'll send order confirmation and delivery updates"}</p>
                  </div>
                </div>

                {savedAddresses.length > 0 ? (
                  <div className="saved-address-box">
                    <label htmlFor="saved-address-select">{isAr ? "العناوين المحفوظة" : "Saved addresses"}</label>
                    <div className="saved-address-row">
                      <select
                        id="saved-address-select"
                        value={selectedAddressId}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelectedAddressId(value);
                          const selected = savedAddresses.find((item) => String(item.id) === value);
                          applySavedAddress(selected);
                        }}
                      >
                        {savedAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.full_name} - {address.city}
                          </option>
                        ))}
                      </select>
                      {loadingAddresses ? <span className="saved-address-loading">{isAr ? "تحميل..." : "Loading..."}</span> : null}
                    </div>
                  </div>
                ) : null}

                <div className="checkout-fields checkout-fields--2">
                  <label>
                    {isAr ? "الاسم الكامل" : "Full name"}
                    <span className="label-optional">*</span>
                    <input
                      name="name"
                      value={form.name}
                      onChange={updateField}
                      required
                      autoComplete="name"
                      minLength={2}
                      maxLength={160}
                      placeholder={isAr ? "أدخل اسمك الكامل" : "Enter your full name"}
                    />
                  </label>
                  <label>
                    {isAr ? "رقم الهاتف" : "Phone number"}
                    <span className="label-optional">*</span>
                    <input
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={updateField}
                      required
                      autoComplete="tel"
                      className="field-ltr"
                      pattern="^\+?[0-9 ()\-]{8,32}$"
                      minLength={8}
                      maxLength={32}
                      inputMode="tel"
                      placeholder="+968 1234 5678"
                    />
                  </label>
                  <label className="checkout-field-span-2">
                    {isAr ? "البريد الإلكتروني" : "Email address"}
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={updateField}
                      autoComplete="email"
                      className="field-ltr"
                      maxLength={254}
                      placeholder={isAr ? "example@email.com" : "you@example.com"}
                    />
                  </label>
                </div>

                <div className="checkout-consent">
                  <label className={`checkout-consent-card ${form.sms_opt_in ? "is-checked" : ""}`}>
                    <input name="sms_opt_in" type="checkbox" checked={Boolean(form.sms_opt_in)} onChange={updateField} />
                    <span className="checkout-consent-service-icon checkout-consent-service-icon--sms" aria-hidden="true">
                      <svg viewBox="0 0 20 20" fill="none">
                        <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h11A2.5 2.5 0 0 1 18 4.5v7A2.5 2.5 0 0 1 15.5 14H11l-3.5 3.5V14H4.5A2.5 2.5 0 0 1 2 11.5v-7Z" fill="currentColor" opacity=".15"/>
                        <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h11A2.5 2.5 0 0 1 18 4.5v7A2.5 2.5 0 0 1 15.5 14H11l-3.5 3.5V14H4.5A2.5 2.5 0 0 1 2 11.5v-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M6 7.5h8M6 10.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </span>
                    <span className="checkout-consent-card-body">
                      <strong>{isAr ? "تحديثات SMS" : "SMS updates"}</strong>
                      <small>{isAr ? "تأكيدات الطلب" : "Order confirmations"}</small>
                    </span>
                    <span className="checkout-consent-card-check" aria-hidden="true">
                      <Icon name="check" size={11} />
                    </span>
                  </label>
                  <label className={`checkout-consent-card ${form.whatsapp_opt_in ? "is-checked" : ""}`}>
                    <input name="whatsapp_opt_in" type="checkbox" checked={Boolean(form.whatsapp_opt_in)} onChange={updateField} />
                    <span className="checkout-consent-service-icon checkout-consent-service-icon--wa" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.418A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Zm-1.07 13.51-.006-.003c-.634-.372-1.21-.835-1.706-1.372l-.003-.004a7.72 7.72 0 0 1-1.369-2.38c-.158-.47-.1-.985.19-1.404l.523-.748a.6.6 0 0 1 .985-.017l1.09 1.572a.6.6 0 0 1-.03.736l-.388.464a5.23 5.23 0 0 0 .895 1.11 5.23 5.23 0 0 0 1.13.88l.47-.38a.6.6 0 0 1 .74-.018l1.55 1.118a.6.6 0 0 1-.025.988l-.758.5a1.5 1.5 0 0 1-1.408.096 7.744 7.744 0 0 1-.88-.538Z" fill="currentColor"/>
                      </svg>
                    </span>
                    <span className="checkout-consent-card-body">
                      <strong>{isAr ? "تحديثات واتساب" : "WhatsApp updates"}</strong>
                      <small>{isAr ? "تتبع الطلب" : "Order tracking"}</small>
                    </span>
                    <span className="checkout-consent-card-check" aria-hidden="true">
                      <Icon name="check" size={11} />
                    </span>
                  </label>
                </div>
              </div>

              {/* ── Delivery Address ── */}
              <div className="checkout-sub-card">
                <div className="checkout-sub-card-head">
                  <span className="checkout-sub-card-icon" aria-hidden="true">📍</span>
                  <div>
                    <h3>{isAr ? "عنوان التوصيل" : "Delivery Address"}</h3>
                    <p>{isAr ? "حدد موقعك أو أدخل العنوان يدوياً" : "Pin your location or enter address manually"}</p>
                  </div>
                </div>

                <div id="checkout-location" className={`checkout-location-block ${mapPinRequired && !hasPin ? "is-required-pending" : ""}`}>
                  <div className="checkout-location-block-head">
                    <strong>{isAr ? "حدد موقع التوصيل" : "Pin your delivery location"}</strong>
                    {mapPinRequired ? (
                      <span className="checkout-location-required" aria-label={isAr ? "مطلوب" : "Required"}>
                        {isAr ? "مطلوب" : "Required"}
                      </span>
                    ) : null}
                    {hasPin ? (
                      <span className="checkout-location-set">
                        <Icon name="check" size={12} /> {isAr ? "تم تحديد الموقع" : "Location set"}
                      </span>
                    ) : null}
                  </div>
                  <div className="map-address-card">

                  {mapStatus === "missing_key" || mapStatus === "error" ? (
                    <div className="map-fallback-message">
                      <strong>{isAr ? "تم تفعيل الإدخال اليدوي للعناوين." : "Manual address entry is active."}</strong>
                      <span>{mapNotice}</span>
                    </div>
                  ) : null}

                  {mapStatus === "loading" ? (
                    <div className="map-loading">{isAr ? "تحميل الخريطة..." : "Loading map..."}</div>
                  ) : null}

                  {mapStatus === "ready" ? (
                    <>
                      <div className="map-search-row">
                        <label className="map-search-label">
                          {isAr ? "بحث العنوان" : "Search for an address"}
                          <input
                            ref={placeInputRef}
                            name="place-search"
                            placeholder={isAr ? "ابحث عن عنوان..." : "Search for an address..."}
                          />
                        </label>
                        <button
                          type="button"
                          className="map-locate-btn"
                          onClick={useMyCurrentLocation}
                          disabled={geolocating}
                        >
                          {geolocating
                            ? (isAr ? "جارٍ تحديد الموقع..." : "Locating...")
                            : (isAr ? "📍 استخدم موقعي" : "📍 Use my location")}
                        </button>
                      </div>
                      {geolocationError ? (
                        <p className="form-error map-inline-error">{geolocationError}</p>
                      ) : null}
                      <div ref={mapContainerRef} className="checkout-map-canvas" />
                      <p className="map-address-help">
                        {isAr
                          ? "اسحب العلامة أو انقر على الخريطة لضبط الموقع. سيُعبَّأ العنوان تلقائياً."
                          : "Drag the pin or tap the map to adjust. Address fields fill in automatically."}
                      </p>
                      <div className="map-coordinates">
                        <span>{isAr ? "خط العرض" : "Latitude"}: {form.lat || "—"}</span>
                        <span>{isAr ? "خط الطول" : "Longitude"}: {form.lng || "—"}</span>
                        {geocodingPin ? (
                          <span className="map-geocoding-status">
                            {isAr ? "جلب العنوان..." : "Looking up address..."}
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                  </div>
                </div>

                <div className="checkout-fields checkout-fields--2">
                  <label className="checkout-field-span-2">
                    {isAr ? "عنوان الشارع" : "Street address"}
                    <span className="label-optional">*</span>
                    <input
                      name="address_line_1"
                      value={form.address_line_1}
                      onChange={updateField}
                      required
                      autoComplete="address-line1"
                      placeholder={isAr ? "مثال: شارع السلطان قابوس" : "e.g. Sultan Qaboos Street"}
                    />
                  </label>
                  <label>
                    {isAr ? "المنطقة" : "Area / District"}
                    <span className="label-optional">*</span>
                    <input name="area" value={form.area} onChange={updateField} required placeholder={isAr ? "مثال: القرم" : "e.g. Al Qurum"} />
                  </label>
                  <label>
                    {isAr ? "المدينة" : "City"}
                    <span className="label-optional">*</span>
                    <input name="city" value={form.city} onChange={updateField} required autoComplete="address-level2" placeholder={isAr ? "مثال: مسقط" : "e.g. Muscat"} />
                  </label>
                  <label>
                    {isAr ? "البلد" : "Country"}
                    <span className="label-optional">*</span>
                    <input name="country" value={form.country} onChange={updateField} required autoComplete="country-name" />
                  </label>
                  <label>
                    {isAr ? "ملاحظات التوصيل" : "Delivery notes"}
                    <input
                      name="location_notes"
                      value={form.location_notes}
                      onChange={updateField}
                      placeholder={isAr ? "مثال: مدخل خلفي" : "e.g. back entrance, gate code"}
                    />
                  </label>
                </div>

                <details className="checkout-disclosure">
                  <summary>{isAr ? "تفاصيل إضافية (اختياري)" : "Additional details (optional)"}</summary>
                  <div className="checkout-fields checkout-fields--2">
                    <label>
                      {isAr ? "سطر العنوان 2" : "Address line 2"}
                      <input name="address_line_2" value={form.address_line_2} onChange={updateField} autoComplete="address-line2" />
                    </label>
                    <label>
                      {isAr ? "المبنى" : "Building"}
                      <input name="building" value={form.building} onChange={updateField} />
                    </label>
                    <label>
                      {isAr ? "الطابق" : "Floor"}
                      <input name="floor" value={form.floor} onChange={updateField} />
                    </label>
                    <label>
                      {isAr ? "الشقة" : "Apartment"}
                      <input name="apartment" value={form.apartment} onChange={updateField} />
                    </label>
                    <label>
                      {isAr ? "معلم قريب" : "Nearby landmark"}
                      <input name="landmark" value={form.landmark} onChange={updateField} />
                    </label>
                    <label>
                      {isAr ? "الرمز البريدي" : "Postcode"}
                      <input name="postcode" value={form.postcode} onChange={updateField} autoComplete="postal-code" className="field-ltr" />
                    </label>
                    <label className="checkout-field-span-2">
                      {isAr ? "ملاحظات الطلب" : "Order notes"}
                      <textarea name="notes" value={form.notes} onChange={updateField} rows={2} placeholder={isAr ? "أي ملاحظات إضافية للطلب" : "Any additional notes for your order"} />
                    </label>
                  </div>
                </details>
              </div>

              {/* ── Payment Method ── */}
              <div className="checkout-sub-card">
                <div className="checkout-sub-card-head">
                  <span className="checkout-sub-card-icon" aria-hidden="true">💳</span>
                  <div>
                    <h3>{isAr ? "طريقة الدفع" : "Payment Method"}</h3>
                    <p>{isAr ? "اختر الطريقة المناسبة لك" : "Select your preferred payment method"}</p>
                  </div>
                </div>
                {applePayAvailable ? (
                  <div className="checkout-apple-pay-express">
                    <button
                      type="button"
                      className="cart-apple-pay-button cart-apple-pay-button--buy"
                      disabled={submitting || cartItems.length === 0 || currencyMismatch || repricingInFlight}
                      onClick={() => submitOrder({ applePay: true })}
                      aria-label={isAr ? "ادفع بـ Apple Pay" : "Pay with Apple Pay"}
                    />
                    <span className="checkout-apple-pay-separator">
                      {isAr ? "أو ادفع بطريقة أخرى" : "Or pay another way"}
                    </span>
                  </div>
                ) : null}
                <div className="payment-method-list">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      className={`payment-method-card ${form.payment_method === method.value ? "is-selected" : ""}`}
                      onClick={() => setPaymentMethod(method.value)}
                    >
                      <span className="payment-method-dot" aria-hidden="true" />
                      <span className="payment-method-info">
                        <strong>{isAr ? method.labelAr : method.label}</strong>
                        <span>{isAr ? method.descriptionAr : method.description}</span>
                        {method.badge ? <span className="payment-method-tag">{method.badge}</span> : null}
                        {method.value === "online" && availableOnlineProviders.length > 1 ? (
                          <span className="payment-provider-row">
                            {availableOnlineProviders.map((providerOption) => (
                              <span
                                key={providerOption.key}
                                className={`payment-provider-pill ${activeOnlineProvider === providerOption.key ? "is-active" : ""}`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setOnlineProvider(providerOption.key);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setOnlineProvider(providerOption.key);
                                  }
                                }}
                              >
                                {providerOption.label}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {method.value === "online" && paymentBadges.length ? (
                          <span className="payment-badge-row">
                            {paymentBadges.map((badge) => (
                              <span key={badge} className={`payment-network-badge payment-network-badge--${badge.toLowerCase().replace(/\s/g, "-")}`} aria-label={badge} title={badge}>
                                <PaymentBadgeIcon name={badge} />
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>

                {form.payment_method === "online" ? (
                  <p className="payment-online-note">
                    {isAr
                      ? `ستُحوَّل إلى صفحة الدفع الآمنة عبر ${onlineProviderLabel} بعد تأكيد الطلب.`
                      : `You will be redirected to the secure ${onlineProviderLabel} payment page after your order is confirmed.`}
                  </p>
                ) : null}

                {unconfiguredEnabledProviders.length ? (
                  <p className="payment-online-note payment-online-note--muted">
                    {isAr
                      ? `الدفع الإلكتروني عبر ${unconfiguredEnabledProviders.map((p) => p.label).join("، ")} قيد الإعداد لهذه المنطقة وسيتوفر قريباً.`
                      : `Online payment via ${unconfiguredEnabledProviders.map((p) => p.label).join(", ")} is being set up for this region and will be available soon.`}
                  </p>
                ) : null}
              </div>

              {currencyMismatch && !repricingInFlight ? (
                <div className="currency-mismatch-alert">
                  <p className="form-error" style={{ margin: 0 }}>
                    {pricingRefreshing
                      ? (isAr ? "جارٍ تحديث الأسعار…" : "Updating prices…")
                      : (isAr
                          ? `تعذر تحديث أسعار السلة للمنطقة المختارة (${regionCurrency}). يرجى مسح السلة والإضافة من جديد.`
                          : `Cart prices couldn't be updated for the selected region (${regionCurrency}). Please clear your cart and add items again.`)}
                  </p>
                  {!pricingRefreshing ? (
                    <div className="currency-mismatch-actions">
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => {
                          setPricingRefreshing(true);
                          refreshCartPricing(locale, region).finally(() => setPricingRefreshing(false));
                        }}
                      >
                        {isAr ? "إعادة المحاولة" : "Retry"}
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        style={{ color: "var(--error, #c0392b)" }}
                        onClick={() => { clearCart(); }}
                      >
                        {isAr ? "مسح السلة" : "Clear Cart"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <p className="form-error">{error}</p> : null}
              {paymentRecovery ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  <a
                    href={`${buildStorePath(locale, "/payment/failed", region)}&order_number=${encodeURIComponent(paymentRecovery.orderNumber)}${paymentRecovery.lookupToken ? `&lookup_token=${encodeURIComponent(paymentRecovery.lookupToken)}` : ""}${paymentRecovery.provider ? `&provider=${encodeURIComponent(paymentRecovery.provider)}` : ""}`}
                    className="secondary-action"
                  >
                    {isAr ? "إعادة محاولة الدفع لهذا الطلب" : "Retry payment for this order"}
                  </a>
                </div>
              ) : null}

              <button
                type="submit"
                className="primary-action full-width checkout-form-submit--mobile"
                disabled={submitting || cartItems.length === 0 || currencyMismatch || repricingInFlight}
              >
                {submitting ? <span className="btn-spinner" /> : null}
                {submitLabel}
              </button>
            </div>
          </form>

          <aside className="order-summary-card">
            <h2 className="order-summary-heading">
              {isAr ? "ملخص الطلب" : "Order Summary"}
            </h2>

            <div className="summary-lines">
              {cartItems.map((item) => (
                <div key={item.lineId} className="summary-line">
                  <img src={item.image} alt={item.name} />
                  <div>
                    <strong>{item.name}</strong>
                    {item.selectedOptionsText ? <span>{item.selectedOptionsText}</span> : null}
                    <small>{isAr ? `الكمية: ${item.quantity}` : `Qty: ${item.quantity}`}</small>
                  </div>
                  <b>
                    {formatMoney(
                      { ...item.pricing, amount: item.pricing.amount * item.quantity, prefix: "" },
                      locale,
                    )}
                  </b>
                </div>
              ))}
            </div>

            <div className="subtotal-row">
              <span>{t.subtotal}</span>
              <strong>{formatMoney(summaryPricing, locale)}</strong>
            </div>

            {couponPreview?.valid ? (
              <>
                {Number(couponPreview.milestone_discount_pct) > 0 && (
                  <div className="milestone-discount-badge">
                    <span aria-hidden="true">🎉</span>
                    <span>
                      {isAr
                        ? `خصم ${Number(couponPreview.milestone_discount_pct).toFixed(0)}% مطبّق`
                        : `${Number(couponPreview.milestone_discount_pct).toFixed(0)}% discount applied`}
                    </span>
                  </div>
                )}
                {couponPreview.milestone_free_shipping && (
                  <div className="milestone-discount-badge">
                    <span aria-hidden="true">🚚</span>
                    <span>{isAr ? "شحن مجاني مطبّق" : "Free shipping applied"}</span>
                  </div>
                )}
                <div className="subtotal-row">
                  <span>{isAr ? "الخصم" : "Discount"}</span>
                  <strong className="summary-amount--discount">
                    -{previewMoney(couponPreview.discount_amount)}
                  </strong>
                </div>
                {Number(couponPreview.gift_card_amount || 0) > 0 ? (
                  <div className="subtotal-row">
                    <span>{isAr ? "بطاقة هدية" : "Gift card"}</span>
                    <strong className="summary-amount--discount">
                      -{previewMoney(couponPreview.gift_card_amount)}
                    </strong>
                  </div>
                ) : null}
                <div className="subtotal-row">
                  <span>{t.shipping}</span>
                  <strong>
                    {Number(couponPreview.shipping_amount) > 0
                      ? previewMoney(couponPreview.shipping_amount)
                      : isAr
                        ? "مجاناً"
                        : "Free"}
                  </strong>
                </div>
                <div className="subtotal-row">
                  <span>
                    {couponPreview.tax_label || (isAr ? "ضريبة القيمة المضافة" : "VAT")}
                    {couponPreview.tax_rate ? ` (${(Number(couponPreview.tax_rate) * 100).toFixed(2)}%)` : ""}
                  </span>
                  <strong>{previewMoney(couponPreview.tax_amount || 0)}</strong>
                </div>
                <div className="subtotal-row">
                  <span>{isAr ? "مدة التوصيل المتوقعة" : "Estimated Delivery"}</span>
                  <strong>{formatEtaText(couponPreview.eta_min_days, couponPreview.eta_max_days, isAr)}</strong>
                </div>
    
            

            <div className="subtotal-row order-grand-total">
                  <span>{isAr ? "الإجمالي" : "Total"}</span>
                  <strong>{previewMoney(couponPreview.final_total)}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="subtotal-row">
                  <span>{isAr ? "الخصم" : "Discount"}</span>
                  <strong>{previewMoney(0)}</strong>
                </div>
                <div className="subtotal-row">
                  <span>{t.shipping}</span>
                  <strong>—</strong>
                </div>
                <div className="subtotal-row">
                  <span>{isAr ? "ضريبة القيمة المضافة" : "VAT"}</span>
                  <strong>—</strong>
                </div>
                <div className="subtotal-row">
                  <span>{isAr ? "مدة التوصيل المتوقعة" : "Estimated Delivery"}</span>
                  <strong>—</strong>
                </div>
    
            

            <div className="subtotal-row order-grand-total">
                  <span>{isAr ? "الإجمالي" : "Total"}</span>
                  <strong>{formatMoney(summaryPricing, locale)}</strong>
                </div>
              </>
            )}

            <div className="checkout-aside-coupon">
              <div className="checkout-discount-switcher" role="tablist" aria-label={isAr ? "طرق الخصم" : "Discount methods"}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDiscountField === "coupon"}
                  className={`checkout-discount-tab ${activeDiscountField === "coupon" ? "is-active" : ""}`}
                  onClick={() => setActiveDiscountField("coupon")}
                >
                  <span>{isAr ? "كوبون" : "Coupon"}</span>
                  {form.coupon_code ? (
                    <span className="checkout-discount-tab-badge">{isAr ? "مضاف" : "Added"}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDiscountField === "gift_card"}
                  className={`checkout-discount-tab ${activeDiscountField === "gift_card" ? "is-active" : ""}`}
                  onClick={() => setActiveDiscountField("gift_card")}
                >
                  <span>{isAr ? "بطاقة هدية" : "Gift card"}</span>
                  {form.gift_card_code ? (
                    <span className="checkout-discount-tab-badge">{isAr ? "مضاف" : "Added"}</span>
                  ) : null}
                </button>
              </div>

              {activeDiscountField === "coupon" ? (
                <div className="coupon-field">
                  <label htmlFor="coupon_code_aside">{isAr ? "كود الخصم" : "Coupon"}</label>
                  <div className="coupon-row">
                    <input
                      id="coupon_code_aside"
                      name="coupon_code"
                      value={form.coupon_code}
                      onChange={updateField}
                      placeholder={isAr ? "كود الخصم" : "Coupon code"}
                      className="field-ltr"
                    />
                    <button type="button" onClick={validateCouponCode} disabled={validatingCoupon}>
                      {validatingCoupon ? "..." : isAr ? "تطبيق" : "Apply"}
                    </button>
                  </div>
                  {couponMessage ? (
                    <p className={couponPreview?.valid ? "form-success" : "form-error"}>
                      {couponMessage}
                    </p>
                  ) : null}
                  {form.coupon_code ? (
                    <button type="button" className="checkout-inline-clear" onClick={removeCouponCode}>
                      {isAr ? "إزالة الكوبون" : "Remove coupon"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="coupon-field">
                  <label htmlFor="gift_card_code_aside">{isAr ? "بطاقة هدية" : "Gift card"}</label>
                  <div className="coupon-row">
                    <input
                      id="gift_card_code_aside"
                      name="gift_card_code"
                      value={form.gift_card_code}
                      onChange={updateField}
                      placeholder={isAr ? "كود بطاقة الهدية" : "Gift card code"}
                      className="field-ltr"
                    />
                    <button type="button" onClick={validateGiftCardCode} disabled={validatingGiftCard}>
                      {validatingGiftCard ? "..." : isAr ? "تطبيق" : "Apply"}
                    </button>
                  </div>
                  {giftCardMessage ? (
                    <p className={couponPreview?.valid ? "form-success" : "form-error"}>
                      {giftCardMessage}
                    </p>
                  ) : null}
                  {form.gift_card_code ? (
                    <button type="button" className="checkout-inline-clear" onClick={removeGiftCardCode}>
                      {isAr ? "إزالة بطاقة الهدية" : "Remove gift card"}
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <button
              type="submit"
              form="checkout-form"
              className="primary-action full-width checkout-aside-submit"
              disabled={submitting || cartItems.length === 0 || currencyMismatch || repricingInFlight}
            >
              {submitting ? <span className="btn-spinner" /> : null}
              {submitLabel}
            </button>

            {!submitting ? (
              <div className="checkout-trust">
                <span className="checkout-trust-item">
                  <Icon name="shield" size={14} className="trust-icon" />
                  {isAr ? "دفع آمن" : "Secure checkout"}
                </span>
                <span className="checkout-trust-item">
                  <Icon name="truck" size={14} className="trust-icon" />
                  {isAr ? "توصيل سريع" : "Fast delivery"}
                </span>
                <span className="checkout-trust-item">
                  <Icon name="check" size={14} className="trust-icon" />
                  {isAr ? "تأكيد سهل للطلب" : "Easy order confirmation"}
                </span>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}
