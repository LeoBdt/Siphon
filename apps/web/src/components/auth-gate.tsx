"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AuthScreen } from "@/components/auth-screen";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import { NoticeDialog } from "@/components/notice-dialog";
import { useAuthState, useLogin, useSetup } from "@/lib/hooks";

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

  return (
    <>
      {/* Rendered inside the app rather than over the sign-in screen: the
          notice is about this account's folder, so it belongs where the person
          can act on it. */}
      <NoticeDialog notice={data.notice ?? null} />
      {children}
    </>
  );
}
