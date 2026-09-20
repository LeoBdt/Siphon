"use client";

import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings/settings-nav";
import { useI18n } from "@/components/i18n-provider";
import { PAGE_COLUMN, cn } from "@/lib/utils";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className={cn(PAGE_COLUMN, "flex flex-col gap-6")}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.settings.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.settings.subtitle}
        </p>
      </div>

      <SettingsNav />

      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
