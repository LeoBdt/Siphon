"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { InvitePreview, User } from "@app/shared";
import { AuthScreen } from "@/components/auth-screen";
import { useI18n } from "@/components/i18n-provider";
import { apiFetch } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Accepting an invitation.
 *
 * Reachable without a session — it is how someone gets one — and it reveals
 * nothing but the group name, so a guessed token leaks no account details.
 */
export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { t, errorMessage } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();

  const preview = useQuery({
    queryKey: ["invite", token],
    retry: false,
    // Asked once. Accepting spends the invitation, so a refetch afterwards
    // correctly answers "no longer valid" — and for a moment the page said so
    // to the very person who had just used it, before the redirect landed.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: () => apiFetch<InvitePreview>(`/api/auth/invite/${token}`),
  });

  const accept = useMutation({
    mutationFn: (body: {
      username: string;
      password: string;
      displayName?: string;
    }) =>
      apiFetch<User>(`/api/auth/invite/${token}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      // Everything on screen was fetched as nobody; the invitation's own
      // preview is dropped rather than refetched, since it is spent.
      qc.removeQueries({ queryKey: ["invite", token] });
      await qc.invalidateQueries();
      router.replace("/");
    },
  });

  if (preview.isPending) return null;

  // Once it has been accepted the verdict no longer applies to this visitor —
  // they are on their way in.
  if (!preview.data?.valid && !accept.isSuccess && !accept.isPending) {
    return (
      <div className="dot-grid-subtle flex min-h-svh items-center justify-center px-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {t.auth.inviteInvalid}
        </p>
      </div>
    );
  }

  // Four ways this can read, and none of them invents a name: addressed to
  // someone by an administrator who has one, by one who has not, to nobody in
  // particular, or to nobody by nobody — in which case the screen falls back
  // to its own title.
  const label = preview.data?.label ?? null;
  const invitedBy = preview.data?.invitedBy ?? null;
  const greeting =
    label && invitedBy
      ? t.auth.invitedByNamed(label, invitedBy)
      : invitedBy
        ? t.auth.invitedBy(invitedBy)
        : label
          ? t.auth.invitedNamed(label)
          : null;

  return (
    <AuthScreen
      mode="invite"
      greeting={greeting}
      invitedName={label}
      pending={accept.isPending}
      error={accept.error ? errorMessage(accept.error) : null}
      onSubmit={(c) => accept.mutate(c)}
    />
  );
}
