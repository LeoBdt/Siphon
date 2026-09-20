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
    queryFn: () => apiFetch<InvitePreview>(`/api/auth/invite/${token}`),
  });

  const accept = useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      apiFetch<User>(`/api/auth/invite/${token}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      router.replace("/");
    },
  });

  if (preview.isPending) return null;

  if (!preview.data?.valid) {
    return (
      <div className="dot-grid-subtle flex min-h-svh items-center justify-center px-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {t.auth.inviteInvalid}
        </p>
      </div>
    );
  }

  return (
    <AuthScreen
      mode="invite"
      groupName={preview.data.groupName}
      pending={accept.isPending}
      error={accept.error ? errorMessage(accept.error) : null}
      onSubmit={(c) => accept.mutate(c)}
    />
  );
}
