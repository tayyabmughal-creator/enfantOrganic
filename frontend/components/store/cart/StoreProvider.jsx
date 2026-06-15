"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import CartDrawer from "@/components/store/cart/CartDrawer";
import QuickViewModal from "@/components/store/product/QuickViewModal";
import { buildAnalyticsItem, pushDataLayerEvent } from "@/lib/analytics";
import { API_BASE_URL as CONFIG_API_BASE_URL } from "@/lib/config";
import { trackEvent } from "@/lib/eventTracking";

const CART_STORAGE_KEY = "enfant-organics-cart";
const API_BASE_URL = CONFIG_API_BASE_URL;

// Split into two contexts: STATE (changes on every cart mutation) and ACTIONS
// (stable for the lifetime of the provider). Action-only consumers — notably
// every ProductCard in a grid — subscribe via useStoreActions() and therefore
// do NOT re-render when the cart changes. Actions read the latest cart through
// cartItemsRef so they can stay referentially stable without going stale.
const StoreStateContext = createContext(null);
const StoreActionsContext = createContext(null);

export default function StoreProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [repricingInFlight, setRepricingInFlight] = useState(false);

  // Always points at the latest cart so stable actions can read current items.
  const cartItemsRef = useRef(cartItems);
  cartItemsRef.current = cartItems;

  // Stable setter refs so actions (frozen in useMemo([])) can update state.
  const setRepricingInFlightRef = useRef(setRepricingInFlight);
  setRepricingInFlightRef.current = setRepricingInFlight;

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

  // Stable for the provider's lifetime (empty dep array). Setters are stable and
  // current cart is read via cartItemsRef.current, never a stale closure.
  const actions = useMemo(
    () => ({
      openCart: () => setDrawerOpen(true),
      closeCart: () => setDrawerOpen(false),
      flyToCart: (fromEl) => {
        const cartEl = document.querySelector(".cart-link");
        if (!cartEl || !fromEl) return;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = cartEl.getBoundingClientRect();

        const dot = document.createElement("div");
        dot.className = "fly-to-cart-dot";
        const startX = fromRect.left + fromRect.width / 2 - 7;
        const startY = fromRect.top + fromRect.height / 2 - 7;
        dot.style.left = `${startX}px`;
        dot.style.top = `${startY}px`;
        document.body.appendChild(dot);

        // Force reflow so transition fires
        dot.getBoundingClientRect();

        const endX = toRect.left + toRect.width / 2 - 7;
        const endY = toRect.top + toRect.height / 2 - 7;
        const dx = endX - startX;
        const dy = endY - startY;

        // Phase 1: fly to cart at full opacity
        dot.style.transition = "transform 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        dot.style.transform = `translate(${dx}px, ${dy}px) scale(0.35)`;

        setTimeout(() => {
          // Phase 2: quick fade once arrived
          dot.style.transition = "opacity 0.15s ease";
          dot.style.opacity = "0";
          setTimeout(() => {
            dot.remove();
            const badge = cartEl.querySelector(".cart-badge");
            if (badge) {
              badge.classList.remove("cart-badge-bump");
              badge.getBoundingClientRect();
              badge.classList.add("cart-badge-bump");
              badge.addEventListener(
                "animationend",
                () => badge.classList.remove("cart-badge-bump"),
                { once: true },
              );
            }
          }, 160);
        }, 660);
      },
      openQuickView: (product) => setQuickViewProduct(product),
      closeQuickView: () => setQuickViewProduct(null),
      refreshCartPricing: async (locale, region) => {
        const items = cartItemsRef.current;
        const needsRefresh = items.some(
          (item) =>
            item?.slug &&
            (item.pricing?.region_code !== region || item.locale !== locale),
        );

        if (!needsRefresh) {
          return;
        }

        setRepricingInFlightRef.current(true);

        const uniqueSlugs = [...new Set(items.map((item) => item.slug).filter(Boolean))];

        try {
          const refreshedProducts = await Promise.all(
            uniqueSlugs.map(async (slug) => {
              // Use timestamp cache-bust instead of cache:"no-store" —
              // Safari silently fails fetches with that directive on some
              // cross-origin requests, causing the cart to stay mis-priced.
              const params = new URLSearchParams({ locale, region, _t: Date.now() });
              const response = await fetch(`${API_BASE_URL}/products/${slug}/?${params.toString()}`);

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
                // Stamp region_code so needsRefresh evaluates correctly next
                // time — API may omit it, causing an infinite reprice loop.
                pricing: { ...refreshed.pricing, region_code: region },
              };
            }),
          );
        } catch {
          // fall through
        } finally {
          setRepricingInFlightRef.current(false);
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
        const existingItem = cartItemsRef.current.find((item) => item.lineId === lineId);
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
        const existingItem = cartItemsRef.current.find((item) => item.lineId === lineId);
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
    }),
    [],
  );

  const state = useMemo(() => {
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
      repricingInFlight,
    };
  }, [cartItems, drawerOpen, quickViewProduct, repricingInFlight]);

  return (
    <StoreActionsContext.Provider value={actions}>
      <StoreStateContext.Provider value={state}>
        {children}
        <CartDrawer />
        <QuickViewModal />
      </StoreStateContext.Provider>
    </StoreActionsContext.Provider>
  );
}

// Full store (state + actions) — for components that need cart data. Re-renders
// on cart changes (which is expected for these consumers).
export function useStore() {
  const state = useContext(StoreStateContext);
  const actions = useContext(StoreActionsContext);
  if (!state || !actions) {
    throw new Error("useStore must be used within StoreProvider");
  }
  return { ...state, ...actions };
}

// Actions only — stable identity, so subscribing components do NOT re-render
// when the cart changes. Use this for add-to-cart buttons, product cards, etc.
export function useStoreActions() {
  const actions = useContext(StoreActionsContext);
  if (!actions) {
    throw new Error("useStoreActions must be used within StoreProvider");
  }
  return actions;
}
