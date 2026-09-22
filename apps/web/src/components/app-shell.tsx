"use client";

import type { ReactNode } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthGate } from "@/components/auth-gate";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/components/player";
import { cn } from "@/lib/utils";

/**
 * App chrome: a fixed icon rail (never expands — labels are tooltips) + a top
 * bar, with the dotted background applied to the main content surface.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { audio } = usePlayer();
  const pathname = usePathname();

  // Accepting an invitation happens before there is an account, and setting a
  // password again happens precisely when one cannot sign in — both get the
  // bare page rather than the application chrome and its auth gate.
  //
  // `/reset/` was missing here, so a recovery link asked the person to sign in
  // first: the one thing they had the link because they could not do.
  if (pathname.startsWith("/invite/") || pathname.startsWith("/reset/")) {
    return <>{children}</>;
  }
  return (
    // `open={false}` pins the rail collapsed. The mobile drawer is a separate
    // state (openMobile), so SidebarTrigger still works on small screens.
    <AuthGate>
      <SidebarProvider
        open={false}
        onOpenChange={() => {}}
        // A window-height column rather than the default `min-h-svh`. With a
        // minimum, the shell has no definite height: `main` never becomes the
        // scroller, the page scrolls instead, and the top bar — plus any pane
        // that scrolls its own body, like the file manager — rides away with
        // it. Fixing the height puts the scrolling back inside `main`.
        className="h-svh overflow-hidden"
      >
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1 md:hidden" />
          <Separator orientation="vertical" className="mr-2 h-4 md:hidden" />
          <span className="text-sm font-medium text-muted-foreground">
            Siphon
          </span>
        </header>
        <main
          className={cn(
            // `min-h-0`: a flex child defaults to its content's height, which
            // would push the column past the window and defeat the fixed
            // height above.
            "dot-grid-subtle min-h-0 flex-1 overflow-auto transition-[margin] duration-300",
            // A margin, not padding: the dotted background is painted over the
            // element's padding box, so reserving the player's height with
            // `pb-20` left a band of dots stranded above the bar. A margin
            // shrinks the surface instead, and the plain background of the
            // frame shows through underneath.
            audio && "mb-20",
          )}
        >
          {children}
        </main>
      </SidebarInset>
      </SidebarProvider>
    </AuthGate>
  );
}
