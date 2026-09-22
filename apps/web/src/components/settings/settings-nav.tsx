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
  key:
    | "profile"
    | "stats"
    | "security"
    | "appearance"
    | "downloads"
    | "storage"
    | "engine"
    | "users"
    | "groupsSection"
    | "invites"
    | "activity";
  href: string;
  /** What it takes to see it at all. Undefined means everyone. */
  needs?: keyof Permissions;
}

const GROUPS: { key: "mine" | "instance" | "accounts"; sections: Section[] }[] = [
  {
    key: "mine",
    sections: [
      { key: "profile", href: "/settings/profile" },
      { key: "stats", href: "/settings/stats" },
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
    ],
  },
  // Its own group rather than four tabs inside one page: with a list of
  // people, a list of groups, the outstanding invitations and an activity
  // log, each is a place you navigate to, not a view of the same thing.
  {
    key: "accounts",
    sections: [
      { key: "users", href: "/settings/users", needs: "isAdmin" },
      { key: "groupsSection", href: "/settings/groups", needs: "isAdmin" },
      { key: "invites", href: "/settings/invites", needs: "isAdmin" },
      { key: "activity", href: "/settings/activity", needs: "isAdmin" },
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
      {/* A surface of its own on the wide layout. Left transparent, the
          section names were grey text floating on the page background, with
          nothing to say where the navigation ended and the settings began. */}
      <div className="inline-flex gap-1 rounded-xl border bg-muted/40 p-1 md:flex md:w-full md:flex-col md:gap-4 md:rounded-2xl md:bg-card md:p-3">
        {groups.map((group) => (
          <div
            key={group.key}
            className="contents md:flex md:flex-col md:gap-1"
          >
            {/* The heading is for the wide layout only: in a single scrolling
                row it would read as another tab. Not uppercased — tiny grey
                capitals are the least legible label there is, and this one
                has to be read at a glance. */}
            <span className="hidden px-3 text-sm font-semibold text-foreground md:block">
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
                    // Full contrast for what is not selected too: these are
                    // the only names for the sections, not secondary text.
                    active
                      ? "text-primary"
                      : "text-foreground/75 hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      // One pill per group, not one for the whole navigation.
                      // A single shared id made it travel the full height on
                      // every change, sliding across the group headings on the
                      // way — which read as though those headings were
                      // themselves targets. Moving between groups is a jump,
                      // not a journey, so it now fades from one list to the
                      // other and only ever slides within a list.
                      layoutId={`settings-nav-thumb-${group.key}`}
                      layoutDependency={pathname}
                      transition={{ duration: 0.22, ease: EASE_OUT }}
                      // On the card surface a white pill no longer stands
                      // out, so the selected section is marked by the
                      // accent instead of by a raised background.
                      className="absolute inset-0 rounded-lg bg-primary/10 md:border-0 md:bg-primary/12"
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
