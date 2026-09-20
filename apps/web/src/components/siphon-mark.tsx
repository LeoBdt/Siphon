/**
 * The Siphon mark: a tube that rises over a bend and empties downwards.
 * Stroke-based and `currentColor`, so it inherits size and color like a
 * lucide icon (`className="size-4"`).
 */
export function SiphonMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 17V9a6 6 0 0 1 12 0v10" />
      <path d="M14.5 15.5 18 19l3.5-3.5" />
    </svg>
  );
}
