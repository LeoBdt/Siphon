"use client";

import type {
  Group,
  PermissionOverrides,
  Permissions,
} from "@app/shared";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useSettings } from "@/lib/hooks";
import { groupName } from "@/lib/groups";
import { cn } from "@/lib/utils";

/**
 * The boolean permissions, in the order they are worth reading: what you can
 * do with a download, then with files, then with the instance itself.
 */
export const FLAGS = [
  "canDownload",
  "canKeepInLibrary",
  "canManageFiles",
  "canHavePrivateFolder",
  "canBrowseWholeLibrary",
  "canManageSettings",
  "canManageEngine",
  "isAdmin",
] as const;

export type Flag = (typeof FLAGS)[number];

/** Permissions that deserve a line of explanation under their label. */
const HINTS: Partial<Record<Flag, "canManageEngineHint" | "isAdminHint">> = {
  canManageEngine: "canManageEngineHint",
  isAdmin: "isAdminHint",
};

type Tri = "inherit" | "allow" | "deny";

function triOf(value: boolean | null | undefined): Tri {
  if (value === null || value === undefined) return "inherit";
  return value ? "allow" : "deny";
}

function valueOf(tri: Tri): boolean | null {
  return tri === "inherit" ? null : tri === "allow";
}

/**
 * One permission, as three mutually exclusive choices.
 *
 * A checkbox can only say yes or no, so once anyone had touched one there was
 * no way back to the group's value — the override was written and stayed
 * written. Worse, the interface showed the resulting state with a small "from
 * group" note, which said where a value came from but never which value that
 * was. Here the inherited option carries the group's name and its answer, so
 * "Inherited — Members: allowed" is readable without knowing the model.
 */
