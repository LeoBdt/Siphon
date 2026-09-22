"use client";

import { cn } from "@/lib/utils";

/**
 * A checkbox that acknowledges being ticked.
 *
 * The native control cannot animate its own mark — the browser paints the tick
 * in one frame — so in a grid of a dozen permissions, clicking registered
 * nothing and the change was easy to miss. This keeps a real `<input>` for the
 * keyboard, the form and assistive technology, lays it over the drawing
 * transparently, and animates the box and the tick from it.
 *
 * The tick is drawn rather than faded: a stroke that runs from one end to the
 * other reads as *being* ticked, where an opacity fade reads as something
 * appearing.
 */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        // `peer`, so the two layers below can follow its state without any
        // JavaScript; transparent and on top, so it keeps every native
        // behaviour including the label click and the focus ring.
        className={cn(
          "peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
      <span
        className={cn(
          "size-4 rounded-[5px] border border-input bg-background",
          "transition-[background-color,border-color,transform] duration-150 ease-out",
          "peer-checked:border-primary peer-checked:bg-primary",
          // The press, which is the half of the feedback that arrives before
          // the state has even changed.
          "peer-active:scale-90",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50",
          "peer-disabled:opacity-50",
        )}
      />
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className={cn(
          "pointer-events-none absolute size-3.5 text-primary-foreground",
          // The dash is the length of the path, held fully offset until it is
          // checked, then run back to zero — so the tick draws itself.
          "[&>path]:[stroke-dasharray:16] [&>path]:[stroke-dashoffset:16]",
          "[&>path]:transition-[stroke-dashoffset] [&>path]:duration-200 [&>path]:ease-out",
          "peer-checked:[&>path]:[stroke-dashoffset:0]",
        )}
      >
        <path
          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
