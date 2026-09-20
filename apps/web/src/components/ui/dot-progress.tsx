"use client";

import { ComponentProps, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type DotProgressProps = {
  /** Progress from 0 to 1 (ignored when `indeterminate`). */
  progress?: number;
  /** Boucle une onde qui pulse du centre (pour un chargement sans %). */
  indeterminate?: boolean;
  columns?: number;
  rows?: number;
  dotClassName?: string;
  activeDotClassName?: string;
} & ComponentProps<"div">;

/**
 * Dot loader anchored at the center.
 * - determinate: dots up to `progress` light up cumulatively (concentric order).
 * - indeterminate: a ring emanates from the center outward on a loop — the
 *   wavefront travels out and leaves the grid, then restarts (for "analyzing…").
 *   It does NOT fill up then clear; only the moving ring is lit.
 */
export function DotProgress({
  progress = 0,
  indeterminate = false,
  columns = 7,
  rows = 7,
  className,
  dotClassName,
  activeDotClassName,
  ...props
}: DotProgressProps) {
  const total = columns * rows;

  const { rankByIndex, distByIndex } = useMemo(() => {
    const cx = (columns - 1) / 2;
    const cy = (rows - 1) / 2;
    const cells = Array.from({ length: total }, (_, i) => {
      const x = i % columns;
      const y = Math.floor(i / columns);
      return { i, dist: Math.hypot(x - cx, y - cy) };
    });
    const ordered = [...cells].sort((a, b) => a.dist - b.dist);
    const rank = new Array<number>(total);
    ordered.forEach((c, r) => (rank[c.i] = r));
    const maxDist = Math.max(...cells.map((c) => c.dist)) || 1;
    return {
      rankByIndex: rank,
      distByIndex: cells.map((c) => c.dist / maxDist),
    };
  }, [columns, rows, total]);

  // Animated wavefront position for the indeterminate mode.
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!indeterminate) return;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      // 0 → 1.3 loop so the wave finishes leaving the grid before restarting.
      setPhase((((t - start) / 1300) % 1) * 1.3);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [indeterminate]);

  const clamped = Math.min(1, Math.max(0, progress));
  const activeCount = Math.round(clamped * total);
  // Indeterminate: a ring at radius `phase` travels from the center outward and
  // off the grid, then loops — only dots near the wavefront light up (no fill).
  const BAND = 0.18;

  return (
    <div
      {...props}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("grid w-fit gap-0.5", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const dist = distByIndex[i]!;
        const active = indeterminate
          ? Math.abs(dist - phase) <= BAND
          : rankByIndex[i]! < activeCount;
        return (
          <div
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-sm bg-muted-foreground/20 transition-colors duration-300 ease-out",
              dotClassName,
              active && "bg-primary",
              active && activeDotClassName,
            )}
            style={
              indeterminate
                ? undefined
                : { transitionDelay: `${dist * 120}ms` }
            }
          />
        );
      })}
    </div>
  );
}