function TriControl({
  value,
  inheritLabel,
  disabled,
  onChange,
}: {
  value: Tri;
  inheritLabel: string;
  disabled?: boolean;
  onChange: (next: Tri) => void;
}) {
  const { t } = useI18n();
  const u = t.settings.users;
  const options: { key: Tri; label: string }[] = [
    { key: "inherit", label: inheritLabel },
    { key: "allow", label: u.tri.allow },
    { key: "deny", label: u.tri.deny },
  ];

  return (
    <div
      role="radiogroup"
      className={cn(
        // A fixed grid rather than three buttons sized by their labels: the
        // inherited option's text changes from row to row, and with it the
        // whole control's width, so no two rows lined up.
        "grid h-9 w-[20rem] shrink-0 grid-cols-[1.7fr_1fr_1fr] gap-0.5 rounded-lg border bg-muted/40 p-0.5",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            className={cn(
              "flex items-center justify-center rounded-md px-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150",
              active
                ? opt.key === "deny"
                  ? "bg-destructive/15 text-destructive"
                  : opt.key === "allow"
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "bg-background text-foreground shadow-sm"
                // Not muted: these are three choices being compared, and the
                // two not taken still have to be readable enough to pick.
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The permission list for one person, laid over their group's defaults.
 *
 * Used only for a user: a group has no inheritance, so it gets the simpler
 * grid below.
 */
export function UserPermissionGrid({
  group,
  overrides,
  /** What actually applies, once the group and the overrides are resolved. */
  effective,
  disabled,
  onChange,
}: {
  group: Group | undefined;
  overrides: PermissionOverrides;
  effective: Permissions;
  disabled?: boolean;
  onChange: (flag: Flag, value: boolean | null) => void;
}) {
  const { t } = useI18n();
  const u = t.settings.users;
  // An administrator holds every permission, whatever each row is set to —
  // that is what the role means, and the server resolves it that way. The
  // rows used to keep showing "Inherited (refused)" beside a person who could
  // do the thing anyway, which is the interface contradicting the system.
  const isAdmin = effective.isAdmin;

  return (
    <div className="flex flex-col">
      {/* Said once here rather than on every row: repeating the group's name
          eight times was what squeezed the permission labels into two lines
          each. */}
      {isAdmin ? (
        <p className="mb-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground">
          {u.permissions.adminGrants}
        </p>
      ) : (
        group && (
          <p className="pb-2 text-xs text-muted-foreground">
            {u.tri.fromGroup(groupName(group, t))}
          </p>
        )
      )}
      <div className="flex flex-col divide-y">
        {FLAGS.map((flag) => {
          const inherited = Boolean(group?.permissions[flag]);
          const hint = HINTS[flag];
          // The administrator row stays live: it is the one that can be
          // turned off. The rest follow from it and are shown as granted.
          const held = isAdmin && flag !== "isAdmin";
          return (
            <div
              key={flag}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
            >
              <div className="flex min-w-40 flex-1 flex-col">
                <span className="text-sm">{u.permissions[flag]}</span>
                {hint && (
                  <span className="text-xs text-muted-foreground">
                    {u.permissions[hint]}
                  </span>
                )}
              </div>
              {held ? (
                <span className="shrink-0 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {u.tri.allow}
                </span>
              ) : (
                <TriControl
                  value={triOf(overrides[flag])}
                  disabled={disabled}
                  inheritLabel={
                    group
                      ? u.tri.inheritedValue(inherited ? u.tri.yes : u.tri.no)
                      : u.tri.inherit
                  }
                  onChange={(next) => onChange(flag, valueOf(next))}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** The permissions that are a quantity rather than a yes or no. */
export const LIMITS = [
  "quotaBytes",
  "maxFileSizeBytes",
  "maxConcurrentDownloads",
] as const;

export type Limit = (typeof LIMITS)[number];

/** Sizes are set in gigabytes; the model counts bytes. */
const GB = 1024 ** 3;

function toDisplay(limit: Limit, bytes: number): number {
  return limit === "maxConcurrentDownloads"
    ? bytes
    : Math.round((bytes / GB) * 100) / 100;
}

function fromDisplay(limit: Limit, value: number): number {
  return limit === "maxConcurrentDownloads" ? Math.max(1, Math.round(value)) : value * GB;
}

/**
 * The figure itself, editable like a text field.
 *
 * It holds what is typed rather than the stored number, because a field that
 * is always a valid number cannot be emptied: replacing 1 with 2 meant typing
 * the 2 beside the 1 and then deleting the 1. Nonsense is simply not
 * committed — an empty field leaves the last accepted value in place, and the
 * field is put back in step when it loses focus.
 */
function LimitInput({
  limit,
  value,
  max,
  onCommit,
}: {
  limit: Limit;
  value: number;
  /** A ceiling the field itself refuses to cross, in display units. */
  max?: number;
  onCommit: (displayValue: number) => void;
}) {
  const [text, setText] = useState(String(toDisplay(limit, value)));
  const [editedFrom, setEditedFrom] = useState(value);
  if (editedFrom !== value) {
    // The account was saved elsewhere: follow it, unless it is being typed in.
    setEditedFrom(value);
    setText(String(toDisplay(limit, value)));
  }

  return (
    <input
      // A number field, so the arrows and the keyboard step it — by a tenth
      // of a gigabyte, the granularity anyone setting a quota thinks in —
      // while the value is held as text so the field can be emptied.
      type="number"
      min={limit === "maxConcurrentDownloads" ? 1 : 0.1}
      max={max}
      step={limit === "maxConcurrentDownloads" ? 1 : 0.1}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const n = Number(next.replace(",", "."));
        // Clamped rather than refused: typing 20 into a field that stops at 8
        // should leave 8, not an error and a number nobody can act on.
        if (next.trim() !== "" && Number.isFinite(n) && n > 0) {
          onCommit(max != null ? Math.min(n, max) : n);
        }
      }}
      onBlur={() => setText(String(toDisplay(limit, value)))}
      className="h-9 w-24 rounded-md border bg-background px-2.5 text-sm tabular-nums"
    />
  );
}

/**
 * A numeric limit, with the same three states as a permission: inherited,
 * unlimited, or a figure set here.
 *
 * "Unlimited" is a real answer rather than an empty field, because an empty
 * field is ambiguous — it could mean no limit, or mean the person has not
 * finished typing.
 */
function LimitRow({
  limit,
  value,
  inheritedValue,
  groupName,
  instanceLimit,
  onChange,
}: {
  limit: Limit;
  /** undefined = inherit, null = unlimited, number = this figure. */
  value: number | null | undefined;
  inheritedValue: number | null;
  groupName: string | undefined;
  /** How many downloads this instance runs at once — a ceiling on anyone's. */
  instanceLimit: number;
  onChange: (next: number | null | undefined) => void;
}) {
  const { t, intl } = useI18n();
  const u = t.settings.users;
  const unit = limit === "maxConcurrentDownloads" ? u.limits.unitCount : u.limits.unitGb;
  const state: "inherit" | "unlimited" | "set" =
    value === undefined ? "inherit" : value === null ? "unlimited" : "set";

  /**
   * Simultaneous downloads can never be unlimited.
   *
   * The queue runs a fixed number at once whatever anyone is granted, so
   * "unlimited" was a promise the machine does not keep. There are two honest
   * states: take the instance's figure, or set a lower one.
   */
  const noUnlimited = limit === "maxConcurrentDownloads";

  const describe = (v: number | null) =>
    v === null
      ? noUnlimited
        ? u.limits.instanceValue(instanceLimit)
        : u.limits.unlimited
      : limit === "maxConcurrentDownloads"
        ? String(v)
        : `${new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(v / GB)} ${u.limits.unitGb}`;

  return (
    // The label above, the controls below — rather than beside, where three
    // buttons and a number field could not fit on one line and wrapped into a
    // staircase: "Unlimited" on the right, the figure underneath it.
    <div className="flex flex-col gap-2 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm">{u.limits[limit]}</span>
        <span className="text-xs text-muted-foreground">
          {u.limits[`${limit}Hint` as const]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          className={cn(
            "grid h-9 w-[20rem] shrink-0 gap-0.5 rounded-lg border bg-muted/40 p-0.5",
            noUnlimited ? "grid-cols-[1.7fr_1fr]" : "grid-cols-[1.7fr_1fr_1fr]",
          )}
        >
          {(
            [
              {
                key: "inherit" as const,
                label: groupName
                  ? u.tri.inheritedValue(describe(inheritedValue))
                  : u.tri.inherit,
              },
              ...(noUnlimited
                ? []
                : [{ key: "unlimited" as const, label: u.limits.unlimited }]),
              { key: "set" as const, label: u.limits.custom },
            ]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={state === opt.key}
              onClick={() =>
                onChange(
                  opt.key === "inherit"
                    ? undefined
                    : opt.key === "unlimited"
                      ? null
                      : // Start from whatever is inherited, so the field is
                        // never a meaningless zero.
                        (inheritedValue ?? fromDisplay(limit, limit === "maxConcurrentDownloads" ? 2 : 5)),
                )
              }
              className={cn(
                "flex items-center justify-center rounded-md px-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150",
                state === opt.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {state === "set" && (
          <span className="flex items-center gap-1">
            <LimitInput
              limit={limit}
              value={value as number}
              max={noUnlimited ? instanceLimit : undefined}
              onCommit={(n) => onChange(fromDisplay(limit, n))}
            />
            <span className="text-xs text-muted-foreground">{unit}</span>
            {/* Said where the number is typed, not after it is refused. */}
            {noUnlimited && (value as number) >= instanceLimit && (
              <span className="text-xs text-amber-600 dark:text-amber-500">
                {u.limits.instanceCeiling(instanceLimit)}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** The numeric limits for one person, laid over their group's defaults. */
export function UserLimitGrid({
  group,
  overrides,
  effective,
  onChange,
}: {
  group: Group | undefined;
  overrides: PermissionOverrides;
  effective: Permissions;
  onChange: (limit: Limit, value: number | null | undefined) => void;
}) {
  const { t } = useI18n();
  // The instance's own concurrency, which no account may be granted past.
  const { data: settings } = useSettings();
  const instanceLimit = settings?.maxConcurrentDownloads ?? 1;
  // An administrator has no quota and no ceiling — the role resolves to
  // unlimited on the server, so offering a figure here would be a promise the
  // system does not keep.
  if (effective.isAdmin) {
    return (
      <p className="py-3 text-xs text-muted-foreground">
        {t.settings.users.limits.adminUnlimited}
      </p>
    );
  }
  return (
    <div className="flex flex-col divide-y">
      {LIMITS.map((limit) => (
        <LimitRow
          key={limit}
          limit={limit}
          // The stored shape has no "inherit" of its own for numbers: null is
          // what the model writes for both "unlimited" and "not set", so an
          // absent key is what inheritance looks like here.
          value={limit in overrides && overrides[limit] !== null ? overrides[limit] : undefined}
          inheritedValue={group?.permissions[limit] ?? null}
          groupName={group?.name}
          instanceLimit={instanceLimit}
          onChange={(next) => onChange(limit, next)}
        />
      ))}
    </div>
  );
}

/** The same numbers for a group, where there is nothing to inherit from. */
export function GroupLimitGrid({
  permissions,
  disabled,
  onChange,
}: {
  permissions: Permissions;
  disabled?: boolean;
  onChange: (limit: Limit, value: number | null) => void;
}) {
  const { t } = useI18n();
  const u = t.settings.users;
  const { data: settings } = useSettings();
  const instanceLimit = settings?.maxConcurrentDownloads ?? 1;
  return (
    <div className={cn("flex flex-col divide-y", disabled && "pointer-events-none opacity-50")}>
      {LIMITS.map((limit) => {
        const set = permissions[limit] !== null;
        // As on an account: the queue runs a fixed number at once, so
        // "unlimited" here would be a figure the machine never honours.
        const noUnlimited = limit === "maxConcurrentDownloads";
        return (
          <div key={limit} className="flex flex-col gap-2 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">{u.limits[limit]}</span>
              <span className="text-xs text-muted-foreground">
                {u.limits[`${limit}Hint` as const]}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="radiogroup"
                className="grid h-9 w-[20rem] shrink-0 grid-cols-2 gap-0.5 rounded-lg border bg-muted/40 p-0.5"
              >
                {(
                  [
                    {
                      key: "unlimited" as const,
                      label: noUnlimited
                        ? u.limits.instanceValue(instanceLimit)
                        : u.limits.unlimited,
                    },
                    { key: "set" as const, label: u.limits.custom },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={set === (opt.key === "set")}
                    onClick={() =>
                      onChange(
                        limit,
                        opt.key === "unlimited"
                          ? null
                          : (permissions[limit] ??
                            fromDisplay(
                              limit,
                              limit === "maxConcurrentDownloads" ? 2 : 5,
                            )),
                      )
                    }
                    className={cn(
                      "flex items-center justify-center rounded-md px-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150",
                      set === (opt.key === "set")
                        ? "bg-background text-foreground shadow-sm"
                        : "text-foreground/60 hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {set && (
                <span className="flex items-center gap-1.5">
                  <LimitInput
                    limit={limit}
                    value={permissions[limit] as number}
                    max={noUnlimited ? instanceLimit : undefined}
                    onCommit={(n) => onChange(limit, fromDisplay(limit, n))}
                  />
                  <span className="text-xs text-muted-foreground">
                    {limit === "maxConcurrentDownloads"
                      ? u.limits.unitCount
                      : u.limits.unitGb}
                  </span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The same list for a group, where each permission simply is or is not. */
export function GroupPermissionGrid({
  permissions,
  disabled,
  onChange,
}: {
  permissions: Permissions;
  disabled?: boolean;
  onChange: (flag: Flag, value: boolean) => void;
}) {
  const { t } = useI18n();
  const u = t.settings.users;

  return (
    <div className="flex flex-col divide-y">
      {FLAGS.map((flag) => {
        const hint = HINTS[flag];
        return (
          <label
            key={flag}
            className={cn(
              "flex items-center justify-between gap-3 py-3",
              disabled && "opacity-50",
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm">{u.permissions[flag]}</span>
              {hint && (
                <span className="text-xs text-muted-foreground">
                  {u.permissions[hint]}
                </span>
              )}
            </span>
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={Boolean(permissions[flag])}
              disabled={disabled}
              onChange={(e) => onChange(flag, e.target.checked)}
            />
          </label>
        );
      })}
    </div>
  );
}
