"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  Lock,
  FolderPlus,
  Home,
  Info,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { DownloadJob, FileNode } from "@app/shared";
import { toast } from "sonner";
import {
  useCreateFolder,
  useDeleteEntry,
  useDownloads,
  useEntryInfo,
  useFiles,
  useMoveEntry,
} from "@/lib/hooks";
import { downloadUrl, streamUrl, thumbUrl } from "@/lib/api";
import { EASE_OUT, DUR, SPRING_SNAP } from "@/lib/motion";
import { usePlayer } from "@/components/player";
import { useI18n, useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DotProgress } from "@/components/ui/dot-progress";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes, formatDate } from "@/lib/format";
import { FolderPicker } from "@/components/folder-picker";
import { ACTIVE_STATUSES, phaseLabel } from "@/lib/job-phase";
import { cn } from "@/lib/utils";

type MediaKind = "video" | "audio" | "image" | null;


/**
 * How long a finished download keeps its tile while the listing catches up.
 * Long enough to cover a refetch, short enough that a file which never arrives
 * does not leave a full ring sitting there.
 */
const GRACE_MS = 15_000;

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}
function joinRel(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}
/**
 * Extensions that make a *folder* pretend to be a media file. Renaming a folder
 * "Holidays.mp4" doesn't change what it is — but it is funny, so we play along.
 */
const MEDIA_EXT_RE =
  /\.(mp3|m4a|opus|flac|wav|aac|ogg|mp4|mkv|webm|mov|avi)$/i;

/** The kind a folder is dressing up as, or null when it is being honest. */
function disguisedKind(node: FileNode): MediaKind {
  if (node.type !== "directory") return null;
  const ext = node.name.match(MEDIA_EXT_RE)?.[1]?.toLowerCase();
  if (!ext) return null;
  return ["mp3", "m4a", "opus", "flac", "wav", "aac", "ogg"].includes(ext)
    ? "audio"
    : "video";
}

function mediaKind(node: FileNode): MediaKind {
  const m = node.mimeType ?? "";
  if (m.startsWith("video")) return "video";
  if (m.startsWith("audio")) return "audio";
  if (m.startsWith("image")) return "image";
  return null;
}
/**
 * Icon for an entry. Renders the element itself rather than handing back a
 * component to instantiate: a component value picked during render is recreated
 * on every pass, which resets its state and trips react-hooks/static-components.
 */
function EntryIcon({
  node,
  className,
  asPlainFolder,
}: {
  node: FileNode;
  className?: string;
  /** Hold the honest folder look, whatever the name says (see the wink). */
  asPlainFolder?: boolean;
}) {
  const c = cn(className, asPlainFolder ? "fill-amber-400/25 text-amber-500" : iconColor(node));
  if (node.type === "directory") {
    const costume = asPlainFolder ? null : disguisedKind(node);
    if (costume === "audio") return <FileAudio className={c} />;
    if (costume === "video") return <FileVideo className={c} />;
    return <Folder className={c} />;
  }
  const k = mediaKind(node);
  if (k === "video") return <FileVideo className={c} />;
  if (k === "audio") return <FileAudio className={c} />;
  if (k === "image") return <FileImage className={c} />;
  if (node.mimeType?.startsWith("text")) return <FileText className={c} />;
  return <FileIcon className={c} />;
}
function iconColor(node: FileNode): string {
  if (node.type === "directory") {
    const costume = disguisedKind(node);
    if (costume === "audio") return "text-emerald-500";
    if (costume === "video") return "text-violet-500";
    return "fill-amber-400/25 text-amber-500";
  }
  const k = mediaKind(node);
  if (k === "video") return "text-violet-500";
  if (k === "audio") return "text-emerald-500";
  if (k === "image") return "text-sky-500";
  return "text-muted-foreground";
}

function triggerDownload(path: string) {
  const a = document.createElement("a");
  a.href = downloadUrl(path);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * A filename without its extension.
 *
 * The grid sorts on this so that a download in progress and the file it
 * becomes compare identically — see the tiles memo.
 */
function stemOf(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** ".mp4" for a name that has one, "" otherwise. */
function extensionOf(name: string): string {
  return name.match(/\.[^.]+$/)?.[0] ?? "";
}

/** Filename yt-dlp finally wrote, or null while it is still working. */
function outputName(job: DownloadJob): string | null {
  if (!job.outputFile) return null;
  // Both separators: yt-dlp reports a native path, so a backslash on Windows
  // and a forward slash on Linux — the same build has to handle both.
  return job.outputFile.split(/[\\/]/).pop() || null;
}

/** Rectangle in viewport coordinates, as produced by the marquee. */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One cell of the grid: either a real entry, or a download on its way in. */
type Tile =
  | { key: string; sortAs: string; node: FileNode; job?: undefined }
  | { key: string; sortAs: string; job: DownloadJob; node?: undefined };

/**
 * Confetti for the transformation. Angles, colours and distances are fixed
 * rather than random so the server and the client render the same thing, and
 * the burst is pure animation — no state, no timers of its own.
 */
const CONFETTI = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + (i % 3) * 0.17;
  const distance = 34 + (i % 4) * 11;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    rotate: (i % 2 ? 1 : -1) * (120 + i * 17),
    delay: (i % 5) * 0.015,
    color: [
      "bg-amber-400",
      "bg-violet-500",
      "bg-emerald-500",
      "bg-sky-500",
      "bg-rose-400",
    ][i % 5],
  };
});

function ConfettiBurst() {
  return (
    <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      {CONFETTI.map((c, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: c.x,
            y: [0, c.y - 10, c.y + 6],
            scale: [0, 1, 0.9, 0],
            opacity: [1, 1, 1, 0],
            rotate: c.rotate,
          }}
          transition={{ duration: 0.75, delay: c.delay, ease: EASE_OUT }}
          className={cn("absolute size-1.5 rounded-[1px]", c.color)}
        />
      ))}
    </span>
  );
}

/**
 * The costume gag: a vibration that accelerates for ~1.1s — the keyframes are
 * evenly sized but their `times` gaps shrink, which is what reads as speeding
 * up — then a sharp implosion and a rebound, by which point the tile is already
 * wearing its new media icon.
 *
 * Rotation and scale only, never `x`: translating it while the grid reorders
 * around it looked like the tile was sliding away.
 */
const WINK_TIMES = [
  0, 0.09, 0.17, 0.24, 0.31, 0.37, 0.43, 0.48, 0.53, 0.575, 0.615, 0.65, 0.68,
  0.705, 0.76, 0.84, 0.92, 1,
];
const WINK_ANIMATION = {
  opacity: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.3, 1, 1],
  rotate: [0, -5, 5, -6, 6, -7, 7, -8, 8, -9, 9, -10, 10, -11, 0, 0, 0, 0],
  scale: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.09, 0.3, 1.14, 1],
};
/** How close to an edge the pointer must get before the surface scrolls. */
const EDGE = 48;
/** Fastest edge scroll, in pixels per frame. */
const EDGE_SPEED = 18;

/** Where the implosion sits inside WINK_TRANSITION (0.76 x 1.5s). */
const IMPLOSION_MS = 1140;

const WINK_TRANSITION = {
  duration: 1.5,
  // Linear: the pacing lives entirely in WINK_TIMES.
  ease: "linear" as const,
  times: WINK_TIMES,
};

function intersects(a: Rect, b: Rect): boolean {
  return !(
    b.left > a.right ||
    b.right < a.left ||
    b.top > a.bottom ||
    b.bottom < a.top
  );
}

// --- Tile -----------------------------------------------------------------

