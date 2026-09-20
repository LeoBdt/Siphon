"use client";

import { useMemo, useState } from "react";
import { Check, ListVideo, Search } from "lucide-react";
import type { VideoInfoEntry } from "@app/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";

export function PlaylistPicker({
  entries,
  selected,
  onChange,
}: {
  entries: VideoInfoEntry[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      query.trim()
        ? entries.filter((e) =>
            e.title.toLowerCase().includes(query.toLowerCase()),
          )
        : entries,
    [entries, query],
  );

  function toggle(url: string) {
    const next = new Set(selected);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    onChange(next);
  }
  const allSelected = selected.size === entries.length;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <ListVideo className="size-4" />
          {t.playlist.selected(selected.size, entries.length)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange(allSelected ? new Set() : new Set(entries.map((e) => e.url)))
          }
        >
          {allSelected ? t.playlist.clearAll : t.playlist.selectAll}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer les titres…"
          className="h-8 pl-8 text-sm"
        />
      </div>

      <ul className="max-h-64 overflow-auto">
        {filtered.map((e) => {
          const checked = selected.has(e.url);
          return (
            <li key={e.url}>
              <button
                type="button"
                onClick={() => toggle(e.url)}
                className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {checked && <Check className="size-3" />}
                </span>
                {e.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.thumbnailUrl}
                    alt=""
                    className="aspect-video h-8 shrink-0 rounded object-cover"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                {e.durationSeconds != null && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatDuration(e.durationSeconds)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
