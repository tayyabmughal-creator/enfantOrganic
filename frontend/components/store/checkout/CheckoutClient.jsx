"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useStore } from "@/components/store/cart/StoreProvider";
import Icon from "@/components/icons/Icon";
import { buildAnalyticsItems, pushDataLayerEvent } from "@/lib/analytics";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";
import { API_BASE_URL as CONFIG_API_BASE_URL, CUSTOMER_TOKEN_KEY, safeRedirectUrl } from "@/lib/config";

const API_BASE_URL = CONFIG_API_BASE_URL;
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const AUTH_TOKEN_KEY = CUSTOMER_TOKEN_KEY;
const GOOGLE_SCRIPT_ID = "enfant-google-maps-script";

const REGION_SETTINGS = {
  om: {
    countryCode: "OM",
    countryNameEn: "Oman",
    countryNameAr: "عُمان",
    center: { lat: 23.588, lng: 58.3829 },
  },
  ae: {
    countryCode: "AE",
    countryNameEn: "United Arab Emirates",
    countryNameAr: "الإمارات العربية المتحدة",
    center: { lat: 25.2048, lng: 55.2708 },
  },
  sa: {
    countryCode: "SA",
    countryNameEn: "Saudi Arabia",
    countryNameAr: "المملكة العربية السعودية",
    center: { lat: 24.7136, lng: 46.6753 },
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

export default function CheckoutClient({ locale, region, regionConfig: regionSettingsData = null }) {
  const router = useRouter();
  const t = uiText(locale);
  const { cartItems, subtotal, clearCart } = useStore();
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
    notes: "",
    payment_method: "cod",
  });

  const [submitting, setSubmitting] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponPreview, setCouponPreview] = useState(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [error, setError] = useState("");

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  const [mapStatus, setMapStatus] = useState(GOOGLE_MAPS_API_KEY ? "idle" : "missing_key");
  const [mapNotice, setMapNotice] = useState("");
  const [onlineProvider, setOnlineProvider] = useState("");

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
    if (regionKey === "sa" && hasFlag("mada", false)) badges.push("Mada");
    if (hasFlag("apple_pay", false)) badges.push("Apple Pay");
    if (hasFlag("google_pay", false)) badges.push("Google Pay");
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
      country: current.country || getCountryName(regionKey, isAr),
    }));
  }, [regionKey, isAr]);

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

  const applySavedAddress = useCallback(
    (address) => {
      if (!address) return;
      const mapped = mapAddressToForm(address, regionKey, isAr);
      setForm((current) => ({
        ...current,
        ...mapped,
        email: current.email,
        coupon_code: current.coupon_code,
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

  const validateCouponCode = useCallback(
    async (options = {}) => {
      const { silent = false } = options;
      const couponCode = form.coupon_code.trim();
      if (!cartItems.length) {
        if (!silent) {
          setCouponMessage(isAr ? "أضف منتجات قبل تطبيق الكوبون." : "Add products before applying a coupon.");
        }
        return false;
      }
      setValidatingCoupon(true);
      if (!silent) {
        setCouponMessage("");
      }
      try {
        const response = await fetch(`${API_BASE_URL}/coupons/validate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            region,
            coupon_code: couponCode,
            city: form.city,
            area: form.area,
            items: checkoutItemsPayload(),
          }),
        });
        const data = await response.json();
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
          setCouponMessage(couponCode ? (data.message || (isAr ? "تم تطبيق الكوبون." : "Coupon applied.")) : "");
        }
        return true;
      } catch (err) {
        if (!silent) {
          setCouponPreview(null);
          setCouponMessage(err.message || (isAr ? "تعذر التحقق من الكوبون." : "Unable to validate coupon."));
        }
        return false;
      } finally {
        setValidatingCoupon(false);
      }
    },
    [cartItems.length, checkoutItemsPayload, form.area, form.city, form.coupon_code, isAr, region],
  );

  useEffect(() => {
    if (!cartItems.length) {
      setCouponPreview(null);
      return;
    }
    validateCouponCode({ silent: true });
  }, [region, locale, subtotal, cartItems.length, validateCouponCode]);

  useEffect(() => {
    let isMounted = true;
    const token = getStoredToken();
    if (!token) return undefined;

    const loadAddresses = async () => {
      setLoadingAddresses(true);
      try {
        const response = await fetch(`${API_BASE_URL}/account/addresses/`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) return;
        const data = await response.json();
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

    if (!mapRef.current) {
      mapRef.current = new googleMaps.Map(mapContainerRef.current, {
        center: startPosition,
        zoom: hasCoordinates ? 16 : 12,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });

      markerRef.current = new googleMaps.Marker({
        map: mapRef.current,
        position: startPosition,
        draggable: true,
      });

      markerDragListenerRef.current = markerRef.current.addListener("dragend", () => {
        const position = markerRef.current?.getPosition();
        if (!position) return;
        updateCoordinates(position.lat(), position.lng(), { keepAddressFields: false });
      });

      mapClickListenerRef.current = mapRef.current.addListener("click", (event) => {
        if (!event.latLng) return;
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        markerRef.current?.setPosition({ lat, lng });
        updateCoordinates(lat, lng, { keepAddressFields: false });
      });
    } else {
      syncMarkerPosition(startPosition.lat, startPosition.lng, true);
    }

    if (!autocompleteRef.current) {
      autocompleteRef.current = new googleMaps.places.Autocomplete(placeInputRef.current, {
        componentRestrictions: { country: regionConfig.countryCode.toLowerCase() },
        fields: ["address_components", "formatted_address", "geometry", "name", "place_id"],
        types: ["geocode"],
      });
      placeListenerRef.current = autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current?.getPlace?.();
        if (!place?.geometry?.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const city =
          extractAddressComponent(place.address_components, "locality") ||
          extractAddressComponent(place.address_components, "administrative_area_level_1");
        const area =
          extractAddressComponent(place.address_components, "sublocality") ||
          extractAddressComponent(place.address_components, "neighborhood");
        const postcode = extractAddressComponent(place.address_components, "postal_code");
        const country = extractAddressComponent(place.address_components, "country");

        setForm((current) => ({
          ...current,
          lat: lat.toFixed(6),
          lng: lng.toFixed(6),
          place_id: place.place_id || "",
          formatted_address: place.formatted_address || place.name || "",
          address_line_1: place.formatted_address || place.name || current.address_line_1,
          city: city || current.city,
          area: area || current.area,
          postcode: postcode || current.postcode,
          country: country || current.country,
        }));
        syncMarkerPosition(lat, lng, true);
      });
    }

    if (autocompleteRef.current?.setComponentRestrictions) {
      autocompleteRef.current.setComponentRestrictions({
        country: regionConfig.countryCode.toLowerCase(),
      });
    }
  }, [form.lat, form.lng, mapStatus, regionConfig.center.lat, regionConfig.center.lng, regionConfig.countryCode, syncMarkerPosition, updateCoordinates]);

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

  async function submitOrder(event) {
    event.preventDefault();
    setError("");
    if (!cartItems.length) {
      setError(isAr ? "سلة التسوق فارغة." : "Your cart is empty.");
      return;
    }
    setSubmitting(true);
    try {
      const couponIsValid = await validateCouponCode();
      if (!couponIsValid) {
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
        payment_method: form.payment_method,
        coupon_code: form.coupon_code,
        notes: form.notes,
        items: checkoutItemsPayload(),
      };

      const orderValue = asNumber(couponPreview?.final_total ?? subtotal);
      const currencyCode = couponPreview?.currency_code || summaryPricing?.currency_code || "";
      const shippingAmount = asNumber(couponPreview?.shipping_amount);
      const taxAmount = asNumber(couponPreview?.tax_amount);
      const paymentType =
        form.payment_method === "online" && activeOnlineProvider
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));

      clearCart();

      if (form.payment_method === "online") {
        const payRes = await fetch(`${API_BASE_URL}/payments/initiate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_number: data.order_number,
            provider: activeOnlineProvider,
          }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.error || "Payment initiation failed. Please try again.");
        // Validate redirect against the trusted payment-origin allowlist.
        const candidate = payData.redirect_url || payData.iframe_url || "";
        const safe = safeRedirectUrl(candidate);
        if (!safe) {
          throw new Error(
            isAr
              ? "وجهة الدفع غير موثوقة. يرجى التواصل مع الدعم."
              : "Untrusted payment redirect. Please contact support.",
          );
        }
        window.location.href = safe;
        return;
      }

      // Prefer the per-order lookup_token returned by /checkout/ (unguessable);
      // fall back to email_or_phone for older API responses that don't yet
      // include the token.
      const trackingParam = data.lookup_token
        ? `&t=${encodeURIComponent(data.lookup_token)}`
        : `&email_or_phone=${encodeURIComponent(form.email || form.phone)}`;
      router.push(`${buildStorePath(locale, `/thank-you/${data.order_number}`, region)}${trackingParam}`);
    } catch (err) {
      setError(err.message || (isAr ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again."));
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
          <form id="checkout-form" className="checkout-form" onSubmit={submitOrder}>
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
                    <span className="checkout-consent-card-icon">
                      <Icon name="check" size={12} />
                    </span>
                    <span className="checkout-consent-card-label">{isAr ? "تحديثات SMS" : "SMS updates"}</span>
                  </label>
                  <label className={`checkout-consent-card ${form.whatsapp_opt_in ? "is-checked" : ""}`}>
                    <input name="whatsapp_opt_in" type="checkbox" checked={Boolean(form.whatsapp_opt_in)} onChange={updateField} />
                    <span className="checkout-consent-card-icon">
                      <Icon name="check" size={12} />
                    </span>
                    <span className="checkout-consent-card-label">{isAr ? "تحديثات واتساب" : "WhatsApp updates"}</span>
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

                <details className="checkout-disclosure is-location-card" open={mapStatus === "ready"}>
                  <summary>{isAr ? "حدد موقع التوصيل" : "Pin your delivery location"}</summary>
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
                      <label>
                        {isAr ? "بحث العنوان" : "Search for an address"}
                        <input
                          ref={placeInputRef}
                          name="place-search"
                          placeholder={isAr ? "ابحث عن عنوان..." : "Search for an address..."}
                        />
                      </label>
                      <div ref={mapContainerRef} className="checkout-map-canvas" />
                      <div className="map-coordinates">
                        <span>{isAr ? "خط العرض" : "Latitude"}: {form.lat || "—"}</span>
                        <span>{isAr ? "خط الطول" : "Longitude"}: {form.lng || "—"}</span>
                      </div>
                    </>
                  ) : null}
                  </div>
                </details>

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
                              <span key={badge} className="payment-network-badge">
                                {badge}
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
              </div>

              {error ? <p className="form-error">{error}</p> : null}

              <button
                type="submit"
                className="primary-action full-width checkout-form-submit--mobile"
                disabled={submitting || cartItems.length === 0}
              >
                {submitting ? <span className="btn-spinner" /> : null}
                {submitLabel}
              </button>
            </div>
          </form>

          <aside className="order-summary-card">
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 750 }}>
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
                <div className="subtotal-row">
                  <span>{isAr ? "الخصم" : "Discount"}</span>
                  <strong style={{ color: "var(--success)" }}>
                    -{previewMoney(couponPreview.discount_amount)}
                  </strong>
                </div>
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
                  <p className={couponPreview?.valid ? "form-success" : "form-error"} style={{ margin: 0 }}>
                    {couponMessage}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              form="checkout-form"
              className="primary-action full-width checkout-aside-submit"
              disabled={submitting || cartItems.length === 0}
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
                  {isAr ? "توصيل سريع في عُمان" : "Fast Oman delivery"}
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
