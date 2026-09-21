"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import type { Permissions } from "@app/shared";
import { useI18n } from "@/components/i18n-provider";
import { useAuthState } from "@/lib/hooks";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sub-navigation for the settings sections.
 *
 * Real routes rather than client tabs: sections stay linkable, the back button
 * works, and each one mounts only its own queries.
 *
 * Grouped by who a section concerns — your account, or the server — rather
 * than by subject. With permissions in play that grouping does the explaining
 * by itself: someone who may not touch the engine simply sees a shorter
 * "Instance" list, instead of finding cards greyed out with no reason given.
 */
interface Section {
  key: "profile" | "security" | "appearance" | "downloads" | "storage" | "engine" | "users";
  href: string;
  /** What it takes to see it at all. Undefined means everyone. */
  needs?: keyof Permissions;
}

const GROUPS: { key: "mine" | "instance"; sections: Section[] }[] = [
  {
    key: "mine",
    sections: [
      { key: "profile", href: "/settings/profile" },
      { key: "security", href: "/settings/security" },
      { key: "appearance", href: "/settings/appearance" },
    ],
  },
  {
    key: "instance",
    sections: [
      { key: "downloads", href: "/settings/downloads", needs: "canManageEngine" },
      { key: "storage", href: "/settings/storage", needs: "canManageSettings" },
      { key: "engine", href: "/settings/engine", needs: "canManageEngine" },
      { key: "users", href: "/settings/users", needs: "isAdmin" },
    ],
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { data: auth } = useAuthState();
  const permissions = auth?.user?.effective;

  const groups = GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter(
      (s) => !s.needs || Boolean(permissions?.[s.needs]),
    ),
  })).filter((group) => group.sections.length > 0);

  return (
    <nav
      className={cn(
        // A column beside the content on a wide screen, a scrolling strip
        // above it on a narrow one — where a vertical list would push the
        // settings themselves off the first screenful.
        "-mx-1 overflow-x-auto px-1 pb-1",
        "md:mx-0 md:w-52 md:shrink-0 md:overflow-visible md:px-0 md:pb-0",
      )}
    >
      <div className="inline-flex gap-1 rounded-xl border bg-muted/40 p-1 md:flex md:w-full md:flex-col md:gap-3 md:border-0 md:bg-transparent md:p-0">
        {groups.map((group) => (
          <div
            key={group.key}
            className="contents md:flex md:flex-col md:gap-0.5"
          >
            {/* The heading is for the wide layout only: in a single scrolling
                row it would read as another tab. */}
            <span className="hidden px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase md:block">
              {t.settings.groups[group.key]}
            </span>
            {group.sections.map((s) => {
              const active = pathname.startsWith(s.href);
              return (
                <Link
                  key={s.key}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out md:py-2",
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
        ))}
      </div>
    </nav>
  );
}
