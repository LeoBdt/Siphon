"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Music, SlidersHorizontal, Video } from "lucide-react";
import {
  QUALITY_PRESETS,
  type AdvancedFormat,
  type QualityPresetId,
} from "@app/shared";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { useT } from "@/components/i18n-provider";
import { ModeTabs } from "@/components/ui/mode-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Only the "auto" entries are translated — the rest are numbers and units
// that read the same in every locale.
const RESOLUTIONS = ["auto", "2160", "1440", "1080", "720", "480", "360"];
const RESOLUTION_LABELS: Record<string, string> = {
  "2160": "4K · 2160p",
  "1440": "1440p",
  "1080": "1080p",
  "720": "720p",
  "480": "480p",
  "360": "360p",
};
const FPS = ["auto", "60", "30"];
const FPS_LABELS: Record<string, string> = { "60": "60 fps", "30": "30 fps" };

const VIDEO = QUALITY_PRESETS.filter((p) => p.kind === "video");
const AUDIO = QUALITY_PRESETS.filter((p) => p.kind === "audio");

/** Preset selected when the user switches mode. */
const DEFAULT_PRESET = { video: "best", audio: "audio-m4a" } as const;

export function QualitySelector({
  preset,
  advanced,
  onPreset,
  onAdvanced,
}: {
  preset: QualityPresetId;
  advanced: AdvancedFormat | null;
  onPreset: (p: QualityPresetId) => void;
  onAdvanced: (a: AdvancedFormat | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const current = QUALITY_PRESETS.find((p) => p.id === preset);
  const mode: "video" | "audio" = current?.kind === "audio" ? "audio" : "video";
  const options = mode === "audio" ? AUDIO : VIDEO;

  function setMode(next: "video" | "audio") {
    if (next === mode) return;
    if (next === "video") onPreset(DEFAULT_PRESET.video);
    else {
      // Resolution/fps caps are meaningless without a video track.
      onAdvanced(null);
      setOpen(false);
      onPreset(DEFAULT_PRESET.audio);
    }
  }

  function setRes(v: string | null) {
    const maxHeight = v && v !== "auto" ? Number(v) : null;
    const next: AdvancedFormat = { maxHeight, maxFps: advanced?.maxFps ?? null };
    onAdvanced(next.maxHeight == null && next.maxFps == null ? null : next);
  }
  function setFps(v: string | null) {
    const maxFps = v && v !== "auto" ? Number(v) : null;
    const next: AdvancedFormat = {
      maxHeight: advanced?.maxHeight ?? null,
      maxFps,
    };
    onAdvanced(next.maxHeight == null && next.maxFps == null ? null : next);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Mode — the two are exclusive: a video download always embeds its audio. */}
      <ModeTabs<"video" | "audio">
        id="quality-mode"
        value={mode}
        onChange={setMode}
        ariaLabel={t.quality.modeVideo}
        options={[
          { value: "video", label: t.quality.modeVideo, icon: Video },
          { value: "audio", label: t.quality.modeAudio, icon: Music },
        ]}
      />

      {/* Presets of the active mode */}
      <div className="flex flex-wrap gap-1.5">
        {options.map((p) => (
          <Pill
            key={p.id}
            active={preset === p.id}
            label={t.quality.presets[p.id].label}
            onClick={() => onPreset(p.id)}
          />
        ))}
      </div>

      {/* What the selection actually does — visible, not hidden in a tooltip. */}
      <p
        key={preset}
        className="animate-in fade-in-0 text-xs leading-relaxed text-muted-foreground duration-200"
      >
        {current ? t.quality.presets[current.id].description : null}
        {mode === "video" && (
          <>
            {" · "}
            <span className="text-foreground/70">{t.quality.videoNote}</span>
          </>
        )}
      </p>

      {/* Advanced (video only) */}
      {mode === "video" && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <SlidersHorizontal className="size-3.5" />
            {t.quality.advanced}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-200 ease-out",
                open && "rotate-180",
              )}
            />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                  <label className="flex flex-col gap-1.5 text-xs font-medium">
                    {t.quality.maxResolution}
                    <Select
                      value={
                        advanced?.maxHeight ? String(advanced.maxHeight) : "auto"
                      }
                      onValueChange={setRes}
                    >
                      <SelectTrigger className="h-8 w-full">
                        {/* Spelled out: left to itself the control shows the
                            raw value, so "auto" leaked through untranslated. */}
                        <SelectValue>
                          {(v: string) => RESOLUTION_LABELS[v] ?? t.quality.autoMax}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {RESOLUTIONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {RESOLUTION_LABELS[r] ?? t.quality.autoMax}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-medium">
                    {t.quality.fps}
                    <Select
                      value={advanced?.maxFps ? String(advanced.maxFps) : "auto"}
                      onValueChange={setFps}
                    >
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue>
                          {(v: string) => FPS_LABELS[v] ?? t.quality.auto}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {FPS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {FPS_LABELS[f] ?? t.quality.auto}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Pill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-150 ease-out active:scale-[0.96]",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-foreground hover:border-foreground/25 hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
