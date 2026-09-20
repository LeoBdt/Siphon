"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useI18n } from "@/components/i18n-provider";
import { useAuthState } from "@/lib/hooks";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sub-navigation for the settings sections. Real routes rather than client
 * tabs: sections stay linkable, the back button works, each one mounts only its
 * own queries, and an admin-only section can later be gated server-side instead
 * of merely hidden.
 */
const SECTIONS = [
  { key: "general", href: "/settings/general" },
  { key: "downloads", href: "/settings/downloads" },
  { key: "storage", href: "/settings/storage" },
  { key: "engine", href: "/settings/engine" },
] as const;

/** Shown to administrators only; the route itself is guarded server-side. */
const ADMIN_SECTION = { key: "accounts", href: "/settings/accounts" } as const;

export function SettingsNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { data: auth } = useAuthState();
  const sections = auth?.user?.effective.isAdmin
    ? [...SECTIONS, ADMIN_SECTION]
    : SECTIONS;

  return (
    // Scrolls sideways rather than wrapping once more sections land; the
    // negative margin lets the scroll area bleed to the page gutter.
    <nav className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="inline-flex gap-1 rounded-xl border bg-muted/40 p-1">
        {sections.map((s) => {
          const active = pathname.startsWith(s.href);
          return (
            <Link
              key={s.key}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="settings-nav-thumb"
                  layoutDependency={pathname}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  className="absolute inset-0 rounded-lg border bg-background shadow-sm"
                />
              )}
              <span className="relative">{t.settings.sections[s.key]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
