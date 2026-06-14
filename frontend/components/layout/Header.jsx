"use client";

import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import { useLocale } from "@/contexts/LocaleContext";
import {
  buildStorePath,
  normalizeLocale,
  normalizeRegion,
  replaceLocaleInPath,
  uiText,
} from "@/lib/storefront";
import { resolveNavigationHref } from "@/lib/navigationLinks";
import { saveSelectedRegion } from "@/lib/regionResolver";
import { pushDataLayerEvent } from "@/lib/analytics";
import { API_BASE_URL as CONFIG_API_BASE_URL } from "@/lib/config";

const DEFAULT_LOGO_SRC = "/enfant/enfant-logo.png";
const API_BASE_URL = CONFIG_API_BASE_URL;
const REGION_FLAGS = {
  ae: "🇦🇪",
  oman: "🇴🇲",
  om: "🇴🇲",
  sa: "🇸🇦",
  uae: "🇦🇪",
};

function HeaderInner({ navigation }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { itemCount, openCart, refreshCartPricing } = useStore();
  const { locale, setLocale } = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [, startLocaleTransition] = useTransition();
  const [isRegionPending, startRegionTransition] = useTransition();

  const t = uiText(locale);
  const region = normalizeRegion(searchParams.get("region") || navigation.current_region.code);
  const [optimisticRegion, setOptimisticRegion] = useState(region);
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const activeLocale = locale;
  const activeRegionCode = normalizeRegion(optimisticRegion || region);
  const currentRegion = navigation.regions.find((item) => item.code === activeRegionCode) || navigation.current_region;
  const currentFlag = REGION_FLAGS[currentRegion?.code] || "🌿";
  const localeLabel = locale === "ar" ? "AR" : "EN";
  const regionLabel = currentRegion?.currency_code || region.toUpperCase();
  const searchUiText =
    locale === "ar"
      ? {
          placeholder: "ابحث عن منتجات...",
          loading: "جارٍ البحث...",
          noResults: "لا توجد نتائج مطابقة",
          error: "تعذر تحميل اقتراحات البحث",
          submitToCatalog: "عرض كل النتائج",
        }
      : {
          placeholder: "Search products...",
          loading: "Searching...",
          noResults: "No matching products found",
          error: "Unable to load suggestions",
          submitToCatalog: "View all results",
        };

  useEffect(() => {
    setOptimisticRegion(region);
  }, [region]);

  useEffect(() => {
    const urlRegion = searchParams.get("region");
    if (urlRegion) {
      saveSelectedRegion(urlRegion);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!searchOpen) {
      setSearchSuggestions([]);
      setIsSearchLoading(false);
      setSearchError("");
      return;
    }

    const term = searchQuery.trim();
    if (term.length < 2) {
      setSearchSuggestions([]);
      setIsSearchLoading(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    const delay = setTimeout(async () => {
      setIsSearchLoading(true);
      setSearchError("");
      try {
        const params = new URLSearchParams({
          locale,
          region,
          q: term,
        });
        const response = await fetch(`${API_BASE_URL}/search/suggestions/?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Suggestion request failed (${response.status})`);
        }
        const data = await response.json();
        setSearchSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch (error) {
        if (error?.name !== "AbortError") {
          setSearchSuggestions([]);
          setSearchError(searchUiText.error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchLoading(false);
        }
      }
    }, 220);

    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [locale, region, searchOpen, searchQuery, searchUiText.error]);

  const closeSearchModal = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchSuggestions([]);
    setIsSearchLoading(false);
    setSearchError("");
  };

  const changeRegion = (nextRegion) => {
    const normalizedRegion = normalizeRegion(nextRegion);
    if (normalizedRegion === region) return;

    const updated = new URLSearchParams(params.toString());
    updated.set("region", normalizedRegion);
    saveSelectedRegion(normalizedRegion);
    setOptimisticRegion(normalizedRegion);
    void refreshCartPricing(locale, normalizedRegion);
    startRegionTransition(() => {
      router.replace(`${pathname}?${updated.toString()}`, { scroll: false });
      router.refresh();
    });
  };

  const changeLocale = (nextLocale) => {
    const normalizedLocale = normalizeLocale(nextLocale);
    if (normalizedLocale === locale) return;

    // 1. Instant: client-side UI (header, cart, html.dir) updates from context.
    setLocale(normalizedLocale);

    // 2. Background: soft-navigate so server-rendered content (footer, page
    //    body, product names from the API) re-renders in the new locale.
    //    useTransition keeps the existing UI on screen during the fetch —
    //    no blank screen, no scroll jump.
    const updated = new URLSearchParams(params.toString());
    updated.set("region", region);
    startLocaleTransition(() => {
      router.replace(
        `${replaceLocaleInPath(pathname, normalizedLocale)}?${updated.toString()}`,
        { scroll: false },
      );
    });
  };

  return (
    <header className="site-header">
      <div className="announcement-bar">
        <div className="announcement-marquee">
          <div className={`announcement-reel${locale === "ar" ? " is-rtl" : ""}`}>
            {[0, 1].map((i) => (
              <span key={i} className="announcement-copy" aria-hidden={i > 0 ? "true" : undefined}>
                {navigation.settings.announcement}
                <span className="announcement-sep" aria-hidden="true">·</span>
                <strong>{navigation.current_region.currency_code}&nbsp;{navigation.current_region.shipping_threshold}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="container header-main">
        <Link href={buildStorePath(locale, "", region)} className="brand-mark">
          <img src={navigation?.settings?.logo_url || DEFAULT_LOGO_SRC} alt={navigation?.settings?.brand_name || "Enfant Organics"} className="brand-logo" />
          <span className="brand-copy">
            <strong>ENFANT ORGANICS</strong>
            <small>{locale === "en" ? "Pure • Gentle • Safe" : "نقي • لطيف • آمن"}</small>
          </span>
        </Link>

        <nav className={`header-nav ${mobileOpen ? "is-open" : ""}`}>
          <div
            className="nav-group"
            onMouseEnter={() => setOpenDropdown("products")}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button
              type="button"
              className="nav-trigger"
              onClick={() => setOpenDropdown((value) => (value === "products" ? null : "products"))}
            >
              {t.products}
              <Icon name="chevronDown" size={16} />
            </button>
            <div className={`nav-dropdown ${openDropdown === "products" ? "is-visible" : ""}`}>
              <div className="dropdown-grid">
                {navigation.menus.product_categories
                  .filter((category) => category.product_count === null || category.product_count > 0)
                  .map((category) => (
                    <Link
                      key={category.slug}
                      href={`${buildStorePath(locale, "/collections", region)}&category=${category.slug}`}
                      className="dropdown-link dropdown-link-media"
                      onClick={() => setOpenDropdown(null)}
                    >
                      <span className="dropdown-link-thumb">
                        <img src={category.image} alt={category.name} loading="lazy" />
                      </span>
                      <span className="dropdown-link-copy">
                        <strong>{category.name}</strong>
                        {category.product_count ? (
                          <span>
                            {category.product_count}{" "}
                            {locale === "ar"
                              ? "منتج"
                              : category.product_count === 1
                                ? "product"
                                : "products"}
                          </span>
                        ) : null}
                      </span>
                      <Icon name="chevronRight" size={15} className="dropdown-link-arrow" />
                    </Link>
                  ))}
              </div>
              <Link
                href={buildStorePath(locale, "/collections", region)}
                className="dropdown-view-all"
                onClick={() => setOpenDropdown(null)}
              >
                {locale === "ar" ? "عرض كل المنتجات" : "View all products"}
                <Icon name="chevronRight" size={15} />
              </Link>
            </div>
          </div>

          <div
            className="nav-group"
            onMouseEnter={() => setOpenDropdown("why")}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <button
              type="button"
              className="nav-trigger"
              onClick={() => setOpenDropdown((value) => (value === "why" ? null : "why"))}
            >
              {t.whyChooseUs}
              <Icon name="chevronDown" size={16} />
            </button>
            <div className={`nav-dropdown nav-dropdown-sm ${openDropdown === "why" ? "is-visible" : ""}`}>
              {navigation.menus.why_choose_us.map((item) => (
                <a
                  key={item.label}
                  href={resolveNavigationHref(item.href, { locale, region: activeRegionCode })}
                  className="dropdown-link single"
                >
                  <strong>{item.label}</strong>
                </a>
              ))}
            </div>
          </div>

          {navigation.settings.static_links.map((item) => (
            <a
              key={item.label}
              href={resolveNavigationHref(item.href, { locale, region: activeRegionCode })}
              className="nav-link"
            >
              {item.label}
            </a>
          ))}

          <Link href={buildStorePath(locale, "/track-order", region)} className="nav-link">
            {locale === "en" ? "Track Order" : "تتبع الطلب"}
          </Link>

          <div className="nav-mobile-footer">
            <label className="control-select region-select">
              <span className="visually-hidden">{t.region}</span>
              <span className="control-select-flag" aria-hidden="true">{currentFlag}</span>
              <span className="control-select-value">{regionLabel}</span>
              <select value={activeRegionCode} onChange={(event) => changeRegion(event.target.value)}>
                {navigation.regions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {REGION_FLAGS[item.code] ? `${REGION_FLAGS[item.code]} ` : ""}{item.name} · {item.currency_code}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={13} className="control-select-chevron" />
            </label>
          </div>
        </nav>

        <div className="header-controls">
          <div className="header-switchers">
            <button
              type="button"
              className="lang-toggle-btn"
              onClick={() => changeLocale(locale === "ar" ? "en" : "ar")}
              aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}
            >
              <Icon name="globe" size={15} className="lang-toggle-icon" />
              <span>{locale === "ar" ? "EN" : "AR"}</span>
            </button>
            <label className="control-select region-select">
              <span className="visually-hidden">{t.region}</span>
              <span className="control-select-flag" aria-hidden="true">{currentFlag}</span>
              <span className="control-select-value">{regionLabel}</span>
              {isRegionPending ? <span className="control-select-dot" aria-hidden="true" /> : null}
              <select value={activeRegionCode} onChange={(event) => changeRegion(event.target.value)}>
                {navigation.regions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {REGION_FLAGS[item.code] ? `${REGION_FLAGS[item.code]} ` : ""}{item.name} · {item.currency_code}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={13} className="control-select-chevron" />
            </label>
          </div>

          {/* Mobile-only: locale toggle shown directly in the nav bar */}
          <button
            type="button"
            className="lang-toggle-btn mobile-lang-toggle"
            onClick={() => changeLocale(locale === "ar" ? "en" : "ar")}
            aria-label={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}
          >
            <Icon name="globe" size={14} className="lang-toggle-icon" />
            <span>{locale === "ar" ? "EN" : "AR"}</span>
          </button>
          <label className="control-select region-select mobile-region-select">
            <span className="visually-hidden">{t.region}</span>
            <span className="control-select-flag" aria-hidden="true">{currentFlag}</span>
            <span className="control-select-value">{regionLabel}</span>
            {isRegionPending ? <span className="control-select-dot" aria-hidden="true" /> : null}
            <select value={activeRegionCode} onChange={(event) => changeRegion(event.target.value)}>
              {navigation.regions.map((item) => (
                <option key={item.code} value={item.code}>
                  {REGION_FLAGS[item.code] ? `${REGION_FLAGS[item.code]} ` : ""}{item.name} · {item.currency_code}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={12} className="control-select-chevron" />
          </label>

          <button type="button" className="icon-link" aria-label={t.search} onClick={() => setSearchOpen(true)}>
            <Icon name="search" size={18} />
          </button>
          <a href={buildStorePath(locale, "/account", region)} className="icon-link" aria-label={locale === "ar" ? "حسابي" : "My Account"}>
            <Icon name="user" size={18} />
          </a>
          <button type="button" className="icon-link cart-link" aria-label={t.cart} onClick={openCart}>
            <Icon name="cart" size={18} />
            {itemCount > 0 ? <span className="cart-badge">{itemCount}</span> : null}
          </button>
          <button
            type="button"
            className="icon-link mobile-menu-button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Toggle menu"
          >
            <Icon name={mobileOpen ? "close" : "menu"} size={18} />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <>
          <button
            type="button"
            className="overlay is-open"
            onClick={closeSearchModal}
            aria-label="Close search"
          />
          <div className="search-modal">
            <div className="search-modal-content">
              <form
                className="search-modal-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const term = searchQuery.trim();
                  if (term) {
                    pushDataLayerEvent("search", {
                      search_term: term,
                      locale,
                      region,
                    });
                    closeSearchModal();
                    router.push(
                      `${buildStorePath(locale, "/collections", region)}&search=${encodeURIComponent(term)}`,
                    );
                  }
                }}
              >
                <Icon name="search" size={20} className="search-modal-icon" />
                <input
                  type="search"
                  className="search-modal-input"
                  placeholder={searchUiText.placeholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="icon-link"
                  onClick={closeSearchModal}
                  aria-label="Close"
                >
                  <Icon name="close" size={18} />
                </button>
              </form>

              {searchQuery.trim().length >= 2 ? (
                <div className="search-suggestions-panel" role="listbox" aria-live="polite">
                  {isSearchLoading ? (
                    <p className="search-suggestions-message">{searchUiText.loading}</p>
                  ) : null}
                  {!isSearchLoading && searchError ? (
                    <p className="search-suggestions-message">{searchError}</p>
                  ) : null}
                  {!isSearchLoading && !searchError && !searchSuggestions.length ? (
                    <p className="search-suggestions-message">{searchUiText.noResults}</p>
                  ) : null}
                  {!isSearchLoading && !searchError && searchSuggestions.length ? (
                    <ul className="search-suggestions-list">
                      {searchSuggestions.map((suggestion) => {
                        const to = buildStorePath(locale, `/product/${suggestion.slug}`, region);
                        const numericPrice = Number(suggestion.price);
                        const priceLabel =
                          Number.isFinite(numericPrice)
                            ? `${suggestion.currency_code || ""} ${numericPrice.toFixed(2)}`
                            : "";
                        return (
                          <li key={suggestion.slug}>
                            <button
                              type="button"
                              className="search-suggestion-item"
                              onClick={() => {
                                closeSearchModal();
                                router.push(to);
                              }}
                            >
                              <img src={suggestion.image} alt="" aria-hidden="true" />
                              <span className="search-suggestion-copy">
                                <strong>{suggestion.name}</strong>
                                <small>{suggestion.category}</small>
                              </span>
                              {priceLabel ? <span className="search-suggestion-price">{priceLabel}</span> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  <button type="button" className="search-suggestions-submit" onClick={() => {
                    const term = searchQuery.trim();
                    if (!term) return;
                    pushDataLayerEvent("search", {
                      search_term: term,
                      locale,
                      region,
                    });
                    closeSearchModal();
                    router.push(
                      `${buildStorePath(locale, "/collections", region)}&search=${encodeURIComponent(term)}`,
                    );
                  }}>
                    {searchUiText.submitToCatalog}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}

export default function Header({ navigation }) {
  return (
    <Suspense fallback={<header className="site-header" style={{ minHeight: "56px" }} />}>
      <HeaderInner navigation={navigation} />
    </Suspense>
  );
}
