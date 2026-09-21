"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";

export interface ModeTabOption<T extends string> {
  value: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Two or three exclusive choices, given the weight of a real decision.
 *
 * Extracted from the quality selector so the download form's other binary
 * choice — keep the file or hand it straight over — looks like the first one
 * instead of borrowing the smaller `Segmented` pill used for settings. They
 * sit a few centimetres apart in the same card and are the same kind of
 * choice, so they now share an implementation rather than a resemblance.
 *
 * `layoutId` must be unique per instance, hence `id`: two controls sharing one
 * would slide the indicator between them across the page.
 */
export function ModeTabs<T extends string>({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  id: string;
  value: T;
  onChange: (next: T) => void;
  options: ModeTabOption<T>[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid gap-1 rounded-xl border bg-muted/40 p-1",
        options.length === 3 ? "grid-cols-3" : "grid-cols-2",
        className,
      )}
    >
      {options.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={active}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`mode-tab-${id}`}
                // Without this, the shared indicator re-measures whenever
                // anything above it resizes (the URL preview opening) and
                // slides for no reason. Pinning it to the value means it only
                // animates on a real selection change.
                layoutDependency={value}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className="absolute inset-0 rounded-lg border bg-background shadow-sm"
              />
            )}
            <Icon className="relative size-3.5" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
