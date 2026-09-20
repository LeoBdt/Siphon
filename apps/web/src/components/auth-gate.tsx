"use client";

import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthScreen } from "@/components/auth-screen";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { useAuthState, useDismissNotice, useLogin, useSetup } from "@/lib/hooks";

/**
 * Nothing is reachable before this resolves: the app either needs its first
 * administrator, needs someone to sign in, or lets the rest render.
 *
 * Done on the client rather than in middleware because the whole interface is
 * client-rendered anyway, and a redirect would only add a round trip.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t, errorMessage } = useI18n();
  const { data, isPending } = useAuthState();
  const login = useLogin();
  const setup = useSetup();
  const dismiss = useDismissNotice();

  // A folder that silently stopped being private deserves to be said out loud.
  const notice = data?.notice;
  useEffect(() => {
    if (!notice) return;
    if (notice === "privacy_revoked") toast.warning(t.auth.privacyRevoked);
    dismiss.mutate();
    // `dismiss` is stable enough here; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">{t.auth.checking}</span>
      </div>
    );
  }

  if (data?.needsSetup) {
    return (
      <AuthScreen
        mode="setup"
        pending={setup.isPending}
        error={setup.error ? errorMessage(setup.error) : null}
        onSubmit={(c) => setup.mutate(c)}
      />
    );
  }

  if (!data?.user) {
    // The server only says a code is needed once the password checked out, so
    // the field appears at the moment it becomes relevant.
    const needsCode =
      login.error instanceof ApiError &&
      (login.error.code === "totp_required" ||
        login.error.code === "totp_invalid");
    return (
      <AuthScreen
        mode="signIn"
        needsCode={needsCode}
        pending={login.isPending}
        error={login.error ? errorMessage(login.error) : null}
        onSubmit={(c) => login.mutate(c)}
      />
    );
  }

  return <>{children}</>;
}
