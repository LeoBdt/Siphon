"use client";

import { motion } from "motion/react";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Language tag for the label, when it is written in its own language. */
  lang?: string;
}

/**
 * Radio group rendered as a segmented control, with the active thumb sliding
 * between options.
 *
 * `value` may be `undefined` for a control whose state is only known after
 * mount (the theme, read from localStorage): the thumb simply does not render
 * until then, which keeps the server and first client render identical.
 */
export function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  className,
  spin,
}: {
  /** Unique per instance — it namespaces the shared layout animation. */
  id: string;
  value: T | undefined;
  options: SegmentedOption<T>[];
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
  /** Roll the whole control once — used by the "stop poking me" gag. */
  spin?: boolean;
}) {
  return (
    <motion.div
      role="radiogroup"
      aria-label={ariaLabel}
      animate={spin ? { rotate: 360 } : { rotate: 0 }}
      transition={{ duration: spin ? 0.6 : 0, ease: EASE_OUT }}
      className={cn(
        "inline-flex gap-1 rounded-xl border bg-muted/40 p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            lang={opt.lang}
            onClick={() => onChange(opt.value)}
            className={cn(
              // min-w keeps the control the same size across languages, where
              // the same label can be noticeably longer.
              "relative flex min-w-24 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`segmented-${id}`}
                // Pinned to the value: without it the thumb re-measures
                // whenever anything above the control resizes, and slides for
                // no reason.
                layoutDependency={value}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className="absolute inset-0 rounded-lg border bg-background shadow-sm"
              />
            )}
            {Icon && <Icon className="relative size-3.5" />}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </motion.div>
  );
}
