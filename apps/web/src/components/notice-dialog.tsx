"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { UserNotice } from "@app/shared";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { useDismissNotice } from "@/lib/hooks";

/**
 * Something that happened to this account while nobody was looking.
 *
 * A toast was wrong for this: it fades after a few seconds, and someone who
 * had stepped away came back to a folder that had quietly stopped being
 * private with nothing on screen to say so. The server already marks the
 * notice as delivered, so it is shown exactly once — which is only worth
 * anything if that once cannot be missed.
 *
 * Dismissal is sent when the dialog closes rather than when it opens, so
 * closing the tab before reading it leaves the notice waiting for next time.
 */
export function NoticeDialog({ notice }: { notice: UserNotice | null }) {
  const { t } = useI18n();
  const dismiss = useDismissNotice();
  // Derived rather than synchronised by an effect: the dialog is open exactly
  // when there is a notice that has not been closed yet. An effect copying the
  // prop into state would render once with the wrong value and then again.
  const [closed, setClosed] = useState(false);
  const open = Boolean(notice) && !closed;

  if (!notice) return null;

  const copy =
    notice === "privacy_revoked"
      ? {
          title: t.auth.privacyRevokedTitle,
          body: t.auth.privacyRevoked,
        }
      : null;
  if (!copy) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        setClosed(true);
        dismiss.mutate();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
            {copy.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        <DialogFooter>
          <Button onClick={() => { setClosed(true); dismiss.mutate(); }}>{t.auth.understood}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
