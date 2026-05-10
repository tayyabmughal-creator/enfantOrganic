"use client";

import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import Icon from "@/components/icons/Icon";
import { useStore } from "@/components/store/cart/StoreProvider";
import {
  buildStorePath,
  normalizeLocale,
  normalizeRegion,
  replaceLocaleInPath,
  uiText,
} from "@/lib/storefront";

const BRAND_LOGO_SRC = "/enfant/enfant-logo.png";
const REGION_FLAGS = {
  ae: "🇦🇪",
  oman: "🇴🇲",
  om: "🇴🇲",
  sa: "🇸🇦",
  uae: "🇦🇪",
};

function HeaderInner({ locale, navigation }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { itemCount, openCart } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLocalePending, startLocaleTransition] = useTransition();
  const [isRegionPending, startRegionTransition] = useTransition();

  const t = uiText(locale);
  const region = normalizeRegion(searchParams.get("region") || navigation.current_region.code);
  const [optimisticLocale, setOptimisticLocale] = useState(locale);
  const [optimisticRegion, setOptimisticRegion] = useState(region);
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const activeLocale = normalizeLocale(optimisticLocale || locale);
  const activeRegionCode = normalizeRegion(optimisticRegion || region);
  const currentRegion = navigation.regions.find((item) => item.code === activeRegionCode) || navigation.current_region;
  const currentFlag = REGION_FLAGS[currentRegion?.code] || "🌿";
  const localeLabel = activeLocale === "ar" ? "AR" : "EN";
  const regionLabel = currentRegion?.currency_code || region.toUpperCase();

  useEffect(() => {
    setOptimisticLocale(locale);
  }, [locale]);

  useEffect(() => {
    setOptimisticRegion(region);
  }, [region]);

  const changeRegion = (nextRegion) => {
    const normalizedRegion = normalizeRegion(nextRegion);
    if (normalizedRegion === region) return;

    const updated = new URLSearchParams(params.toString());
    updated.set("region", normalizedRegion);
    setOptimisticRegion(normalizedRegion);
    startRegionTransition(() => {
      router.replace(`${pathname}?${updated.toString()}`, { scroll: false });
    });
  };

  const changeLocale = (nextLocale) => {
    const normalizedLocale = normalizeLocale(nextLocale);
    if (normalizedLocale === locale) return;

    const updated = new URLSearchParams(params.toString());
    updated.set("region", region);
    setOptimisticLocale(normalizedLocale);
    startLocaleTransition(() => {
      router.replace(`${replaceLocaleInPath(pathname, normalizedLocale)}?${updated.toString()}`, { scroll: false });
    });
  };

  return (
    <header className="site-header">
      <div className="announcement-bar">
        <div className="container announcement-bar-inner">
          <span>{navigation.settings.announcement}</span>
          <span className="announcement-shipping">
            {navigation.current_region.currency_code} {navigation.current_region.shipping_threshold}
          </span>
        </div>
      </div>

      <div className="container header-main">
        <Link href={buildStorePath(locale, "", region)} className="brand-mark">
          <img src={BRAND_LOGO_SRC} alt="Enfant Organics" className="brand-logo" />
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
                {navigation.menus.product_categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`${buildStorePath(locale, "/collections", region)}&category=${category.slug}`}
                    className="dropdown-link dropdown-link-media"
                  >
                    <span className="dropdown-link-thumb">
                      <img src={category.image} alt={category.name} loading="lazy" />
                    </span>
                    <span className="dropdown-link-copy">
                      <strong>{category.name}</strong>
                      <span>{category.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
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
                <a key={item.label} href={item.href} className="dropdown-link single">
                  <strong>{item.label}</strong>
                </a>
              ))}
            </div>
          </div>

          {navigation.settings.static_links.map((item) => (
            <a key={item.label} href={item.href} className="nav-link">
              {item.label}
            </a>
          ))}

          <Link href={buildStorePath(locale, "/track-order", region)} className="nav-link">
            {locale === "en" ? "Track Order" : "تتبع الطلب"}
          </Link>

          <div className="nav-mobile-footer">
            <label className="control-select language-select">
              <span className="visually-hidden">{t.language}</span>
              <span className="control-select-icon" aria-hidden="true">
                <Icon name="globe" size={15} />
              </span>
              <span className="control-select-value">{localeLabel}</span>
              <select value={activeLocale} onChange={(event) => changeLocale(event.target.value)}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
              <Icon name="chevronDown" size={13} className="control-select-chevron" />
            </label>
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
            <label className="control-select language-select">
              <span className="visually-hidden">{t.language}</span>
              <span className="control-select-icon" aria-hidden="true">
                <Icon name="globe" size={15} />
              </span>
              <span className="control-select-value">{localeLabel}</span>
              {isLocalePending ? <span className="control-select-dot" aria-hidden="true" /> : null}
              <select value={activeLocale} onChange={(event) => changeLocale(event.target.value)}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
              <Icon name="chevronDown" size={13} className="control-select-chevron" />
            </label>
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

          <button type="button" className="icon-link" aria-label={t.search} onClick={() => setSearchOpen(true)}>
            <Icon name="search" size={18} />
          </button>
          <a href={buildStorePath(locale, "/account", region)} className="icon-link" aria-label={locale === "ar" ? "حسابي" : "My Account"}>
            <Icon name="sparkle" size={18} />
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
            onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
            aria-label="Close search"
          />
          <div className="search-modal">
            <form
              className="search-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                  window.location.href = `${buildStorePath(locale, "/collections", region)}&search=${encodeURIComponent(searchQuery.trim())}`;
                }
              }}
            >
              <Icon name="search" size={20} className="search-modal-icon" />
              <input
                type="search"
                className="search-modal-input"
                placeholder={locale === "ar" ? "ابحث عن منتجات..." : "Search products..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="icon-link"
                onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </form>
          </div>
        </>
      ) : null}
    </header>
  );
}

export default function Header({ locale, navigation }) {
  return (
    <Suspense fallback={<header className="site-header" style={{ minHeight: "56px" }} />}>
      <HeaderInner locale={locale} navigation={navigation} />
    </Suspense>
  );
}
