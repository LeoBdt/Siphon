"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * A password field that can be read back.
 *
 * Nothing here asks for the password twice, so without this there is no way to
 * check what was typed before committing to it — and an account created with a
 * typo cannot be recovered, only deleted and invited again.
 *
 * The button is `tabIndex={-1}`: tabbing from the password field should reach
 * the submit button, not a toggle. It starts hidden, so a password is never on
 * screen by default.
 */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  autoFocus,
  className,
  containerClassName,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  className?: string;
  /**
   * Sizing for the field as a whole. Width belongs here rather than on the
   * input: the toggle is positioned against this box, so a narrower input
   * inside a full-width one left the eye stranded to its right.
   */
  containerClassName?: string;
  id?: string;
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const fallbackId = useId();

  return (
    <div className={cn("relative", containerClassName)}>
      <Input
        id={id ?? fallbackId}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? t.auth.hidePassword : t.auth.showPassword}
        title={shown ? t.auth.hidePassword : t.auth.showPassword}
        className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