const EntryTile = memo(function EntryTile({
  node,
  selected,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onPlay,
  onDownload,
  onMove,
  onInfo,
  registerRef,
  selectionCount,
  wink,
  costumeHidden,
  settling,
  animateEntry,
  animateLayout,
}: {
  node: FileNode;
  selected: boolean;
  onSelect: (n: FileNode, e: React.MouseEvent) => void;
  onOpen: (n: FileNode) => void;
  onRename: (n: FileNode) => void;
  onDelete: (n: FileNode) => void;
  onPlay: (n: FileNode) => void;
  onDownload: (n: FileNode) => void;
  onMove: (n: FileNode) => void;
  onInfo: (n: FileNode) => void;
  registerRef: (path: string, el: HTMLElement | null) => void;
  /** Size of the selection, but only when this tile is in it — otherwise 0, so
   *  growing the selection does not invalidate every other tile's props. */
  selectionCount: number;
  /** Set for one beat right after this folder was given a media extension. */
  wink: boolean;
  /** True during the shake: the folder has not transformed yet. */
  costumeHidden: boolean;
  /** Just renamed: hold the layout animation so it appears in place. */
  settling: boolean;
  /**
   * Whether arriving on screen is an event worth animating.
   *
   * False for the tiles a folder opens with: they did not appear, the folder
   * did — and that is the grid's animation, not forty separate ones.
   */
  animateEntry: boolean;
  /** Whether moves are animated. Off in crowded folders — see LAYOUT_LIMIT. */
  animateLayout: boolean;
}) {
  const isDir = node.type === "directory";
  const costume = costumeHidden ? null : disguisedKind(node);
  const kind = mediaKind(node);
  const playable = kind === "video" || kind === "audio";
  // A bulk action applies when this tile is part of a multi-entry selection.
  const bulk = selected && selectionCount > 1;

  const t = useT();
  const { intl } = useI18n();
  const { attributes, listeners, setNodeRef: dragRef, isDragging } =
    useDraggable({ id: node.path, data: { node } });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop:${node.path}`,
    data: { node },
    disabled: !isDir,
  });
  const setRefs = (el: HTMLElement | null) => {
    dragRef(el);
    if (isDir) dropRef(el);
    registerRef(node.path, el);
  };

  const tileClass = cn(
    // A card, not a transparent patch: over the dotted background a
    // borderless tile left the dots running through the name.
    "group relative flex cursor-default flex-col items-center gap-2 rounded-xl border bg-card p-3 transition-colors",
    // Selection is an outline, not a wash: a translucent tint replaced the
    // card's own background and let the dotted page through, so picking a file
    // made it *less* readable.
    selected
      ? "border-primary ring-1 ring-primary/50"
      : "hover:border-foreground/20 hover:bg-accent",
    isOver && isDir && "border-primary bg-primary/10 ring-2 ring-primary/40",
    isDragging && "opacity-40",
  );

  const handlers = {
    ref: setRefs,
    ...listeners,
    ...attributes,
    "data-selected": selected || undefined,
    onClick: (e: React.MouseEvent) => onSelect(node, e),
    onDoubleClick: () => onOpen(node),
  };

  /**
   * A plain element once the folder is crowded.
   *
   * Motion instruments every element it renders, and that cost is paid on each
   * render rather than only while something animates — several hundred of them
   * is what made a full folder sluggish to scroll and to select in. Past the
   * threshold, the only animation still on offer is the arrival, and CSS does
   * that perfectly well. The wink keeps its keyframes wherever it happens:
   * there is one of it, and only for a moment.
   */
  const animated = animateLayout || wink;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          animated ? (
            <motion.div
              // Suspended right after a rename. The tile remounts under its new
              // path at a new spot in the alphabetical order, and animating that
              // arrival made it slide in from the side — which says nothing about
              // what happened. It reappears in place instead, and layout
              // animation resumes for moves and deletions.
              layout={animateLayout && !wink && !settling}
              initial={animateEntry ? { opacity: 0, scale: 0.96 } : false}
              animate={wink ? WINK_ANIMATION : { opacity: 1, scale: 1 }}
              transition={
                wink ? WINK_TRANSITION : { duration: DUR.base, ease: EASE_OUT }
              }
              {...handlers}
              className={tileClass}
            />
          ) : (
            <div
              {...handlers}
              className={cn(tileClass, animateEntry && "tile-enter")}
            />
          )
        }
      >
        <div className="relative flex size-14 items-center justify-center">
          <Thumbnail node={node}>
            <EntryIcon
              node={node}
              className="size-11"
              asPlainFolder={costumeHidden}
            />
          </Thumbnail>
          {wink && !costumeHidden && <ConfettiBurst />}
          {costume && (
            // It wears the costume, but it never stops being a folder.
            <span
              title={t.files.disguiseTooltip}
              className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border border-background bg-amber-500 text-white shadow-sm"
            >
              <Folder className="size-3" />
            </span>
          )}
          {node.isPrivate && (
            // Only an administrator is ever sent this flag. It says the member
            // asked for the folder to be kept out of other members' way — not
            // that its contents are sealed.
            <span
              title={t.files.privateFolder}
              className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border border-background bg-muted text-foreground shadow-sm"
            >
              <Lock className="size-3" />
            </span>
          )}
          {playable && (
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
              <Play className="size-6 fill-white text-white" />
            </span>
          )}
        </div>
        <span
          className="line-clamp-2 w-full text-center text-xs"
          title={node.name}
        >
          {node.name}
        </span>
        {!isDir && node.sizeBytes != null && (
          <span className="text-xs text-muted-foreground">
            {formatBytes(node.sizeBytes, intl)}
          </span>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isDir && !bulk && (
          <ContextMenuItem onClick={() => onOpen(node)}>
            <Folder className="size-4" />
            {t.files.open}
          </ContextMenuItem>
        )}
        {playable && !bulk && (
          <ContextMenuItem onClick={() => onPlay(node)}>
            <Play className="size-4" />
            {t.files.play}
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onDownload(node)}>
          <Download className="size-4" />
          {bulk ? t.files.downloadSelected : t.files.downloadEntry(isDir)}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onMove(node)}>
          <FolderInput className="size-4" />
          {bulk ? t.files.moveSelected : t.files.move}
        </ContextMenuItem>
        {!bulk && (
          <ContextMenuItem onClick={() => onRename(node)}>
            <Pencil className="size-4" />
            {t.files.rename}
          </ContextMenuItem>
        )}
        {!bulk && (
          <ContextMenuItem onClick={() => onInfo(node)}>
            <Info className="size-4" />
            {t.files.info}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onDelete(node)}>
          <Trash2 className="size-4" />
          {bulk ? t.files.deleteSelected : t.common.delete}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

/**
 * A file's preview image, falling back to its icon.
 *
 * The server makes these with ffmpeg — a frame from a video, the cover art
 * embedded in an audio file, a scaled copy of an image — and answers 404 when
 * there is nothing to show, which is the ordinary case for an audio file with
 * no cover. Rather than asking first and drawing second, the icon is drawn
 * immediately and the image covers it once it has loaded; a preview that never
 * arrives simply leaves the icon in place.
 *
 * Loaded lazily, so a folder of two hundred files fetches what is on screen
 * and nothing else.
 */
function Thumbnail({
  node,
  children,
}: {
  node: FileNode;
  children: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const previewable = node.type !== "directory" && mediaKind(node) !== null;

  return (
    <>
      {children}
      {previewable && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl(node.path, node.modifiedAt)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-14 rounded-md bg-muted object-cover"
        />
      )}
    </>
  );
}

// --- In-flight download tile ----------------------------------------------

/**
 * A placeholder for a download landing in the folder being viewed. The real
 * file does not exist yet (yt-dlp is still writing `.part` fragments, which the
 * API hides), so this stands in for it and disappears when the job completes
 * and the listing refreshes.
 */
const DownloadingTile = memo(function DownloadingTile({
  job,
  animateEntry,
  animateLayout,
}: {
  job: DownloadJob;
  animateEntry: boolean;
  animateLayout: boolean;
}) {
  const t = useT();
  const done = job.status === "completed";
  // A finished job is 100%, never whatever the last progress line said.
  // yt-dlp restarts its counter for each stream, so the final reading before
  // the merge is usually a low number for the audio track — reading it back
  // here left the placeholder frozen at something like 10%.
  const progress = done ? 1 : job.progress;
  const pct = Math.round(progress * 100);
  // Completed jobs keep a full ring while we wait for the file to be listed.
  const determinate = job.status === "downloading" || done;
  // The same phrase the job card uses. This tile used to say "Downloading"
  // throughout, so a long conversion looked like a download that had stopped
  // moving — which is precisely when someone starts wondering.
  const label = done ? t.files.almostThere : phaseLabel(job, t);

  return (
    <motion.div
      layout={animateLayout}
      initial={animateEntry ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DUR.base, ease: EASE_OUT }}
      // Opaque like the entry tiles, with the dashed primary border keeping it
      // legible as a placeholder rather than a file.
      className="relative flex cursor-default flex-col items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-card p-3"
      title={job.title ?? job.url}
    >
      <div className="flex size-14 items-center justify-center">
        {determinate ? (
          <DotProgress progress={progress} columns={5} rows={5} />
        ) : (
          <DotProgress indeterminate columns={5} rows={5} />
        )}
      </div>
      <span className="line-clamp-2 w-full text-center text-xs">
        {job.title ?? t.files.downloadingHere}
      </span>
      <span className="text-center text-xs tabular-nums text-primary">
        {/* The percentage belongs to the download, and only to it: during a
            conversion yt-dlp reports nothing, so a number there would be a
            frozen one. */}
        {job.status === "downloading" && determinate ? `${pct}% · ${label}` : label}
      </span>
    </motion.div>
  );
});

/**
 * A value that refuses to change more than once every `ms`.
 *
 * yt-dlp reports progress about five times a second, per download. Forty
 * entries of a playlist therefore push two hundred updates a second through
 * the socket, and each one rebuilt and re-sorted the whole grid — which is
 * what made the explorer crawl precisely when there was something to watch.
 * A progress ring does not need more than a handful of updates a second.
 */
function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const lastAt = useRef(0);

  useEffect(() => {
    const since = Date.now() - lastAt.current;
    if (since >= ms) {
      lastAt.current = Date.now();
      setShown(value);
      return;
    }
    const id = setTimeout(() => {
      lastAt.current = Date.now();
      setShown(value);
    }, ms - since);
    return () => clearTimeout(id);
  }, [value, ms]);

  return shown;
}

/** How often the grid may follow the download progress, in milliseconds. */
const PROGRESS_TICK = 250;

type ViewMode = "grid" | "list";

const VIEW_KEY = "files:view";

/**
 * Grid or list, remembered per browser.
 *
 * Grid by default: it is what the explorer has always been, and it is the
 * mode where a preview earns its place. The list is for working — it shows
 * size and date, sorts by them, and draws no images at all, which is what
 * makes a folder of hundreds pleasant rather than merely possible.
 */
function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>("grid");

  // Read on mount only: the server render has no localStorage, so adopting the
  // stored value during render would differ from the markup sent.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === "list" || stored === "grid") setMode(stored);
    } catch {
      // Private mode or storage disabled: the default stands.
    }
  }, []);

  const choose = useCallback((v: ViewMode) => {
    setMode(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // The choice simply will not outlive the session.
    }
  }, []);

  return [mode, choose];
}

// --- List view ------------------------------------------------------------

/** What the list is ordered by. */
type SortKey = "name" | "size" | "modified";

/**
 * One row of the list view.
 *
 * No preview image and no animation library: a row is a handful of DOM nodes
 * and nothing else, which is the whole reason this view exists. Folders still
 * open on a double click and everything still answers to the context menu, so
 * nothing is lost by working here rather than in the grid.
 */
const EntryRow = memo(function EntryRow({
  node,
  selected,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onPlay,
  onDownload,
  onMove,
  onInfo,
  registerRef,
  selectionCount,
}: {
  node: FileNode;
  selected: boolean;
  onSelect: (n: FileNode, e: React.MouseEvent) => void;
  onOpen: (n: FileNode) => void;
  onRename: (n: FileNode) => void;
  onDelete: (n: FileNode) => void;
  onPlay: (n: FileNode) => void;
  onDownload: (n: FileNode) => void;
  onMove: (n: FileNode) => void;
  onInfo: (n: FileNode) => void;
  registerRef: (path: string, el: HTMLElement | null) => void;
  selectionCount: number;
}) {
  const { t, intl } = useI18n();
  const isDir = node.type === "directory";
  const kind = mediaKind(node);
  const playable = kind === "video" || kind === "audio";
  const bulk = selected && selectionCount > 1;

  const { attributes, listeners, setNodeRef: dragRef, isDragging } =
    useDraggable({ id: node.path, data: { node } });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop:${node.path}`,
    data: { node },
    disabled: !isDir,
  });
  const setRefs = (el: HTMLElement | null) => {
    dragRef(el);
    if (isDir) dropRef(el);
    registerRef(node.path, el);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            ref={setRefs}
            {...listeners}
            {...attributes}
            data-selected={selected || undefined}
            onClick={(e: React.MouseEvent) => onSelect(node, e)}
            onDoubleClick={() => onOpen(node)}
            className={cn(
              "grid cursor-default grid-cols-[1fr_6rem_9rem] items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors",
              selected
                ? "border-primary/60 bg-primary/10"
                : "hover:bg-accent",
              isOver && isDir && "border-primary bg-primary/10",
              isDragging && "opacity-40",
            )}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <EntryIcon node={node} className="size-4 shrink-0" />
          <span className="truncate" title={node.name}>
            {node.name}
          </span>
        </span>
        <span className="text-right tabular-nums text-muted-foreground">
          {isDir ? "—" : formatBytes(node.sizeBytes, intl)}
        </span>
        <span className="text-right tabular-nums text-muted-foreground">
          {formatDate(node.modifiedAt, intl)}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isDir && !bulk && (
          <ContextMenuItem onClick={() => onOpen(node)}>
            <Folder className="size-4" />
            {t.files.open}
          </ContextMenuItem>
        )}
        {playable && !bulk && (
          <ContextMenuItem onClick={() => onPlay(node)}>
            <Play className="size-4" />
            {t.files.play}
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onDownload(node)}>
          <Download className="size-4" />
          {bulk ? t.files.downloadSelected : t.files.downloadEntry(isDir)}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onMove(node)}>
          <FolderInput className="size-4" />
          {bulk ? t.files.moveSelected : t.files.move}
        </ContextMenuItem>
        {!bulk && (
          <ContextMenuItem onClick={() => onRename(node)}>
            <Pencil className="size-4" />
            {t.files.rename}
          </ContextMenuItem>
        )}
        {!bulk && (
          <ContextMenuItem onClick={() => onInfo(node)}>
            <Info className="size-4" />
            {t.files.info}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onDelete(node)}>
          <Trash2 className="size-4" />
          {bulk ? t.files.deleteSelected : t.common.delete}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

/** One row for a download still on its way in, in the list view. */
const DownloadingRow = memo(function DownloadingRow({ job }: { job: DownloadJob }) {
  const t = useT();
  const done = job.status === "completed";
  const progress = done ? 1 : job.progress;
  const label = done ? t.files.almostThere : phaseLabel(job, t);

  return (
    <div className="grid grid-cols-[1fr_6rem_9rem] items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        <span className="truncate" title={job.title ?? job.url}>
          {job.title ?? t.files.downloadingHere}
        </span>
      </span>
      <span className="text-right tabular-nums text-primary">
        {job.status === "downloading" ? `${Math.round(progress * 100)}%` : ""}
      </span>
      <span className="truncate text-right text-muted-foreground">{label}</span>
    </div>
  );
});

/** The sortable header row of the list view. */
function ColumnHeaders({
  sortKey,
  sortAsc,
  onSort,
}: {
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const t = useT();
  const columns: [SortKey, string, boolean][] = [
    ["name", t.files.columnName, false],
    ["size", t.files.columnSize, true],
    ["modified", t.files.columnModified, true],
  ];

  return (
    <div className="sticky top-0 z-10 grid grid-cols-[1fr_6rem_9rem] gap-3 border-b bg-background px-2 pb-1.5 text-xs text-muted-foreground">
      {columns.map(([key, label, alignRight]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSort(key)}
          className={cn(
            "flex items-center gap-1 transition-colors hover:text-foreground",
            alignRight && "justify-end",
            sortKey === key && "text-foreground",
          )}
        >
          {label}
          {sortKey === key && (
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                sortAsc && "rotate-180",
              )}
            />
          )}
        </button>
      ))}
    </div>
  );
}

