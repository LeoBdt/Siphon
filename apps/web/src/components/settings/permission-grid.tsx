"use client";

import type {
  Group,
  PermissionOverrides,
  Permissions,
} from "@app/shared";
import { useI18n } from "@/components/i18n-provider";
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
        "inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5",
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
              "rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-150",
              active
                ? opt.key === "deny"
                  ? "bg-destructive/10 text-destructive"
                  : opt.key === "allow"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
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
  disabled,
  onChange,
}: {
  group: Group | undefined;
  overrides: PermissionOverrides;
  disabled?: boolean;
  onChange: (flag: Flag, value: boolean | null) => void;
}) {
  const { t } = useI18n();
  const u = t.settings.users;

  return (
    <div className="flex flex-col divide-y">
      {FLAGS.map((flag) => {
        const inherited = Boolean(group?.permissions[flag]);
        const hint = HINTS[flag];
        return (
          <div
            key={flag}
            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">{u.permissions[flag]}</span>
              {hint && (
                <span className="text-xs text-muted-foreground">
                  {u.permissions[hint]}
                </span>
              )}
            </div>
            <TriControl
              value={triOf(overrides[flag])}
              disabled={disabled}
              inheritLabel={
                group
                  ? u.tri.inheritedFrom(
                      group.name,
                      inherited ? u.tri.yes : u.tri.no,
                    )
                  : u.tri.inherit
              }
              onChange={(next) => onChange(flag, valueOf(next))}
            />
          </div>
        );
      })}
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
  onChange,
}: {
  limit: Limit;
  /** undefined = inherit, null = unlimited, number = this figure. */
  value: number | null | undefined;
  inheritedValue: number | null;
  groupName: string | undefined;
  onChange: (next: number | null | undefined) => void;
}) {
  const { t, intl } = useI18n();
  const u = t.settings.users;
  const unit = limit === "maxConcurrentDownloads" ? u.limits.unitCount : u.limits.unitGb;
  const state: "inherit" | "unlimited" | "set" =
    value === undefined ? "inherit" : value === null ? "unlimited" : "set";

  const describe = (v: number | null) =>
    v === null
      ? u.limits.unlimited
      : limit === "maxConcurrentDownloads"
        ? String(v)
        : `${new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(v / GB)} ${u.limits.unitGb}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm">{u.limits[limit]}</span>
        <span className="text-xs text-muted-foreground">
          {u.limits[`${limit}Hint` as const]}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div role="radiogroup" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {(
            [
              {
                key: "inherit" as const,
                label: groupName
                  ? u.tri.inheritedFrom(groupName, describe(inheritedValue))
                  : u.tri.inherit,
              },
              { key: "unlimited" as const, label: u.limits.unlimited },
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
                "rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-150",
                state === opt.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {state === "set" && (
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={limit === "maxConcurrentDownloads" ? 1 : 0.1}
              step={limit === "maxConcurrentDownloads" ? 1 : 0.5}
              value={toDisplay(limit, value as number)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0) onChange(fromDisplay(limit, n));
              }}
              className="h-8 w-20 rounded-md border bg-transparent px-2 text-sm tabular-nums"
            />
            <span className="text-xs text-muted-foreground">{unit}</span>
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
  onChange,
}: {
  group: Group | undefined;
  overrides: PermissionOverrides;
  onChange: (limit: Limit, value: number | null | undefined) => void;
}) {
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
  return (
    <div className={cn("flex flex-col divide-y", disabled && "pointer-events-none opacity-50")}>
      {LIMITS.map((limit) => (
        <div
          key={limit}
          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
        >
          <div className="flex min-w-0 flex-col">
            <span className="text-sm">{u.limits[limit]}</span>
            <span className="text-xs text-muted-foreground">
              {u.limits[`${limit}Hint` as const]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onChange(
                  limit,
                  permissions[limit] === null
                    ? fromDisplay(limit, limit === "maxConcurrentDownloads" ? 2 : 5)
                    : null,
                )
              }
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium",
                permissions[limit] === null
                  ? "bg-muted/40 text-muted-foreground"
                  : "bg-background",
              )}
            >
              {permissions[limit] === null ? u.limits.unlimited : u.limits.custom}
            </button>
            {permissions[limit] !== null && (
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={limit === "maxConcurrentDownloads" ? 1 : 0.1}
                  step={limit === "maxConcurrentDownloads" ? 1 : 0.5}
                  value={toDisplay(limit, permissions[limit] as number)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) onChange(limit, fromDisplay(limit, n));
                  }}
                  className="h-8 w-20 rounded-md border bg-transparent px-2 text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">
                  {limit === "maxConcurrentDownloads" ? u.limits.unitCount : u.limits.unitGb}
                </span>
              </span>
            )}
          </div>
        </div>
      ))}
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
              "flex items-center justify-between gap-3 py-2.5",
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
