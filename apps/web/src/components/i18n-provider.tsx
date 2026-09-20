"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  LOCALE_COOKIE,
  getDictionary,
  intlLocale,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";

interface I18nValue {
  locale: Locale;
  /** The active dictionary. Access strings as `t.settings.title`. */
  t: Dictionary;
  /** BCP 47 tag for `Intl` formatters. */
  intl: string;
  setLocale: (next: Locale) => void;
  /**
   * Message to show for a thrown error. An `ApiError` carrying a known code is
   * rendered in the active language; anything else falls back to its own text.
   */
  errorMessage: (e: unknown) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Shorthand for components that only need the strings. */
export function useT(): Dictionary {
  return useI18n().t;
}

/**
 * The locale comes from the server (cookie), so the very first paint is already
 * in the right language — no flash, no hydration mismatch. Switching writes the
 * cookie and refreshes, which re-renders server components in the new locale.
 */
export function I18nProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  // Mirrored in client state so the switch is instant; the refresh below then
  // brings the server tree (and `<html lang>`) in line.
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      // A year, path-wide, Lax: readable by the server layout on every request
      // and independent from the session cookie, so the language can be chosen
      // before signing in.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    },
    [router],
  );

  const t = getDictionary(locale);
  const errorMessage = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code && e.code in t.apiErrors) {
        return t.apiErrors[e.code];
      }
      if (e instanceof Error && e.message) return e.message;
      return t.common.error;
    },
    [t],
  );

  return (
    <I18nContext.Provider
      value={{
        locale,
        t,
        intl: intlLocale(locale),
        setLocale,
        errorMessage,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}
