"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { History, Search } from "lucide-react";
import type { DownloadStatus } from "@app/shared";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnimatePresence } from "motion/react";
import { JobCard } from "@/components/job-card";
import { useDownloads } from "@/lib/hooks";
import {
  JobScopeSelect,
  scopeFromKey,
  useJobAuthor,
  type ScopeKey,
} from "@/components/job-scope";
import { PAGE_COLUMN, cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";

const FILTERS = [
  "all",
  "downloading",
  "completed",
  "error",
  "canceled",
] as const;

const ACTIVE: DownloadStatus[] = [
  "queued",
  "fetching-info",
  "downloading",
  "processing",
];

/**
 * Wrapped in Suspense because `useSearchParams` opts the route out of static
 * rendering otherwise, which fails the build rather than degrading.
 */
export default function HistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryView />
    </Suspense>
  );
}

function HistoryView() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  // Arriving from the accounts page opens straight on that member's history,
  // which is the whole point of the button there.
  const [scope, setScope] = useState<ScopeKey>(params.get("user") ?? "all");
  const { data: jobs, isLoading } = useDownloads(scopeFromKey(scope));
  const nameOf = useJobAuthor();

  const filtered = useMemo(() => {
    let list = jobs ?? [];
    if (filter === "downloading") {
      list = list.filter((j) => ACTIVE.includes(j.status));
    } else if (filter !== "all") {
      list = list.filter((j) => j.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.title?.toLowerCase().includes(q) || j.url.toLowerCase().includes(q),
      );
    }
    return list;
  }, [jobs, filter, search]);

  return (
    <div className={cn(PAGE_COLUMN, "flex flex-col gap-6")}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.history.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.history.subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.history.search}
            className="h-9 pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v ?? "all")}>
          <SelectTrigger className="h-9 sm:w-40">
            {/* The label has to be spelled out: left to itself the control
                shows the raw value, which is why the selected filter stayed in
                English while the list was translated. */}
            <SelectValue>
              {(v: string) =>
                t.history.filters[v as (typeof FILTERS)[number]] ?? v
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f} value={f}>
                {t.history.filters[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <JobScopeSelect value={scope} onChange={setScope} className="h-9 sm:w-44" />
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {t.common.loading}
        </p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <History className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {jobs?.length ? t.history.noResults : t.history.empty}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {filtered.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                // Only when the list can hold more than one person's jobs.
                authorName={scope === "all" ? nameOf(job.userId) : null}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