// --- Folder grid ----------------------------------------------------------

/**
 * Above this many tiles, moves stop being animated.
 *
 * Every animated tile is measured by Motion on each layout change, so in a
 * folder of hundreds the cost is paid on every render — to show a reflow
 * nobody can follow anyway.
 */
const LAYOUT_LIMIT = 120;

/**
 * The contents of one folder.
 *
 * Mounted per path, which is the whole point: opening a folder replaces this
 * element, so the arrival is the grid's to animate. Its tiles are not new
 * things appearing — they are what the folder always held — so they render
 * without an entry animation until the grid has settled. After that, a tile
 * that shows up really is an event (a download landing, a folder created) and
 * animates on its own.
 */
function FolderGrid({
  tiles,
  children,
}: {
  tiles: Tile[];
  children: (opts: { animateEntry: boolean; animateLayout: boolean }) => React.ReactNode;
}) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    // A frame, not a timeout: the first paint is what must be free of entry
    // animations, and anything after it is a genuine arrival.
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <motion.div
      // Depth, not direction: the contents of a folder replace the contents of
      // another, they do not slide in from somewhere. Short enough not to sit
      // between the click and the answer.
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DUR.base, ease: EASE_OUT }}
      data-selection-surface=""
      className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1"
    >
      {children({
        animateEntry: settled,
        animateLayout: tiles.length <= LAYOUT_LIMIT,
      })}
    </motion.div>
  );
}

