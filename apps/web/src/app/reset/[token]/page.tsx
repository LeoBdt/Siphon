"use client";

import { use } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { User } from "@app/shared";
import { AuthScreen } from "@/components/auth-screen";
import { useI18n } from "@/components/i18n-provider";
import { apiFetch } from "@/lib/api";
import { useAuthState } from "@/lib/hooks";

interface ResetPreview {
  valid: boolean;
  displayName: string | null;
  username: string | null;
}

/**
 * Setting a password again, from a link.
 *
 * Reachable without a session — it is how someone who cannot sign in gets one
 * — and it reveals nothing but whose account the link opens, so a guessed
 * token is worth nothing.
 *
 * The administrator who issued the link never learns the password chosen here.
 * That is the whole point: handing over a temporary password would mean
 * holding someone else's credentials, on an instance where folders can be
 * private.
 */
export default function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { t, errorMessage } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: auth } = useAuthState();

  const preview = useQuery({
    queryKey: ["reset", token],
    retry: false,
    // Asked once: using the link spends it, and a refetch afterwards would
    // tell the person who just used it that their link is no longer valid.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: () => apiFetch<ResetPreview>(`/api/auth/reset/${token}`),
  });

  const reset = useMutation({
    mutationFn: (password: string) =>
      apiFetch<User>(`/api/auth/reset/${token}`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ["reset", token] });
      await qc.invalidateQueries();
      router.replace("/");
    },
  });

  if (preview.isPending) return null;

  if (!preview.data?.valid && !reset.isSuccess && !reset.isPending) {
    return (
      <div className="dot-grid-subtle flex min-h-svh items-center justify-center px-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {t.auth.resetInvalid}
        </p>
      </div>
    );
  }

  const target = preview.data?.displayName ?? preview.data?.username ?? null;
  const signedInAs = auth?.user
    ? (auth.user.displayName ?? auth.user.username)
    : null;
  // Someone else's session is open in this browser. The link still sets the
  // password of whoever it was issued for — the token decides, never the
  // session — but finishing here swaps the account, and being told beforehand
  // beats discovering it afterwards.
  const otherSession =
    signedInAs !== null &&
    target !== null &&
    auth?.user?.username !== preview.data?.username;

  return (
    <AuthScreen
      mode="reset"
      resetFor={target}
      pending={reset.isPending}
      notice={
        otherSession && signedInAs && target
          ? t.auth.resetOtherSession(signedInAs, target)
          : null
      }
      error={reset.error ? errorMessage(reset.error) : null}
      onSubmit={(c) => reset.mutate(c.password)}
    />
  );
}
