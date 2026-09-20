"use client";

import type { ReactNode } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-sidebar";
import { usePlayer } from "@/components/player";
import { cn } from "@/lib/utils";

/**
 * App chrome: a fixed icon rail (never expands — labels are tooltips) + a top
 * bar, with the dotted background applied to the main content surface.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { audio } = usePlayer();
  return (
    // `open={false}` pins the rail collapsed. The mobile drawer is a separate
    // state (openMobile), so SidebarTrigger still works on small screens.
    <SidebarProvider open={false} onOpenChange={() => {}}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1 md:hidden" />
          <Separator orientation="vertical" className="mr-2 h-4 md:hidden" />
          <span className="text-sm font-medium text-muted-foreground">
            Siphon
          </span>
        </header>
        <main
          className={cn(
            "dot-grid-subtle flex-1 overflow-auto transition-[padding] duration-300",
            audio && "pb-20",
          )}
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
