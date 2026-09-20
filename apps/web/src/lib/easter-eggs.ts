/**
 * Small, self-contained jokes. Kept together so they are easy to find — and
 * easy to remove — rather than scattered through the components.
 */

/** The one video everyone recognises by its id alone. */
const RICK_ID = "dQw4w9WgXcQ";

export function isRickRoll(url: string): boolean {
  return url.includes(RICK_ID);
}

/**
 * Counts events inside a sliding window, for the "spam a control" gags.
 *
 * Callers keep the timestamps in a ref, so nothing re-renders until the
 * threshold is actually reached.
 */
export function isSpamming(
  stamps: number[],
  { times = 5, withinMs = 2500 } = {},
): boolean {
  const now = Date.now();
  stamps.push(now);
  // Drop anything that fell out of the window; the array stays tiny.
  while (stamps.length && now - stamps[0] > withinMs) stamps.shift();
  return stamps.length >= times;
}
