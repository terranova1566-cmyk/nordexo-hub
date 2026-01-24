"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { defaultLocale, Locale, sourceStrings } from "@/lib/i18n/source";

type TranslationValues = Record<string, string>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  isLoading: boolean;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const interpolate = (template: string, vars?: Record<string, string | number>) => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key]);
    }
    return match;
  });
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [translations, setTranslations] = useState<TranslationValues>({});
  const [isLoading, setIsLoading] = useState(false);
  const cacheRef = useRef<Map<Locale, TranslationValues>>(new Map());

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  useEffect(() => {
    let isActive = true;
    const cached = cacheRef.current.get(locale);
    if (cached) {
      setTranslations(cached);
      setIsLoading(false);
      return;
    }
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/i18n?locale=${locale}`);
        if (!response.ok) {
          throw new Error("Failed to load translations.");
        }
        const payload = await response.json();
        const nextTranslations =
          (payload?.translations as TranslationValues | undefined) ?? {};
        if (!isActive) return;
        cacheRef.current.set(locale, nextTranslations);
        setTranslations(nextTranslations);
      } catch {
        if (!isActive) return;
        setTranslations({});
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    load();

    return () => {
      isActive = false;
    };
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const template = translations[key] ?? sourceStrings[key] ?? key;
      return interpolate(template, vars);
    },
    [translations]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      isLoading,
    }),
    [locale, setLocale, t, isLoading]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
};
