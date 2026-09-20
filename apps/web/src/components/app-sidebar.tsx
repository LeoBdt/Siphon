"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, Folder, History, Settings } from "lucide-react";
import { SiphonMark } from "@/components/siphon-mark";
import { useT } from "@/components/i18n-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { key: "download", href: "/", icon: Download },
  { key: "files", href: "/files", icon: Folder },
  { key: "history", href: "/history", icon: History },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/** Shared look for the rail tiles: a bordered square that never expands. */
const TILE =
  "group-data-[collapsible=icon]:size-9! justify-center rounded-xl border border-sidebar-border bg-sidebar transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.94] hover:border-foreground/20 hover:bg-sidebar-accent data-active:border-primary/40 data-active:bg-primary/10 data-active:text-primary";

export function AppSidebar() {
  const pathname = usePathname();
  const t = useT();

  return (
    // A fixed icon rail: no hover expansion, labels live in the tooltips.
    <Sidebar collapsible="icon">
      <SidebarHeader className="items-center">
        <Link
          href="/"
          aria-label={t.nav.home}
          className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.94]"
        >
          <SiphonMark className="size-4" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="items-center gap-1.5">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={{
                        children: t.nav[item.key],
                        sideOffset: 10,
                        className: "px-2.5 py-1.5 font-medium shadow-lg",
                      }}
                      className={TILE}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span className="sr-only">{t.nav[item.key]}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="items-center">
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {VERSION}
        </span>
      </SidebarFooter>
    </Sidebar>
  );
}
