"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import CartDrawer from "@/components/store/cart/CartDrawer";
import QuickViewModal from "@/components/store/product/QuickViewModal";

const CART_STORAGE_KEY = "enfant-organics-cart";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
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
        const selectedOptionsText = Object.entries(selectedOptions)
          .map(([name, value]) => `${name}: ${value}`)
          .join(" · ");

        const lineId = `${product.slug}-${selectedOptionsText || "default"}`;

        setCartItems((current) => {
          const existing = current.find((item) => item.lineId === lineId);
          if (existing) {
            return current.map((item) =>
              item.lineId === lineId
                ? { ...item, quantity: item.quantity + quantity }
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
              quantity,
              pricing: product.pricing,
              locale: product.locale || "en",
              selectedOptionsText,
            },
          ];
        });
      },
      updateQuantity: (lineId, nextQuantity) => {
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
