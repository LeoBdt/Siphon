"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Maximize2,
  Music2,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { streamUrl } from "@/lib/api";
import { useT } from "@/components/i18n-provider";
import { formatDuration } from "@/lib/format";
import { EASE_DRAWER } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export interface MediaItem {
  path: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Volume, shared by both players and remembered across sessions
// ---------------------------------------------------------------------------

const VOLUME_KEY = "player:volume";

function readStoredVolume(): number {
  if (typeof window === "undefined") return 1;
  const raw = Number(window.localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
}

/**
 * Volume state for a media element. `muted` is modelled as volume 0 with the
 * previous level remembered, so un-muting restores where the user left off.
 */
function useVolume(ref: React.RefObject<HTMLMediaElement | null>) {
  const [volume, setVolumeState] = useState(1);
  const lastAudible = useRef(1);

  // Read from storage on mount only: the server render has no localStorage, so
  // the stored level can only be adopted once we are on the client.
  useEffect(() => {
    const v = readStoredVolume();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVolumeState(v);
    if (v > 0) lastAudible.current = v;
  }, []);

  // Keep the element in sync, including when it is (re)mounted with a new src.
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume, ref]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    if (clamped > 0) lastAudible.current = clamped;
    try {
      window.localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      // Private mode / storage disabled: volume just won't persist.
    }
  }, []);

  const toggleMute = useCallback(() => {
    setVolume(volume > 0 ? 0 : lastAudible.current || 1);
  }, [volume, setVolume]);

  return { volume, setVolume, toggleMute };
}

function VolumeControl({
  volume,
  setVolume,
  toggleMute,
}: ReturnType<typeof useVolume>) {
  const t = useT();
  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const pct = Math.round(volume * 100);

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={toggleMute}
        aria-label={volume === 0 ? t.player.unmute : t.player.mute}
        title={volume === 0 ? t.player.unmute : t.player.volumeAt(pct)}
      >
        <Icon className="size-4" />
      </Button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label={t.player.volume}
        className="h-1 w-16 cursor-pointer accent-primary sm:w-24"
      />
    </div>
  );
}

interface PlayerContextValue {
  audio: MediaItem | null;
  video: MediaItem | null;
  playAudio: (item: MediaItem) => void;
  playVideo: (item: MediaItem) => void;
  closeAudio: () => void;
  closeVideo: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [audio, setAudio] = useState<MediaItem | null>(null);
  const [video, setVideo] = useState<MediaItem | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  function playAudio(item: MediaItem) {
    setAudio(item);
  }
  function playVideo(item: MediaItem) {
    audioRef.current?.pause(); // never two sounds at once
    setVideo(item);
  }

  return (
    <PlayerContext.Provider
      value={{
        audio,
        video,
        playAudio,
        playVideo,
        closeAudio: () => setAudio(null),
        closeVideo: () => setVideo(null),
      }}
    >
      {children}
      <AudioBar audioRef={audioRef} item={audio} onClose={() => setAudio(null)} />
      <VideoModal item={video} onClose={() => setVideo(null)} />
    </PlayerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Audio bottom bar (Spotify-style, persists across navigation)
// ---------------------------------------------------------------------------

function AudioBar({
  audioRef,
  item,
  onClose,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  item: MediaItem | null;
  onClose: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // While the user drags the scrubber we hold a local value and stop letting
  // `timeupdate` write back, so the thumb tracks the pointer smoothly. The seek
  // is committed to the media element only on release (pointer up / keyboard).
  const [seekValue, setSeekValue] = useState<number | null>(null);
  const seeking = seekValue !== null;
  const vol = useVolume(audioRef);

  function commitSeek() {
    const a = audioRef.current;
    if (a && seekValue !== null) {
      a.currentTime = seekValue;
      setTime(seekValue);
    }
    setSeekValue(null);
  }

  // Autoplay when the track changes.
  useEffect(() => {
    const a = audioRef.current;
    if (a && item) {
      a.currentTime = 0;
      void a.play().catch(() => {});
    }
  }, [item, audioRef]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }

  /**
   * Closing has to stop the element itself. The <audio> tag stays mounted so
   * playback survives navigation, so merely clearing `item` — which drops the
   * `src` attribute — leaves the already-loaded track playing on.
   */
  function close() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load(); // releases the buffered resource
    }
    setPlaying(false);
    setSeekValue(null);
    setTime(0);
    onClose();
  }

  return (
    <>
      <audio
        ref={audioRef}
        src={item ? streamUrl(item.path) : undefined}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          if (!seeking) setTime(e.currentTarget.currentTime);
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />
      <AnimatePresence>
        {item && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.32, ease: EASE_DRAWER }}
            // Starts where the icon rail ends (SIDEBAR_WIDTH_ICON, 3.5rem):
            // spanning the whole window covered the rail's footer, and with it
            // the sign-out button. A literal width rather than the
            // `--sidebar-width-icon` variable, because the player is mounted
            // outside the sidebar provider that defines it.
            className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:left-14"
          >
            <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Music2 className="size-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium" title={item.name}>
                  {item.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                    {formatDuration(seekValue ?? time)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step="any"
                    value={seekValue ?? time}
                    onChange={(e) => setSeekValue(Number(e.target.value))}
                    onPointerUp={commitSeek}
                    onKeyUp={commitSeek}
                    onBlur={() => seeking && commitSeek()}
                    className="h-1 flex-1 cursor-pointer accent-primary"
                  />
                  <span className="w-9 text-xs tabular-nums text-muted-foreground">
                    {formatDuration(duration)}
                  </span>
                </div>
              </div>
              <VolumeControl {...vol} />
              <Button size="icon" variant="default" onClick={toggle}>
                {playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={close}>
                <X className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Video modal (with fullscreen)
// ---------------------------------------------------------------------------

function VideoModal({
  item,
  onClose,
}: {
  item: MediaItem | null;
  onClose: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  // The video uses native controls, so its own volume slider is the source of
  // truth here — we just seed it and store whatever the user sets, so the
  // level is shared with the audio bar.
  const { volume, setVolume } = useVolume(videoRef);

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">{item?.name ?? t.player.video}</DialogTitle>
        {item && (
          <video
            ref={videoRef}
            src={streamUrl(item.path)}
            controls
            autoPlay
            onLoadedMetadata={(e) => (e.currentTarget.volume = volume)}
            onVolumeChange={(e) => setVolume(e.currentTarget.volume)}
            className="aspect-video w-full bg-black"
          />
        )}
        <div className="flex items-center justify-between gap-2 border-t bg-background px-3 py-2">
          <span className="truncate text-sm font-medium" title={item?.name}>
            {item?.name}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => videoRef.current?.requestFullscreen?.()}
            >
              <Maximize2 className="size-4" />
              {t.player.fullscreen}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
