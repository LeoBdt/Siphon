"use client";

import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { MAX_DISPLAY_NAME, MIN_PASSWORD_LENGTH } from "@app/shared";
import { SiphonMark } from "@/components/siphon-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { DUR, EASE_OUT } from "@/lib/motion";

export type AuthMode = "signIn" | "setup" | "invite" | "reset";

/**
 * The one screen shown before anything else is reachable: signing in, creating
 * the first administrator, or accepting an invitation.
 *
 * It carries its own language switcher — someone who cannot read the form yet
 * cannot go and change the language somewhere behind it.
 */
export function AuthScreen({
  mode,
  greeting,
  invitedName,
  resetFor,
  pending,
  error,
  notice,
  needsCode,
  onSubmit,
}: {
  mode: AuthMode;
  /** For an invitation: who is inviting, already phrased. */
  greeting?: string | null;
  /** For an invitation: the name it was addressed to, to start them off. */
  invitedName?: string | null;
  /** For a reset link: whose account it opens, so they can be sure. */
  resetFor?: string | null;
  pending: boolean;
  error?: string | null;
  /** Something the person should read before submitting, but not a failure. */
  notice?: string | null;
  /** The account has a second factor: ask for the code as well. */
  needsCode?: boolean;
  onSubmit: (credentials: {
    username: string;
    password: string;
    displayName?: string;
    code?: string;
  }) => void;
}) {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // Prefilled from the invitation when it was addressed to someone: they can
  // change it, but being greeted by name and then asked for it again is a
  // small insult.
  const [displayName, setDisplayName] = useState(invitedName ?? "");

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
    reset: {
      title: t.auth.resetTitle,
      subtitle: resetFor
        ? t.auth.resetSubtitleFor(resetFor)
        : t.auth.resetSubtitle,
      submit: t.auth.submitReset,
    },
    invite: {
      // The greeting, when the invitation carries one, replaces the generic
      // title: "Alice, Leo invites you to Siphon" says everything the heading
      // and the subtitle were saying separately.
      title: greeting ?? t.auth.inviteTitle,
      subtitle: t.auth.inviteSubtitle,
      submit: t.auth.submitInvite,
    },
  }[mode];

  // A reset knows whose account it is from the link, so it asks one thing.
  const resetting = mode === "reset";
  // A new account states the rule up front rather than rejecting afterwards.
  const newAccount = mode === "setup" || mode === "invite";
  const canSubmit =
    !pending &&
    (resetting || username.trim().length > 0) &&
    (newAccount || resetting ? password.length >= MIN_PASSWORD_LENGTH : true) &&
    (!needsCode || code.trim().length > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) {
      onSubmit({
        username: username.trim(),
        password,
        displayName: newAccount ? displayName.trim() || undefined : undefined,
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

        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{copy.subtitle}</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          {/* Asked for first, because it is the question a person answers
              without thinking. The username below is a handle, and saying so
              here stops people from putting their name in it. */}
          {newAccount && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t.auth.displayName}
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={MAX_DISPLAY_NAME}
                autoComplete="name"
                placeholder={t.auth.displayNamePlaceholder}
                className="h-10"
              />
              <span className="text-xs font-normal text-muted-foreground">
                {t.auth.displayNameHint}
              </span>
            </label>
          )}

          {/* A reset link already names its account; asking for the username
              again would only be a chance to get it wrong. */}
          {!resetting && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t.auth.username}
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus={!newAccount}
                className="h-10"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {resetting ? t.auth.newPassword : t.auth.password}
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete={
                newAccount || resetting ? "new-password" : "current-password"
              }
              autoFocus={resetting}
              className="h-10"
            />
            {(newAccount || resetting) && (
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

          {notice && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
              {notice}
            </p>
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