// --- Breadcrumb droppable -------------------------------------------------

function CrumbDrop({
  path,
  children,
  onNavigate,
}: {
  path: string;
  children: React.ReactNode;
  onNavigate: (p: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${path || "__root__"}`,
    data: { node: { path, type: "directory" } as FileNode },
  });
  return (
    <button
      ref={setNodeRef}
      onClick={() => onNavigate(path)}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-muted",
        isOver && "bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      {children}
    </button>
  );
}

// --- Main -----------------------------------------------------------------

export function FileManager() {
  const { t, intl, errorMessage } = useI18n();
  const [path, setPath] = useState("");
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useFiles(path);
  // Only the viewer's own downloads become tiles. A member's `destPath` is
  // relative to their own folder, so a job of theirs aimed at their root
  // carries the same empty path as the administrator's library root — and
  // surfaced there, in a folder it was never going to land in.
  // With the playlist entries: each one writes its own file here, so each one
  // gets its own tile. The parent writes nothing and never appears.
  const { data: liveJobs } = useDownloads("mine", true);
  // Throttled: see `useThrottled`. The tiles are rebuilt from this, so it sets
  // how often the grid does any work at all while downloads are running.
  const jobs = useThrottled(liveJobs, PROGRESS_TICK);
  const move = useMoveEntry();
  const createFolder = useCreateFolder();
  const del = useDeleteEntry();
  const { playAudio, playVideo } = usePlayer();

  const [dragging, setDragging] = useState<FileNode | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  /** Entries waiting for a destination, while the folder picker is open. */
  const [moving, setMoving] = useState<FileNode[] | null>(null);
  const [view, setView] = useViewMode();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [newFolderName, setNewFolderName] = useState("");
  // Path of the folder that just put on a costume, for a one-off shimmy.
  const [winkPath, setWinkPath] = useState<string | null>(null);
  // The transformation lands at the implosion, not at the start of the shake:
  // until then the tile must still look like an ordinary folder.
  const [costumeHidden, setCostumeHidden] = useState(false);
  // Path of the entry that was just renamed, to keep it from sliding into its
  // new alphabetical slot.
  const [settlingPath, setSettlingPath] = useState<string | null>(null);
  // Media extension currently typed in the rename box, e.g. ".mp4".
  const typedExt = renameValue.trim().match(MEDIA_EXT_RE)?.[0]?.toLowerCase();

  /**
   * The folder's entries, keeping the object identity of anything unchanged.
   *
   * Every refetch parses fresh JSON, so each entry arrived as a brand new
   * object even when nothing about it had changed — which broke the tiles'
   * memoisation and re-rendered the whole grid. Something as ordinary as one
   * download finishing therefore made every file in the folder redraw, and
   * animate. An entry is the same entry when its path, size and modification
   * time are; on that basis the previous object is handed back.
   */
  const entryCache = useRef(new Map<string, FileNode>());
  const entries = useMemo(() => {
    const seen = new Map<string, FileNode>();
    const list = (data?.entries ?? []).map((fresh) => {
      const known = entryCache.current.get(fresh.path);
      const same =
        known &&
        known.sizeBytes === fresh.sizeBytes &&
        known.modifiedAt === fresh.modifiedAt &&
        known.type === fresh.type &&
        known.isPrivate === fresh.isPrivate;
      const node = same ? known : fresh;
      seen.set(node.path, node);
      return node;
    });
    // Replaced rather than added to, so a folder left behind does not keep
    // its entries alive for the rest of the session.
    entryCache.current = seen;
    return list;
  }, [data]);

  // State clock for the placeholder hold below (see the tiles memo).
  const [now, setNow] = useState(() => Date.now());

  const entriesByName = useMemo(
    () => new Map(entries.map((e) => [e.name, e])),
    [entries],
  );

  /**
   * The entry a job produced.
   *
   * The recorded filename first. The bracketed video id is only a fallback
   * now, for files fetched back when yt-dlp put it in every name — downloads
   * are named after their title alone, and a collision is settled with a
   * " (2)" before the download starts.
   */
  const matchingEntry = useCallback(
    (job: DownloadJob): FileNode | undefined => {
      const name = outputName(job);
      const exact = name ? entriesByName.get(name) : undefined;
      if (exact) return exact;

      const id = job.url.match(
        /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/,
      )?.[1];
      if (!id) return undefined;
      const tag = `[${id}]`;
      return entries.find((e) => e.type !== "directory" && e.name.includes(tag));
    },
    [entries, entriesByName],
  );

  /**
   * Downloads aimed at the folder on screen, newest first.
   *
   * Direct downloads are left out: they are written to scratch space, handed
   * to the browser and deleted, so they never become a file here. Showing one
   * as an in-progress tile promised something the folder would never hold.
   */
  const jobsHere = useMemo(() => {
    // Flattened: a playlist's entries are the jobs that land in a folder, the
    // parent is only their tally. Leaving them nested meant a playlist showed
    // nothing here at all while forty files were being written.
    const flat = (jobs ?? []).flatMap((j) =>
      j.isPlaylistParent ? (j.children ?? []) : [j],
    );
    return flat.filter(
      (j) => j.retention !== "direct" && (j.destPath ?? "") === path,
    );
  }, [jobs, path]);

  /**
   * One ordered list of tiles: folders first, then files and downloads
   * interleaved by name.
   *
   * A download and the file it produces share a single tile, keyed by the job.
   * That tile starts as a progress placeholder and simply swaps its contents
   * for the real entry once the listing catches up — so the download turns
   * into the file, in place, instead of a second square appearing beside it.
   *
   * Everything is sorted on the same thing: the name without its extension.
   * A download in progress is sorted by the name reserved for it before it
   * started, which is the name the file will carry — so the placeholder sits
   * exactly where the file will, and becoming that file moves nothing. Sorting
   * one on the title and the other on the full filename put them in different
   * places often enough ("Title" against "Title 2" flips once ".m4a" is in the
   * comparison), and the whole grid shuffled every time an entry finished.
   */
  const tiles = useMemo<Tile[]>(() => {
    const collator = new Intl.Collator(intl, { sensitivity: "base" });
    const claimed = new Set<string>();
    const files: Tile[] = [];
    /** What a download will be called, falling back to its title. */
    const plannedOf = (job: DownloadJob) => job.plannedName ?? job.title ?? "";

    for (const job of jobsHere) {
      const entry = matchingEntry(job);

      if (entry && !claimed.has(entry.path)) {
        // The file has landed: the job's tile becomes that file.
        claimed.add(entry.path);
        files.push({ key: `job:${job.id}`, sortAs: stemOf(entry.name), node: entry });
      } else if (ACTIVE_STATUSES.includes(job.status)) {
        files.push({ key: `job:${job.id}`, sortAs: plannedOf(job), job });
      } else if (job.status === "completed" && job.outputFile) {
        // Finished, but not in the listing yet. Hold the placeholder so the
        // grid does not reflow twice while the refetch is in flight.
        //
        // Two ways out, because a tile that only counts down can stay on
        // screen forever: a listing fetched *after* the job finished and still
        // without the file settles the question — it was moved, renamed or
        // deleted elsewhere — and the deadline catches the rest. `now` is a
        // state clock rather than Date.now() in render, so the deadline
        // actually arrives instead of waiting for an unrelated re-render.
        const finishedAt = new Date(job.updatedAt).getTime();
        const listingIsNewer = dataUpdatedAt > finishedAt;
        if (!listingIsNewer && now - finishedAt < GRACE_MS) {
          files.push({ key: `job:${job.id}`, sortAs: plannedOf(job), job });
        }
      }
    }

    for (const e of entries) {
      if (e.type === "directory" || claimed.has(e.path)) continue;
      files.push({ key: e.path, sortAs: stemOf(e.name), node: e });
    }
    files.sort((a, b) => collator.compare(a.sortAs, b.sortAs));

    return [
      ...entries
        .filter((e) => e.type === "directory")
        .map((node) => ({ key: node.path, sortAs: node.name, node })),
      ...files,
    ];
  }, [entries, jobsHere, intl, matchingEntry, dataUpdatedAt, now]);

  /**
   * The same tiles, ordered by whichever column the list is sorted on.
   *
   * Folders stay above files whatever the column: a folder has no size and no
   * meaningful place in a list of them, and mixing the two is how a sort turns
   * a familiar folder into a stranger.
   */
  const rows = useMemo(() => {
    if (view !== "list" || sortKey === "name") {
      return sortAsc ? tiles : [...tiles].reverse();
    }
    const collator = new Intl.Collator(intl, { sensitivity: "base" });
    const weight = (tile: Tile) =>
      tile.node?.type === "directory" ? 0 : 1;
    const value = (tile: Tile) => {
      if (!tile.node) return 0;
      return sortKey === "size"
        ? (tile.node.sizeBytes ?? 0)
        : new Date(tile.node.modifiedAt).getTime();
    };
    return [...tiles].sort((a, b) => {
      const byKind = weight(a) - weight(b);
      if (byKind !== 0) return byKind;
      // A download still in flight has neither size nor date; it keeps its
      // place by name rather than piling up at one end.
      if (!a.node || !b.node) return collator.compare(a.sortAs, b.sortAs);
      const diff = value(a) - value(b);
      return sortAsc ? diff : -diff;
    });
  }, [tiles, view, sortKey, sortAsc, intl]);

  // Advance the clock only while a placeholder is actually being held, and
  // stop as soon as none are: a timer that keeps running would re-render this
  // grid twice a second for nothing.
  useEffect(() => {
    const holding = jobsHere.some(
      (j) =>
        j.status === "completed" &&
        j.outputFile &&
        Date.now() - new Date(j.updatedAt).getTime() < GRACE_MS,
    );
    if (!holding) return;
    const id = setTimeout(() => setNow(Date.now()), 500);
    return () => clearTimeout(id);
  }, [jobsHere, now]);

  // --- Selection ----------------------------------------------------------

  const [selection, setSelection] = useState<Set<string>>(new Set());
  // Anchor for shift-click ranges: the last entry picked without shift.
  const anchorRef = useRef<string | null>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const registerRef = useCallback((p: string, el: HTMLElement | null) => {
    if (el) tileRefs.current.set(p, el);
    else tileRefs.current.delete(p);
  }, []);

  /**
   * Navigate, clearing the selection: paths from the folder we are leaving
   * would otherwise keep entries "selected" that are no longer on screen.
   * Done here rather than in an effect on `path` so the reset happens with the
   * navigation instead of in a second render pass.
   */
  const navigate = useCallback((next: string) => {
    setPath(next);
    setSelection(new Set());
    anchorRef.current = null;
    tileRefs.current.clear();
  }, []);

  const selectedNodes = useMemo(
    () => entries.filter((e) => selection.has(e.path)),
    [entries, selection],
  );

  const handleSelect = useCallback((node: FileNode, e: React.MouseEvent) => {
    const additive = e.ctrlKey || e.metaKey;
    if (e.shiftKey && anchorRef.current) {
      const from = entries.findIndex((x) => x.path === anchorRef.current);
      const to = entries.findIndex((x) => x.path === node.path);
      if (from !== -1 && to !== -1) {
        const [a, b] = from < to ? [from, to] : [to, from];
        const range = entries.slice(a, b + 1).map((x) => x.path);
        setSelection((prev) =>
          additive ? new Set([...prev, ...range]) : new Set(range),
        );
        return;
      }
    }
    if (additive) {
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(node.path)) next.delete(node.path);
        else next.add(node.path);
        return next;
      });
    } else {
      setSelection(new Set([node.path]));
    }
    anchorRef.current = node.path;
  }, [entries]);

  // --- Marquee (drag a rectangle over empty space) ------------------------

  /** Marquee overlay box, already in the scrolling box's coordinates. */
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const marqueeStart = useRef<{
    x: number;
    y: number;
    base: Set<string>;
    /** Extent of the content when the drag began — see `runMarqueeFrame`. */
    contentWidth: number;
    contentHeight: number;
  } | null>(null);
  /**
   * Tile boxes, measured once when the drag starts, **in the scroller's own
   * coordinates** — distance from the top of the content, not from the top of
   * the window. Re-measuring all of them on every pointermove forced a layout
   * each frame, which is what made the marquee stutter; and viewport
   * coordinates would go stale the moment the surface scrolls, which it now
   * does on its own (see the edge scrolling below).
   */
  const tileBoxes = useRef<[string, Rect][]>([]);
  /** Running while a marquee is active: edge scrolling plus one update a frame. */
  const marqueeFrame = useRef<number | null>(null);
  /** Latest pointer position, in viewport coordinates. */
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  /**
   * One marquee frame: scroll if the pointer is against an edge, then rebuild
   * the rectangle and the selection from wherever the content now sits.
   *
   * Driven by the animation frame rather than by pointermove, because the
   * pointer stops moving the instant it reaches the edge — and that is exactly
   * when the surface has to keep scrolling under it.
   */
  // A declaration rather than a memoised callback: it schedules itself for the
  // next frame while the pointer sits against an edge, and a `useCallback`
  // cannot refer to its own binding.
  function runMarqueeFrame() {
    marqueeFrame.current = null;
    const host = scrollRef.current;
    const p = lastPointer.current;
    const s = marqueeStart.current;
    if (!host || !p || !s) return;

    const box = host.getBoundingClientRect();

    // Edge scrolling, proportional to how far past the threshold the pointer
    // is: a nudge past the edge creeps, holding well beyond it travels.
    //
    // Bounded by the content as it was when the drag began, not by the live
    // `scrollHeight`. The overlay is absolutely positioned *inside* this
    // scroller, so a rectangle dragged past the last row lengthened the
    // content, which allowed more scrolling, which lengthened it again — the
    // runaway scroll downwards.
    const maxScroll = Math.max(0, s.contentHeight - host.clientHeight);
    const above = box.top + EDGE - p.y;
    const below = p.y - (box.bottom - EDGE);
    if (above > 0) {
      host.scrollTop = Math.max(
        0,
        host.scrollTop - (Math.min(above, EDGE) / EDGE) * EDGE_SPEED,
      );
    } else if (below > 0) {
      host.scrollTop = Math.min(
        maxScroll,
        host.scrollTop + (Math.min(below, EDGE) / EDGE) * EDGE_SPEED,
      );
    }

    // The pointer in content coordinates, read *after* scrolling so the
    // rectangle follows the content rather than the window. Clamped to the
    // content for the same reason as the scroll above.
    const px = Math.max(0, Math.min(s.contentWidth, p.x - box.left + host.scrollLeft));
    const py = Math.max(0, Math.min(s.contentHeight, p.y - box.top + host.scrollTop));

    const rect: Rect = {
      left: Math.min(s.x, px),
      right: Math.max(s.x, px),
      top: Math.min(s.y, py),
      bottom: Math.max(s.y, py),
    };
    setMarquee({
      left: rect.left,
      top: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    });

    const hit = new Set(s.base);
    for (const [path, tileBox] of tileBoxes.current) {
      if (intersects(rect, tileBox)) hit.add(path);
    }
    // Skip the state update when nothing actually changed, so sweeping over
    // empty space does not re-render every tile.
    setSelection((prev) =>
      prev.size === hit.size && [...hit].every((x) => prev.has(x)) ? prev : hit,
    );

    // Keep going while the pointer sits against an edge: the selection has to
    // grow even though nothing is moving.
    if (above > 0 || below > 0) {
      marqueeFrame.current = requestAnimationFrame(runMarqueeFrame);
    }
  }

  function onSurfacePointerDown(e: React.PointerEvent) {
    // Only start on empty space. Both the scrolling box and the grid inside it
    // carry `data-selection-surface`, because the gap to the right of the last
    // tile in a row belongs to the grid, not to the scroller — testing against
    // `currentTarget` alone made the marquee almost impossible to trigger.
    // A pointer-down on a tile has no such attribute and belongs to dnd-kit.
    const el = e.target as HTMLElement;
    if (e.button !== 0 || !el.hasAttribute("data-selection-surface")) return;
    const host = e.currentTarget;
    const box = host.getBoundingClientRect();
    const additive = e.ctrlKey || e.metaKey;
    marqueeStart.current = {
      x: e.clientX - box.left + host.scrollLeft,
      y: e.clientY - box.top + host.scrollTop,
      base: additive ? new Set(selection) : new Set(),
      contentWidth: host.scrollWidth,
      contentHeight: host.scrollHeight,
    };
    if (!additive) {
      setSelection(new Set());
      anchorRef.current = null;
    }
    tileBoxes.current = [...tileRefs.current].map(([p, el]) => {
      const r = el.getBoundingClientRect();
      return [
        p,
        {
          left: r.left - box.left + host.scrollLeft,
          right: r.right - box.left + host.scrollLeft,
          top: r.top - box.top + host.scrollTop,
          bottom: r.bottom - box.top + host.scrollTop,
        },
      ];
    });
    host.setPointerCapture(e.pointerId);
  }

  function onSurfacePointerMove(e: React.PointerEvent) {
    if (!marqueeStart.current) return;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    // One update per frame: pointermove fires far more often than the screen
    // refreshes, and every update re-renders the grid.
    if (marqueeFrame.current === null) {
      marqueeFrame.current = requestAnimationFrame(runMarqueeFrame);
    }
  }

  /**
   * Stop the marquee, wherever the release happened.
   *
   * Split from the React handler because a pointer released outside the
   * window — over the desktop, another application, the browser's own chrome —
   * never sends an event to the element, and the rectangle stayed on screen
   * selecting whatever the pointer passed over next.
   */
  const stopMarquee = useCallback(() => {
    if (!marqueeStart.current) return;
    marqueeStart.current = null;
    lastPointer.current = null;
    if (marqueeFrame.current !== null) {
      cancelAnimationFrame(marqueeFrame.current);
      marqueeFrame.current = null;
    }
    tileBoxes.current = [];
    setMarquee(null);
  }, []);

  useEffect(() => {
    // `pointerup` on the window catches a release inside the page that missed
    // the element; `blur` catches the one that happened outside it entirely,
    // since leaving the window is the last thing we are told about.
    window.addEventListener("pointerup", stopMarquee);
    window.addEventListener("pointercancel", stopMarquee);
    window.addEventListener("blur", stopMarquee);
    return () => {
      window.removeEventListener("pointerup", stopMarquee);
      window.removeEventListener("pointercancel", stopMarquee);
      window.removeEventListener("blur", stopMarquee);
    };
  }, [stopMarquee]);

  function endMarquee(e: React.PointerEvent) {
    if (!marqueeStart.current) return;
    marqueeStart.current = null;
    lastPointer.current = null;
    if (marqueeFrame.current !== null) {
      cancelAnimationFrame(marqueeFrame.current);
      marqueeFrame.current = null;
    }
    tileBoxes.current = [];
    setMarquee(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }



  // --- Actions ------------------------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const segments = path ? path.split("/") : [];

  function onDragStart(e: DragStartEvent) {
    const node = (e.active.data.current?.node as FileNode) ?? null;
    setDragging(node);
    // Dragging an unselected entry acts on that entry alone.
    if (node && !selection.has(node.path)) {
      setSelection(new Set([node.path]));
      anchorRef.current = node.path;
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const src = e.active.data.current?.node as FileNode | undefined;
    const target = e.over?.data.current?.node as FileNode | undefined;
    setDragging(null);
    if (!src || !target || target.type !== "directory") return;

    // Move the whole selection when the dragged entry is part of it.
    const batch = selection.has(src.path) ? selectedNodes : [src];
    const movable = batch.filter(
      (n) => n.path !== target.path && parentOf(n.path) !== target.path,
    );
    if (movable.length === 0) return;

    try {
      for (const n of movable) {
        await move.mutateAsync({
          from: n.path,
          to: joinRel(target.path, n.name),
        });
      }
      const where = target.path || t.files.root;
      toast.success(
        movable.length > 1
          ? t.files.movedMany(movable.length, where)
          : t.files.moved(where),
      );
      setSelection(new Set());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const play = useCallback(
    (n: FileNode) => {
      const k = mediaKind(n);
      if (k === "video") playVideo({ path: n.path, name: n.name });
      else if (k === "audio") playAudio({ path: n.path, name: n.name });
      else if (k === "image") window.open(streamUrl(n.path), "_blank");
    },
    [playAudio, playVideo],
  );
  const openNode = useCallback(
    (n: FileNode) => {
      if (n.type === "directory") navigate(n.path);
      else play(n);
    },
    [navigate, play],
  );
  const startRename = useCallback((n: FileNode) => {
    setRenameTarget(n);
    setRenameValue(n.name);
  }, []);

  async function handleRename() {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.name) return setRenameTarget(null);
    const to = joinRel(parentOf(renameTarget.path), name);
    // Did a folder just change costume? Comparing the extensions rather than
    // merely testing for one means ".mp4" → ".mp3" replays the gag — that is a
    // real transformation — while renaming "Holidays.mp4" to "Trip.mp4" does
    // not, since the costume is unchanged and there is nothing to show.
    const prevExt = renameTarget.name.match(MEDIA_EXT_RE)?.[0]?.toLowerCase();
    const nextExt = name.match(MEDIA_EXT_RE)?.[0]?.toLowerCase();
    const dressedUp =
      renameTarget.type === "directory" && !!nextExt && nextExt !== prevExt;
    try {
      await move.mutateAsync({ from: renameTarget.path, to });
      toast.success(t.files.renamed);
      setSettlingPath(to);
      setTimeout(() => setSettlingPath(null), 450);
      if (dressedUp) {
        // The rename dialog already delivered the line; here it transforms.
        setWinkPath(to);
        setCostumeHidden(true);
        // 1.14s in: the implosion, where the folder becomes its costume.
        setTimeout(() => setCostumeHidden(false), IMPLOSION_MS);
        setTimeout(() => setWinkPath(null), 1800);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setRenameTarget(null);
  }

  /** Delete one entry, or the whole selection when the entry belongs to it. */
  const runDelete = useCallback(
    async (n?: FileNode) => {
      const batch = n && !selection.has(n.path) ? [n] : selectedNodes;
      if (batch.length === 0) return;
      try {
        for (const item of batch) await del.mutateAsync(item.path);
        toast.success(
          batch.length > 1 ? t.files.deletedMany(batch.length) : t.files.deleted,
        );
        setSelection(new Set());
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [del, errorMessage, selectedNodes, selection, t],
  );

  const runDownload = useCallback(
    (n?: FileNode) => {
      const batch = n && !selection.has(n.path) ? [n] : selectedNodes;
      // No multi-file archive endpoint: each entry gets its own request, which
      // the browser handles as separate downloads.
      for (const item of batch) triggerDownload(item.path);
    },
    [selection, selectedNodes],
  );

  /**
   * Move one entry, or the whole selection, through the folder picker.
   *
   * Dragging already moves things, but only to a folder that happens to be on
   * screen — which rules out moving something up and across the tree, the very
   * case where dragging is worst.
   */
  const runMove = useCallback(
    (n?: FileNode) => {
      const batch = n && !selection.has(n.path) ? [n] : selectedNodes;
      if (batch.length > 0) setMoving(batch);
    },
    [selection, selectedNodes],
  );

  async function moveTo(target: string) {
    const batch = moving;
    setMoving(null);
    if (!batch || target === path) return;
    try {
      for (const item of batch) {
        await move.mutateAsync({
          from: item.path,
          to: target ? `${target}/${item.name}` : item.name,
        });
      }
      const where = target || t.files.root;
      toast.success(
        batch.length > 1
          ? t.files.movedMany(batch.length, where)
          : t.files.moved(where),
      );
      setSelection(new Set());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  /** The entry whose properties are on screen, if any. */
  const [infoTarget, setInfoTarget] = useState<FileNode | null>(null);

  /**
   * Both handlers above necessarily change identity whenever the selection
   * does. Handing them straight to the tiles would re-render every tile on
   * every frame of a marquee drag, which is exactly what `memo` on EntryTile is
   * there to prevent. These thin wrappers never change identity and read the
   * current version through a ref, so a tile's props only change when that
   * tile's own selected state does.
   */
  const latest = useRef({ runDelete, runDownload, runMove });
  useEffect(() => {
    latest.current = { runDelete, runDownload, runMove };
  }, [runDelete, runDownload, runMove]);

  const handleDelete = useCallback(
    (n?: FileNode) => latest.current.runDelete(n),
    [],
  );
  const handleDownload = useCallback(
    (n?: FileNode) => latest.current.runDownload(n),
    [],
  );
  const handleMove = useCallback((n?: FileNode) => latest.current.runMove(n), []);
  const handleInfo = useCallback((n: FileNode) => setInfoTarget(n), []);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder.mutateAsync({ path, name });
      toast.success(t.files.folderCreated);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setNewFolderName("");
    setNewFolderOpen(false);
  }

  // --- Keyboard -----------------------------------------------------------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      // Never hijack typing in the rename / new-folder fields.
      if (el && (el.tagName === "INPUT" || el.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(new Set(entries.map((x) => x.path)));
      } else if (e.key === "Escape") {
        setSelection(new Set());
      } else if (e.key === "Delete") {
        // No selection is a no-op inside the handler, so the effect does not
        // need `selection` as a dependency — which would otherwise re-bind this
        // listener on every frame of a marquee drag.
        void handleDelete();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries, handleDelete]);

  const nothingToShow = !isLoading && tiles.length === 0;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-full flex-col">
        {/* Toolbar — solid background so the dotted grid doesn't show through. */}
        <div className="flex items-center gap-2 border-b bg-background px-4 py-2">
          <div className="flex flex-1 flex-wrap items-center gap-0.5 text-sm">
            <CrumbDrop path="" onNavigate={navigate}>
              <Home className="size-3.5" />
              {t.files.root}
            </CrumbDrop>
            {segments.map((seg, i) => {
              const p = segments.slice(0, i + 1).join("/");
              return (
                <span key={p} className="flex items-center gap-0.5">
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <CrumbDrop path={p} onNavigate={navigate}>
                    {seg}
                  </CrumbDrop>
                </span>
              );
            })}
          </div>
          <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="size-4" />
            {t.files.newFolder}
          </Button>
          {/* Two states, so one button that shows what it will switch to. */}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setView(view === "grid" ? "list" : "grid")}
            title={view === "grid" ? t.files.viewList : t.files.viewGrid}
          >
            {view === "grid" ? (
              <ListIcon className="size-4" />
            ) : (
              <LayoutGrid className="size-4" />
            )}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => refetch()}
            title={t.files.refresh}
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
        </div>

        {/* Selection bar — only while something is selected. */}
        {/*
          Only from two items up. A single click selects, like any file manager,
          but throwing a whole action bar on screen for one file is startling —
          and pointless, since the context menu already covers a single entry.
        */}
        <AnimatePresence initial={false}>
          {selection.size > 1 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: DUR.base, ease: EASE_OUT }}
              // Opaque, like the toolbar above it: a 5% tint over the dotted
              // page let the dots show through the one bar that appears on top
              // of the grid.
              className="overflow-hidden border-b bg-accent"
            >
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1 text-sm font-medium">
                  {t.files.selected(selection.size)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => handleDownload()}>
                  <Download className="size-4" />
                  {t.files.download}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleMove()}>
                  <FolderInput className="size-4" />
                  {t.files.move}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete()}
                >
                  <Trash2 className="size-4" />
                  {t.common.delete}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={t.files.clearSelection}
                  onClick={() => setSelection(new Set())}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Grid */}
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <div
                ref={scrollRef}
                data-selection-surface=""
                className="relative flex-1 overflow-auto p-4"
                onPointerDown={onSurfacePointerDown}
                onPointerMove={onSurfacePointerMove}
                onPointerUp={endMarquee}
                onPointerCancel={endMarquee}
              />
            }
          >
            {isLoading ? (
              <div className="pointer-events-none flex h-64 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : nothingToShow ? (
              <div className="pointer-events-none flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <Folder className="size-10" />
                {t.files.emptyHint}
              </div>
            ) : view === "list" ? (
              <div data-selection-surface="" className="flex flex-col">
                <ColumnHeaders
                  sortKey={sortKey}
                  sortAsc={sortAsc}
                  onSort={(k) => {
                    // Clicking the active column reverses it; a new column
                    // starts ascending, which is what every file manager does.
                    if (k === sortKey) setSortAsc((v) => !v);
                    else {
                      setSortKey(k);
                      setSortAsc(true);
                    }
                  }}
                />
                {rows.map((tile) =>
                  tile.job ? (
                    <DownloadingRow key={tile.key} job={tile.job} />
                  ) : (
                    <EntryRow
                      key={tile.key}
                      node={tile.node}
                      selected={selection.has(tile.node.path)}
                      selectionCount={
                        selection.has(tile.node.path) ? selection.size : 0
                      }
                      onSelect={handleSelect}
                      onOpen={openNode}
                      onPlay={play}
                      onDownload={handleDownload}
                      onMove={handleMove}
                      onInfo={handleInfo}
                      onRename={startRename}
                      onDelete={handleDelete}
                      registerRef={registerRef}
                    />
                  ),
                )}
              </div>
            ) : (
              // Keyed by path: navigating replaces the grid rather than
              // deleting and recreating forty tiles. The old `AnimatePresence
              // mode="popLayout"` read a navigation as exactly that, pulling
              // the outgoing tiles out of the flow — which is where the slide
              // from the right came from.
              <FolderGrid key={path || "__root__"} tiles={tiles}>
                {({ animateEntry, animateLayout }) =>
                  tiles.map((tile) =>
                    tile.job ? (
                      <DownloadingTile
                        key={tile.key}
                        job={tile.job}
                        animateEntry={animateEntry}
                        animateLayout={animateLayout}
                      />
                    ) : (
                      <EntryTile
                        key={tile.key}
                        node={tile.node}
                        animateEntry={animateEntry}
                        animateLayout={animateLayout}
                        selected={selection.has(tile.node.path)}
                        selectionCount={
                          selection.has(tile.node.path) ? selection.size : 0
                        }
                        wink={winkPath === tile.node.path}
                        costumeHidden={
                          winkPath === tile.node.path && costumeHidden
                        }
                        settling={settlingPath === tile.node.path}
                        onSelect={handleSelect}
                        onOpen={openNode}
                        onPlay={play}
                        onDownload={handleDownload}
                        onMove={handleMove}
                        onInfo={handleInfo}
                        onRename={startRename}
                        onDelete={handleDelete}
                        registerRef={registerRef}
                      />
                    ),
                  )
                }
              </FolderGrid>
            )}

            {marquee && (
              <div
                className="pointer-events-none absolute z-10 rounded-sm border border-primary/60 bg-primary/15"
                style={marquee}
              />
            )}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="size-4" />
              {t.files.newFolder}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => setSelection(new Set(entries.map((x) => x.path)))}
            >
              {t.files.selectAll}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => triggerDownload(path)}>
              <Download className="size-4" />
              {t.files.downloadZip}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => refetch()}>
              <RefreshCw className="size-4" />
              {t.files.refresh}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      {/* Drag overlay (spring) */}
      {/* width/height auto: dnd-kit otherwise pins the overlay to the dragged
          tile's measured size (104px), which clipped the label mid-word. */}
      <DragOverlay dropAnimation={null} style={{ width: "auto", height: "auto" }}>
        {dragging && (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1, rotate: -2 }}
            transition={SPRING_SNAP}
            className="flex w-max max-w-[260px] items-center gap-2.5 rounded-xl border bg-popover/95 py-2 pl-2 pr-3 shadow-xl backdrop-blur"
          >
            <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {mediaKind(dragging) === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={streamUrl(dragging.path)}
                  alt=""
                  className="size-9 object-cover"
                />
              ) : (
                <EntryIcon node={dragging} className="size-5" />
              )}
            </span>
            {selection.size > 1 && selection.has(dragging.path) ? (
              <span className="whitespace-nowrap text-xs font-medium">
                {t.files.selected(selection.size)}
              </span>
            ) : (
              <span className="line-clamp-2 break-words text-xs font-medium leading-tight">
                {dragging.name}
              </span>
            )}
          </motion.div>
        )}
      </DragOverlay>

      {/* Rename dialog */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.files.renameTitle}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          {/* Only for folders: renaming a real .mp4 to .mp4 is not a joke. */}
          <AnimatePresence initial={false}>
            {renameTarget?.type === "directory" && typedExt && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: DUR.base, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <Folder className="mt-px size-3.5 shrink-0" />
                  {t.files.disguiseHint(typedExt)}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleRename}>{t.files.renameTitle}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.files.newFolder}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            placeholder={t.files.folderName}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleCreateFolder}>{t.files.create}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move: the folder picker, opened on a batch of entries. */}
      {moving && (
        <FolderPicker
          open
          onOpenChange={(o: boolean) => !o && setMoving(null)}
          initialPath={path}
          title={t.files.movePickerTitle}
          confirmLabel={t.files.moveHere}
          onSelect={moveTo}
        />
      )}

      <EntryInfoDialog
        node={infoTarget}
        onClose={() => setInfoTarget(null)}
      />
    </DndContext>
  );
}

