"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { isSpamming } from "@/lib/easter-eggs";
import { useT } from "@/components/i18n-provider";

type ThemeChoice = "light" | "dark" | "system";

/**
 * Light / dark / system, persisted by next-themes in localStorage.
 *
 * `theme` is undefined until next-themes has read that storage on the client,
 * and we pass it straight through: the server and the first client render then
 * produce identical markup (no thumb yet), so there is no hydration mismatch
 * and no need to gate the whole control behind a "mounted" flag.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const flips = useRef<number[]>([]);

  // The disco class lives on <html>, outside React's tree — take it down when
  // the switcher goes away.
  useEffect(
    () => () => document.documentElement.classList.remove("disco"),
    [],
  );

  /**
   * The palette swaps instantly, and the thumb slides normally on top of it.
   *
   * Two richer approaches were tried and dropped. Transitioning colours on
   * every element stuttered on a busy page — hovers animate the same
   * properties, so the rule cannot be left on permanently either. The View
   * Transitions API fixed the stutter by cross-fading two snapshots on the
   * compositor, but a view-transition layer is always painted above the page
   * snapshot: the thumb ended up in front of the labels it was sliding
   * towards, and it could not be put back behind them.
   *
   * An instant swap has neither problem, never stutters whatever the page
   * holds, and leaves the thumb's own animation intact — which is the part
   * that actually reads as movement.
   */
  function change(next: ThemeChoice) {
    const root = document.documentElement;

    // Five flips in 2.5s turns the lights on; the next click turns them off.
    // The timestamps live in a ref, so nothing re-renders until it triggers.
    if (root.classList.contains("disco")) {
      root.classList.remove("disco");
      flips.current.length = 0;
    } else if (isSpamming(flips.current)) {
      root.classList.add("disco");
      flips.current.length = 0;
    }

    setTheme(next);
  }

  return (
    <Segmented<ThemeChoice>
      id="theme"
      ariaLabel={t.settings.theme.title}
      className={className}
      value={theme as ThemeChoice | undefined}
      onChange={change}
      options={[
        { value: "light", label: t.settings.theme.light, icon: Sun },
        { value: "dark", label: t.settings.theme.dark, icon: Moon },
        { value: "system", label: t.settings.theme.system, icon: Monitor },
      ]}
    />
  );
}
