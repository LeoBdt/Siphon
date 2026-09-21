"use client";

import { useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { MAX_DISPLAY_NAME } from "@app/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { useAuthState, useUpdateProfile } from "@/lib/hooks";

/**
 * One's own name.
 *
 * Everyone has this card, administrators included — being an administrator is
 * a role, not an identity, and an instance where the only account is called
 * "admin" ends up sending invitations signed by nobody.
 */
export function ProfileCard() {
  const { t, errorMessage } = useI18n();
  const { data: auth } = useAuthState();
  const save = useUpdateProfile();
  const p = t.settings.profile;

  const stored = auth?.user?.displayName ?? "";
  const [name, setName] = useState(stored);
  // The field is a draft until saved, but it must follow the account it is
  // showing: the query resolves after the first render, so the input would
  // otherwise stay empty on a profile that has a name. Adjusted during render
  // rather than in an effect — React re-renders before painting, so nothing
  // flickers, and there is no second pass to chase.
  const [syncedFrom, setSyncedFrom] = useState(stored);
  if (syncedFrom !== stored) {
    setSyncedFrom(stored);
    setName(stored);
  }

  const dirty = name.trim() !== stored;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-primary" />
          {p.title}
        </CardTitle>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="display-name" className="text-sm font-medium">
            {p.displayName}
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="display-name"
              value={name}
              maxLength={MAX_DISPLAY_NAME}
              placeholder={p.displayNamePlaceholder}
              onChange={(e) => setName(e.target.value)}
              className="h-9 sm:max-w-xs"
            />
            <Button
              className="h-9"
              disabled={!dirty || save.isPending}
              onClick={() =>
                save.mutate(name.trim() || null, {
                  onSuccess: () => toast.success(p.saved),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {p.save}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{p.displayNameHint}</p>
        </div>

        {/* Shown but not editable: it is what they type to sign in, and
            changing it is an administrator's decision, not a preference. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{p.username}</span>
          <code className="w-fit rounded-md bg-muted px-2 py-1 text-sm">
            {auth?.user?.username ?? "—"}
          </code>
          <p className="text-xs text-muted-foreground">{p.usernameHint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
