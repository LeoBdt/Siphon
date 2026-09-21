"use client";

import { useState } from "react";
import { EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/components/i18n-provider";
import { MIN_PASSWORD_LENGTH } from "@app/shared";
import {
  useAuthState,
  useChangePassword,
  useSetPrivateFolder,
  useTotpDisable,
  useTotpEnable,
  useTotpSetup,
} from "@/lib/hooks";

/**
 * The two settings that belong to the person rather than the instance: their
 * second factor, and whether their folder is hidden from other members.
 */

export function SecondFactorCard() {
  const { t, errorMessage } = useI18n();
  const { data: auth } = useAuthState();
  const setup = useTotpSetup();
  const enable = useTotpEnable();
  const disable = useTotpDisable();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const s = t.settings.security;
  const on = auth?.user?.totpEnabled;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          {s.title}
        </CardTitle>
        <CardDescription>{s.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {on ? (
          <>
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {s.enabled}
            </p>
            <p className="text-xs text-muted-foreground">{s.disableHint}</p>
            <div className="flex flex-wrap gap-2">
              <PasswordInput
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                className="h-9"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!password || disable.isPending}
                onClick={() =>
                  disable.mutate(password, {
                    onSuccess: () => {
                      setPassword("");
                      toast.success(s.turnedOff);
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                {disable.isPending && <Loader2 className="size-4 animate-spin" />}
                {s.disable}
              </Button>
            </div>
          </>
        ) : setup.data ? (
          <>
            <p className="text-xs text-muted-foreground">{s.secretHint}</p>
            {/*
              The secret as text rather than a QR code: rendering one would
              mean a barcode library for a field every authenticator app also
              accepts by hand.
            */}
            <code className="rounded-lg border bg-muted/40 px-3 py-2 text-sm break-all">
              {setup.data.secret}
            </code>
            <div className="flex flex-wrap gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                className="h-9 max-w-[10rem] font-mono tracking-[0.3em]"
              />
              <Button
                size="sm"
                disabled={code.length < 6 || enable.isPending}
                onClick={() =>
                  enable.mutate(code, {
                    onSuccess: () => {
                      setCode("");
                      toast.success(s.turnedOn);
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                {enable.isPending && <Loader2 className="size-4 animate-spin" />}
                {s.confirm}
              </Button>
            </div>
          </>
        ) : (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={setup.isPending}
              onClick={() =>
                setup.mutate(undefined, {
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {setup.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {s.start}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Changing one's own password.
 *
 * The current one is asked for although the session already proves who this
 * is: a session can be a borrowed laptop, and knowing the password is what
 * distinguishes its owner from whoever sat down at it. Until this existed, an
 * administrator could change everyone's password except their own.
 */
export function PasswordCard() {
  const { t, errorMessage } = useI18n();
  const change = useChangePassword();
  const p = t.settings.password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const ready = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          {p.title}
        </CardTitle>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {p.current}
          <PasswordInput
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            containerClassName="sm:max-w-xs"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {p.new}
          <PasswordInput
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            containerClassName="sm:max-w-xs"
          />
          <span className="text-xs font-normal text-muted-foreground">
            {t.auth.passwordHint(MIN_PASSWORD_LENGTH)}
          </span>
        </label>
        <Button
          size="sm"
          className="self-start"
          disabled={!ready || change.isPending}
          onClick={() =>
            change.mutate(
              { currentPassword: current, newPassword: next },
              {
                onSuccess: () => {
                  setCurrent("");
                  setNext("");
                  toast.success(p.changed);
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          {change.isPending && <Loader2 className="size-4 animate-spin" />}
          {p.submit}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function PrivateFolderCard() {
  const { t, errorMessage } = useI18n();
  const { data: auth } = useAuthState();
  const save = useSetPrivateFolder();

  const user = auth?.user;
  const allowed = user?.effective.canHavePrivateFolder;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EyeOff className="size-4 text-primary" />
          {t.settings.privacy.title}
        </CardTitle>
        <CardDescription>{t.settings.privacy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {allowed ? (
          <Segmented<"on" | "off">
            id="private-folder"
            ariaLabel={t.settings.privacy.title}
            value={user?.privateFolder ? "on" : "off"}
            onChange={(next) =>
              save.mutate(next === "on", {
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
            options={[
              { value: "on", label: t.settings.ytdlp.on },
              { value: "off", label: t.settings.ytdlp.off },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.settings.privacy.unavailable}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
