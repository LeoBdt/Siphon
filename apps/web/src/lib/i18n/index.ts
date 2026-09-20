import { en, type Dictionary } from "./en";
import { fr } from "./fr";

export type Locale = "en" | "fr";
export type { Dictionary };

export const LOCALES: Locale[] = ["en", "fr"];
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie name, shared by the server layout and the client switcher. */
export const LOCALE_COOKIE = "siphon.locale";

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "fr";
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * BCP 47 tag for `Intl` and the `<html lang>` attribute. Kept separate from the
 * locale id so numbers and dates never render French-formatted in an English
 * interface (or the reverse).
 */
export function intlLocale(locale: Locale): string {
  return locale === "fr" ? "fr-FR" : "en-US";
}

/** Best match for an `Accept-Language` header, used on a first visit. */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  for (const part of acceptLanguage.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}
