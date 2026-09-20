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
  ChevronRight,
  Download,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  Home,
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
  useFiles,
  useMoveEntry,
} from "@/lib/hooks";
import { downloadUrl, streamUrl } from "@/lib/api";
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
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

type MediaKind = "video" | "audio" | "image" | null;

const ACTIVE_STATUSES = [
  "queued",
  "fetching-info",
  "downloading",
  "processing",
];

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
/** Where the implosion sits inside WINK_TRANSITION (0.76 x 1.5s). */
const IMPLOSION_MS = 1140;

const WINK_TRANSITION = {
  duration: 1.5,
  // Linear: the pacing lives entirely in WINK_TIMES.
  ease: "linear" as const,
  times: WINK_TIMES,
};

function intersects(a: Rect, b: DOMRect): boolean {
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
  registerRef,
  selectionCount,
  wink,
  costumeHidden,
  settling,
}: {
  node: FileNode;
  selected: boolean;
  onSelect: (n: FileNode, e: React.MouseEvent) => void;
  onOpen: (n: FileNode) => void;
  onRename: (n: FileNode) => void;
  onDelete: (n: FileNode) => void;
  onPlay: (n: FileNode) => void;
  onDownload: (n: FileNode) => void;
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

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <motion.div
            // Suspended right after a rename. The tile remounts under its new
            // path at a new spot in the alphabetical order, and animating that
            // arrival made it slide in from the side — which says nothing about
            // what happened. It reappears in place instead, and layout
            // animation resumes for moves and deletions.
            layout={!wink && !settling}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={wink ? WINK_ANIMATION : { opacity: 1, scale: 1 }}
            transition={
              wink ? WINK_TRANSITION : { duration: DUR.base, ease: EASE_OUT }
            }
            ref={setRefs}
            {...listeners}
            {...attributes}
            data-selected={selected || undefined}
            onClick={(e: React.MouseEvent) => onSelect(node, e)}
            onDoubleClick={() => onOpen(node)}
            className={cn(
              "group relative flex cursor-default flex-col items-center gap-2 rounded-xl border border-transparent p-3 transition-colors",
              selected
                ? "border-primary/40 bg-primary/10"
                : "hover:bg-muted",
              isOver &&
                isDir &&
                "border-primary bg-primary/10 ring-2 ring-primary/40",
              isDragging && "opacity-40",
            )}
          />
        }
      >
        <div className="relative flex size-14 items-center justify-center">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={streamUrl(node.path)}
              alt=""
              className="size-14 rounded-md object-cover"
            />
          ) : (
            <EntryIcon
              node={node}
              className="size-11"
              asPlainFolder={costumeHidden}
            />
          )}
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
          <span className="text-[10px] text-muted-foreground">
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
        {!bulk && (
          <ContextMenuItem onClick={() => onRename(node)}>
            <Pencil className="size-4" />
            {t.files.rename}
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

// --- In-flight download tile ----------------------------------------------

/**
 * A placeholder for a download landing in the folder being viewed. The real
 * file does not exist yet (yt-dlp is still writing `.part` fragments, which the
 * API hides), so this stands in for it and disappears when the job completes
 * and the listing refreshes.
 */
function DownloadingTile({ job }: { job: DownloadJob }) {
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DUR.base, ease: EASE_OUT }}
      className="relative flex cursor-default flex-col items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3"
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
      <span className="text-[10px] tabular-nums text-primary">
        {determinate ? `${pct}%` : t.files.downloadingHere}
      </span>
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
  const { data, isLoading, isFetching, refetch } = useFiles(path);
  const { data: jobs } = useDownloads();
  const move = useMoveEntry();
  const createFolder = useCreateFolder();
  const del = useDeleteEntry();
  const { playAudio, playVideo } = usePlayer();

  const [dragging, setDragging] = useState<FileNode | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
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

  const entries = useMemo(() => data?.entries ?? [], [data]);

  const entriesByName = useMemo(
    () => new Map(entries.map((e) => [e.name, e])),
    [entries],
  );

  /**
   * The entry a job produced.
   *
   * Filename first, then the video id as a fallback. The id earns its place:
   * yt-dlp appends it to every output name, it is plain ASCII, and it survives
   * cases where the recorded path and the real filename drift apart — which
   * rows written before the encoding fix still do.
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

  /** Downloads aimed at the folder on screen, newest first. */
  const jobsHere = useMemo(
    () =>
      (jobs ?? []).filter(
        (j) => !j.isPlaylistParent && (j.destPath ?? "") === path,
      ),
    [jobs, path],
  );

  /**
   * One ordered list of tiles: folders first, then files and downloads
   * interleaved by name.
   *
   * A download and the file it produces share a single tile, keyed by the job.
   * That tile starts as a progress placeholder and simply swaps its contents
   * for the real entry once the listing catches up — so the download turns
   * into the file, in place, instead of a second square appearing beside it.
   *
   * Placeholders are sorted where the finished file will land — yt-dlp names
   * the output after the video title — so nothing jumps at the swap.
   */
  const tiles = useMemo<Tile[]>(() => {
    const collator = new Intl.Collator(intl, { sensitivity: "base" });
    const claimed = new Set<string>();
    const files: Tile[] = [];

    for (const job of jobsHere) {
      const entry = matchingEntry(job);

      if (entry && !claimed.has(entry.path)) {
        // The file has landed: the job's tile becomes that file.
        claimed.add(entry.path);
        files.push({ key: `job:${job.id}`, sortAs: entry.name, node: entry });
      } else if (ACTIVE_STATUSES.includes(job.status)) {
        files.push({ key: `job:${job.id}`, sortAs: job.title ?? "", job });
      } else if (job.status === "completed" && job.outputFile) {
        // Finished, but not in the listing yet. Hold the placeholder so the
        // grid does not reflow twice while the refetch is in flight — with a
        // time limit, in case the file was moved or deleted behind our back.
        // eslint-disable-next-line react-hooks/purity
        const age = Date.now() - new Date(job.updatedAt).getTime();
        if (age < 15_000) {
          files.push({ key: `job:${job.id}`, sortAs: job.title ?? "", job });
        }
      }
    }

    for (const e of entries) {
      if (e.type === "directory" || claimed.has(e.path)) continue;
      files.push({ key: e.path, sortAs: e.name, node: e });
    }
    files.sort((a, b) => collator.compare(a.sortAs, b.sortAs));

    return [
      ...entries
        .filter((e) => e.type === "directory")
        .map((node) => ({ key: node.path, sortAs: node.name, node })),
      ...files,
    ];
  }, [entries, jobsHere, intl, matchingEntry]);

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
  const marqueeStart = useRef<{ x: number; y: number; base: Set<string> } | null>(
    null,
  );
  /**
   * Tile boxes, measured once when the drag starts. Re-measuring all of them on
   * every pointermove forced a layout each frame, which is what made the
   * marquee stutter — they cannot move while the drag is in progress anyway.
   */
  const tileBoxes = useRef<[string, DOMRect][]>([]);
  /** Latest pointer position, applied at most once per animation frame. */
  const pendingFrame = useRef<number | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  function onSurfacePointerDown(e: React.PointerEvent) {
    // Only start on empty space. Both the scrolling box and the grid inside it
    // carry `data-selection-surface`, because the gap to the right of the last
    // tile in a row belongs to the grid, not to the scroller — testing against
    // `currentTarget` alone made the marquee almost impossible to trigger.
    // A pointer-down on a tile has no such attribute and belongs to dnd-kit.
    const el = e.target as HTMLElement;
    if (e.button !== 0 || !el.hasAttribute("data-selection-surface")) return;
    const additive = e.ctrlKey || e.metaKey;
    marqueeStart.current = {
      x: e.clientX,
      y: e.clientY,
      base: additive ? new Set(selection) : new Set(),
    };
    if (!additive) {
      setSelection(new Set());
      anchorRef.current = null;
    }
    tileBoxes.current = [...tileRefs.current].map(([p, el]) => [
      p,
      el.getBoundingClientRect(),
    ]);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onSurfacePointerMove(e: React.PointerEvent) {
    const start = marqueeStart.current;
    if (!start) return;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    if (pendingFrame.current !== null) return;

    const host = e.currentTarget;
    // One update per frame: pointermove fires far more often than the screen
    // refreshes, and every update re-renders the grid.
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      const p = lastPointer.current;
      const s = marqueeStart.current;
      if (!p || !s) return;

      const rect: Rect = {
        left: Math.min(s.x, p.x),
        right: Math.max(s.x, p.x),
        top: Math.min(s.y, p.y),
        bottom: Math.max(s.y, p.y),
      };

      // Hit-testing is in viewport coordinates; the overlay lives inside the
      // scrolling box, so translate once here.
      const box = host.getBoundingClientRect();
      setMarquee({
        left: rect.left - box.left + host.scrollLeft,
        top: rect.top - box.top + host.scrollTop,
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
        prev.size === hit.size && [...hit].every((x) => prev.has(x))
          ? prev
          : hit,
      );
    });
  }

  function endMarquee(e: React.PointerEvent) {
    if (!marqueeStart.current) return;
    marqueeStart.current = null;
    if (pendingFrame.current !== null) {
      cancelAnimationFrame(pendingFrame.current);
      pendingFrame.current = null;
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
   * Both handlers above necessarily change identity whenever the selection
   * does. Handing them straight to the tiles would re-render every tile on
   * every frame of a marquee drag, which is exactly what `memo` on EntryTile is
   * there to prevent. These thin wrappers never change identity and read the
   * current version through a ref, so a tile's props only change when that
   * tile's own selected state does.
   */
  const latest = useRef({ runDelete, runDownload });
  useEffect(() => {
    latest.current = { runDelete, runDownload };
  }, [runDelete, runDownload]);

  const handleDelete = useCallback(
    (n?: FileNode) => latest.current.runDelete(n),
    [],
  );
  const handleDownload = useCallback(
    (n?: FileNode) => latest.current.runDownload(n),
    [],
  );

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
              className="overflow-hidden border-b bg-primary/5"
            >
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1 text-sm font-medium">
                  {t.files.selected(selection.size)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => handleDownload()}>
                  <Download className="size-4" />
                  {t.files.download}
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
            ) : (
              <div
                data-selection-surface=""
                className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1"
              >
                <AnimatePresence mode="popLayout">
                  {tiles.map((tile) =>
                    tile.job ? (
                      <DownloadingTile key={tile.key} job={tile.job} />
                    ) : (
                      <EntryTile
                        key={tile.key}
                        node={tile.node}
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
                        onRename={startRename}
                        onDelete={handleDelete}
                        registerRef={registerRef}
                      />
                    ),
                  )}
                </AnimatePresence>
              </div>
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
    </DndContext>
  );
}