// --- Properties -----------------------------------------------------------

/**
 * What an entry is: the panel every file manager has and this one lacked.
 *
 * A folder's size arrives from the server, which walks it on request — the
 * listing cannot know it, and the one place the question is actually asked is
 * here.
 */
function EntryInfoDialog({
  node,
  onClose,
}: {
  node: FileNode | null;
  onClose: () => void;
}) {
  const { t, intl } = useI18n();
  const { data, isLoading } = useEntryInfo(node?.path ?? null);
  const shown = data?.node ?? node;

  const folder = node?.path.split("/").slice(0, -1).join("/");
  const ext = node ? extensionOf(node.name) : "";

  return (
    <Dialog open={node !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">{node?.name}</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <Property label={t.files.infoKind}>
            {node?.type === "directory"
              ? t.files.infoKindFolder
              : t.files.infoKindFile(ext.replace(".", "").toUpperCase())}
          </Property>
          <Property label={t.files.infoSize}>
            {/* A folder has to be walked, so it shows a placeholder until the
                answer comes back rather than a misleading dash. */}
            {isLoading && node?.type === "directory"
              ? t.common.loading
              : formatBytes(shown?.sizeBytes, intl)}
          </Property>
          {data?.contents && (
            <Property label={t.files.infoContents}>
              {t.files.infoContentsValue(
                data.contents.files,
                data.contents.folders,
              )}
            </Property>
          )}
          <Property label={t.files.infoModified}>
            {shown ? formatDate(shown.modifiedAt, intl) : "—"}
          </Property>
          <Property label={t.files.infoLocation}>
            {folder || t.files.infoLocationRoot}
          </Property>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Property({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
