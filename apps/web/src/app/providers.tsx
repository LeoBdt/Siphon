"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { WsProvider } from "@/components/ws-provider";
import { PlayerProvider } from "@/components/player";
import { I18nProvider } from "@/components/i18n-provider";
import type { Locale } from "@/lib/i18n";

export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    // `class` strategy: globals.css defines the dark palette under `.dark`.
    // Without this provider the app was stuck in light while Sonner, which
    // reads next-themes directly, followed the OS — hence dark toasts on a
    // light interface.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <I18nProvider locale={locale}>
        <QueryClientProvider client={queryClient}>
          <WsProvider>
            {/*
              Short, because in this app a tooltip is often the only label
              there is: the sidebar is an icon rail, and its names live in
              these. A delay that suits a hint on an already-labelled control
              makes navigation feel unresponsive. `closeDelay` keeps the label
              alive while the pointer travels between two tiles, so moving
              down the rail does not flash it off and on.
            */}
            <TooltipProvider delay={60} closeDelay={80}>
              <PlayerProvider>{children}</PlayerProvider>
            </TooltipProvider>
          </WsProvider>
          {/*
            No `richColors`: the saturated green/red toasts fought with the
            palette. The per-type icons already carry the meaning.
          */}
          <Toaster position="bottom-right" />
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
