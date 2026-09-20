"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Segmented } from "@/components/ui/segmented";
import { isSpamming } from "@/lib/easter-eggs";
import { LOCALES, type Locale } from "@/lib/i18n";

const DIZZY_MS = 2500;

/**
 * Interface language. Deliberately free of any app state or session, so it can
 * also sit on the sign-in and first-run screens.
 *
 * Each option is labelled in its own language — "Français", not "French" — so
 * it reads correctly whichever locale is active.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t, setLocale } = useI18n();
  const [dizzy, setDizzy] = useState(false);
  // Timestamps live in a ref: nothing re-renders until the gag actually fires.
  const flips = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function change(next: Locale) {
    setLocale(next);
    if (dizzy || !isSpamming(flips.current)) return;
    // Flip back and forth enough and the control gives up on picking a side.
    flips.current.length = 0;
    setDizzy(true);
    timer.current = setTimeout(() => setDizzy(false), DIZZY_MS);
  }

  return (
    <Segmented<Locale>
      id="locale"
      ariaLabel={t.locale.label}
      className={className}
      value={locale}
      onChange={change}
      spin={dizzy}
      options={LOCALES.map((code) => ({
        value: code,
        // While dizzy, both options show the same muddled label.
        label: dizzy ? t.locale.dizzy : t.locale[code],
        lang: dizzy ? undefined : code,
      }))}
    />
  );
}
