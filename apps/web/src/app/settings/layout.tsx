"use client";

import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings/settings-nav";
import { useI18n } from "@/components/i18n-provider";
import { PAGE_COLUMN_WIDE, cn } from "@/lib/utils";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className={cn(PAGE_COLUMN_WIDE, "flex flex-col gap-6")}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.settings.title}
        </h1>
      </div>

      {/* Side by side once there is room for it: with seven sections in two
          groups, a horizontal strip would wrap or scroll past what it is
          navigating. */}
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <SettingsNav />
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
