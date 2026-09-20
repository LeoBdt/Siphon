import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Tracks the viewport against the mobile breakpoint.
 *
 * `useSyncExternalStore` reads the media query directly instead of copying it
 * into state from an effect: no extra render on mount, no flash of the desktop
 * layout, and the server render is given an explicit value.
 */
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // Server snapshot: assume desktop, which matches the sidebar's default.
    () => false,
  )
}
