// Shared motion tokens — the JS-side counterpart of the `--ease-*` CSS custom
// properties in globals.css. Import these instead of hand-typing cubic-beziers
// so every Framer/Motion transition stays in sync with the CSS ones.
//
// Curves are Emil Kowalski's: strong ease-out for UI, iOS-like curve for drawers.

/** Strong ease-out for entrances/exits (mirrors CSS `--ease-out`). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** Strong ease-in-out for on-screen movement (mirrors CSS `--ease-in-out`). */
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
/** iOS-like drawer curve (mirrors CSS `--ease-drawer`). */
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** Duration budget (seconds). UI motion stays under 300ms. */
export const DUR = {
  press: 0.16,
  base: 0.2,
  panel: 0.25,
  drawer: 0.32,
} as const;

/** Apple-style spring for gesture/drag feedback. Keep bounce subtle. */
export const SPRING_SNAP = { type: "spring", stiffness: 500, damping: 30 } as const;
