"use client";

import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@app/shared";
import { SiphonMark } from "@/components/siphon-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { DUR, EASE_OUT } from "@/lib/motion";

export type AuthMode = "signIn" | "setup" | "invite";

/**
 * The one screen shown before anything else is reachable: signing in, creating
 * the first administrator, or accepting an invitation.
 *
 * It carries its own language switcher — someone who cannot read the form yet
 * cannot go and change the language somewhere behind it.
 */
export function AuthScreen({
  mode,
  groupName,
  pending,
  error,
  needsCode,
  onSubmit,
}: {
  mode: AuthMode;
  /** For an invitation: the group the invitee is joining. */
  groupName?: string | null;
  pending: boolean;
  error?: string | null;
  /** The account has a second factor: ask for the code as well. */
  needsCode?: boolean;
  onSubmit: (credentials: {
    username: string;
    password: string;
    code?: string;
  }) => void;
}) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const copy = {
    signIn: {
      title: t.auth.signInTitle,
      subtitle: t.auth.signInSubtitle,
      submit: t.auth.submitSignIn,
    },
    setup: {
      title: t.auth.setupTitle,
      subtitle: t.auth.setupSubtitle,
      submit: t.auth.submitSetup,
    },
    invite: {
      title: t.auth.inviteTitle,
      subtitle: groupName
        ? t.auth.inviteSubtitle(groupName)
        : t.auth.inviteTitle,
      submit: t.auth.submitInvite,
    },
  }[mode];

  // A new account states the rule up front rather than rejecting afterwards.
  const newAccount = mode !== "signIn";
  const canSubmit =
    !pending &&
    username.trim().length > 0 &&
    (!newAccount || password.length >= MIN_PASSWORD_LENGTH) &&
    (!needsCode || code.trim().length > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) {
      onSubmit({
        username: username.trim(),
        password,
        code: needsCode ? code.trim() : undefined,
      });
    }
  }

  return (
    <div className="dot-grid-subtle flex min-h-svh flex-col items-center justify-center gap-6 px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.panel, ease: EASE_OUT }}
        className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-sm"
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <SiphonMark className="size-5" />
        </span>

        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{copy.subtitle}</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t.auth.username}
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete={newAccount ? "username" : "username"}
              autoFocus
              className="h-10"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t.auth.password}
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete={newAccount ? "new-password" : "current-password"}
              className="h-10"
            />
            {newAccount && (
              <span className="text-xs font-normal text-muted-foreground">
                {t.auth.passwordHint(MIN_PASSWORD_LENGTH)}
              </span>
            )}
          </label>

          {needsCode && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t.auth.code}
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                className="h-10 font-mono tracking-[0.3em]"
              />
              <span className="text-xs font-normal text-muted-foreground">
                {t.auth.codeHint}
              </span>
            </label>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={!canSubmit} className="h-10">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {copy.submit}
          </Button>
        </form>
      </motion.div>

      <LanguageSwitcher />
    </div>
  );
}
