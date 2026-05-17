"use client";

import { useEffect } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { getLocaleDir } from "@/lib/seo";

export default function LocaleHtmlAttributes() {
  const { locale } = useLocale();

  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = getLocaleDir(locale);
  }, [locale]);

  return null;
}
