"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import CartDrawer from "@/components/store/cart/CartDrawer";
import QuickViewModal from "@/components/store/product/QuickViewModal";
import { buildAnalyticsItem, pushDataLayerEvent } from "@/lib/analytics";
import { API_BASE_URL as CONFIG_API_BASE_URL } from "@/lib/config";
import { trackEvent } from "@/lib/eventTracking";

const CART_STORAGE_KEY = "enfant-organics-cart";
const API_BASE_URL = CONFIG_API_BASE_URL;
const StoreContext = createContext(null);

export default function StoreProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const sanitized = Array.isArray(parsed)
          ? parsed.filter(
              (item) =>
                item &&
                typeof item.lineId === "string" &&
                item.pricing &&
                typeof item.pricing.amount === "number",
            )
          : [];

        setCartItems(sanitized);
      } catch {
        window.localStorage.removeItem(CART_STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems, hydrated]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen || quickViewProduct ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen, quickViewProduct]);

  const value = useMemo(() => {
    const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);
    const subtotal = cartItems.reduce(
      (total, item) => total + item.quantity * (item.pricing?.amount || 0),
      0,
    );

    return {
      cartItems,
      itemCount,
      subtotal,
      drawerOpen,
      quickViewProduct,
      openCart: () => setDrawerOpen(true),
      closeCart: () => setDrawerOpen(false),
      openQuickView: (product) => setQuickViewProduct(product),
      closeQuickView: () => setQuickViewProduct(null),
      refreshCartPricing: async (locale, region) => {
        const needsRefresh = cartItems.some(
          (item) =>
            item?.slug &&
            (item.pricing?.region_code !== region || item.locale !== locale),
        );

        if (!needsRefresh) {
          return;
        }

        const uniqueSlugs = [...new Set(cartItems.map((item) => item.slug).filter(Boolean))];

        try {
          const refreshedProducts = await Promise.all(
            uniqueSlugs.map(async (slug) => {
              const params = new URLSearchParams({ locale, region });
              const response = await fetch(`${API_BASE_URL}/products/${slug}/?${params.toString()}`, {
                cache: "no-store",
              });

              if (!response.ok) {
                return null;
              }

              const data = await response.json();

              if (!data?.product?.pricing) {
                return null;
              }

              return [
                slug,
                {
                  image: data.product.image,
                  name: data.product.name,
                  pricing: data.product.pricing,
                },
              ];
            }),
          );

          const refreshedBySlug = new Map(refreshedProducts.filter(Boolean));

          if (!refreshedBySlug.size) {
            return;
          }

          setCartItems((current) =>
            current.map((item) => {
              const refreshed = refreshedBySlug.get(item.slug);

              if (!refreshed) {
                return item;
              }

              return {
                ...item,
                image: refreshed.image || item.image,
                locale,
                name: refreshed.name || item.name,
                pricing: refreshed.pricing,
              };
            }),
          );
        } catch {
          return;
        }
      },
      addItem: (product, quantity = 1, selectedOptions = {}) => {
        const nextQuantity = Math.max(Number(quantity) || 1, 1);
        const selectedOptionsText = Object.entries(selectedOptions)
          .map(([name, value]) => `${name}: ${value}`)
          .join(" · ");

        const lineId = `${product.slug}-${selectedOptionsText || "default"}`;

        setCartItems((current) => {
          const existing = current.find((item) => item.lineId === lineId);
          if (existing) {
            return current.map((item) =>
              item.lineId === lineId
                ? { ...item, quantity: item.quantity + nextQuantity }
                : item,
            );
          }

          return [
            ...current,
            {
              lineId,
              slug: product.slug,
              name: product.name,
              image: product.image,
              quantity: nextQuantity,
              pricing: product.pricing,
              locale: product.locale || "en",
              selectedOptionsText,
            },
          ];
        });

        const item = buildAnalyticsItem({
          ...product,
          selected_options_text: selectedOptionsText,
          quantity: nextQuantity,
        });
        if (item) {
          pushDataLayerEvent("add_to_cart", {
            locale: product.locale || "en",
            region: product.pricing?.region_code || "",
            ecommerce: {
              currency: product.pricing?.currency_code || "",
              value: (Number(product.pricing?.amount) || 0) * nextQuantity,
              items: [item],
            },
          });
        }
        // Record a real add_to_cart event for admin funnel analytics.
        trackEvent("add_to_cart", {
          productSlug: product.slug,
          regionCode: product.pricing?.region_code || "",
        });
      },
      updateQuantity: (lineId, nextQuantity) => {
        const existingItem = cartItems.find((item) => item.lineId === lineId);
        if (existingItem) {
          const delta = Math.abs(Number(nextQuantity) - Number(existingItem.quantity));
          if (delta > 0) {
            const eventName =
              Number(nextQuantity) > Number(existingItem.quantity)
                ? "add_to_cart"
                : "remove_from_cart";
            const eventItem = buildAnalyticsItem({
              ...existingItem,
              selected_options_text: existingItem.selectedOptionsText,
              quantity: delta,
            });
            if (eventItem) {
              pushDataLayerEvent(eventName, {
                locale: existingItem.locale || "en",
                region: existingItem.pricing?.region_code || "",
                ecommerce: {
                  currency: existingItem.pricing?.currency_code || "",
                  value: (Number(existingItem.pricing?.amount) || 0) * delta,
                  items: [eventItem],
                },
              });
            }
          }
        }

        if (nextQuantity <= 0) {
          setCartItems((current) => current.filter((item) => item.lineId !== lineId));
          return;
        }

        setCartItems((current) =>
          current.map((item) =>
            item.lineId === lineId ? { ...item, quantity: nextQuantity } : item,
          ),
        );
      },
      removeItem: (lineId) => {
        const existingItem = cartItems.find((item) => item.lineId === lineId);
        if (existingItem) {
          const eventItem = buildAnalyticsItem({
            ...existingItem,
            selected_options_text: existingItem.selectedOptionsText,
            quantity: existingItem.quantity,
          });
          if (eventItem) {
            pushDataLayerEvent("remove_from_cart", {
              locale: existingItem.locale || "en",
              region: existingItem.pricing?.region_code || "",
              ecommerce: {
                currency: existingItem.pricing?.currency_code || "",
                value:
                  (Number(existingItem.pricing?.amount) || 0) *
                  Number(existingItem.quantity || 1),
                items: [eventItem],
              },
            });
          }
        }
        setCartItems((current) => current.filter((item) => item.lineId !== lineId));
      },
      clearCart: () => {
        setCartItems([]);
        window.localStorage.removeItem(CART_STORAGE_KEY);
      },
    };
  }, [cartItems, drawerOpen, quickViewProduct]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      <CartDrawer />
      <QuickViewModal />
    </StoreContext.Provider>
  );
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useStore must be used within StoreProvider");
  }
  return store;
}
