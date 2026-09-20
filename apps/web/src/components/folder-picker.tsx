"use client";

import { useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderPlus,
  Home,
  Loader2,
} from "lucide-react";
import { useCreateFolder, useFiles } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";

function pathSegments(path: string): string[] {
  return path ? path.split("/") : [];
}

export function FolderPicker({
  open,
  onOpenChange,
  initialPath = "",
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialPath?: string;
  onSelect: (path: string) => void;
}) {
  const t = useT();
  const [current, setCurrent] = useState(initialPath);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useFiles(current);
  const createFolder = useCreateFolder();

  const folders = (data?.entries ?? []).filter((e) => e.type === "directory");
  const segments = pathSegments(current);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    await createFolder.mutateAsync({ path: current, name });
    setNewName("");
    setCreating(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dossier de destination</DialogTitle>
        </DialogHeader>

        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button
            onClick={() => setCurrent("")}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted"
          >
            <Home className="size-3.5" />
            Racine
          </button>
          {segments.map((seg, i) => {
            const p = segments.slice(0, i + 1).join("/");
            return (
              <span key={p} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <button
                  onClick={() => setCurrent(p)}
                  className="rounded px-1.5 py-0.5 hover:bg-muted"
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        {/* Folder list */}
        <div className="max-h-64 min-h-32 overflow-auto rounded-lg border">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : folders.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Aucun sous-dossier
            </div>
          ) : (
            <ul className="p-1">
              {folders.map((f) => (
                <li key={f.path}>
                  <button
                    onClick={() => setCurrent(f.path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    )}
                  >
                    <Folder className="size-4 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* New folder inline */}
        {creating ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder={t.files.folderName}
              className="h-8"
            />
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
              {t.files.create}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              {t.common.cancel}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setCreating(true)}
          >
            <FolderPlus className="size-4" />
            Nouveau dossier
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              onSelect(current);
              onOpenChange(false);
            }}
          >
            Choisir ce dossier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
