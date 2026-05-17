"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getLocaleDir } from "@/lib/seo";
import { normalizeLocale } from "@/lib/storefront";

const LocaleContext = createContext({ locale: "en", setLocale: () => {} });

export function LocaleProvider({ initialLocale, children }) {
  const [locale, setLocaleState] = useState(normalizeLocale(initialLocale));

  // Keep context in sync after background navigation completes
  useEffect(() => {
    setLocaleState(normalizeLocale(initialLocale));
  }, [initialLocale]);

  function setLocale(nextLocale) {
    const normalized = normalizeLocale(nextLocale);
    if (normalized === locale) return;

    // 1. Instant re-render with new locale
    setLocaleState(normalized);

    // 2. Update <html> attributes immediately so [dir="rtl"] CSS fires
    if (typeof document !== "undefined") {
      document.documentElement.lang = normalized;
      document.documentElement.dir = getLocaleDir(normalized);
    }

    // 3. Persist preference across sessions
    try {
      document.cookie = `enfant-locale=${normalized}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // cookie blocked in some iframe contexts — not fatal
    }
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
