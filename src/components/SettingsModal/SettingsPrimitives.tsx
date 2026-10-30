import type { ReactNode } from "react";
import { animateMotion, pressMotion } from "@/lib/motion";

// ── Toggle switch ─────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        if (disabled) return;
        animateMotion(e.currentTarget, pressMotion());
        onChange(!checked);
      }}
      className={`relative h-5 w-9 shrink-0 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-f1red ${
        disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer"
      } ${checked ? "border-f1red bg-f1red" : "border-panel bg-track"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 transition-transform ${
          checked ? "translate-x-4 bg-white" : "translate-x-0 bg-muted"
        }`}
      />
    </button>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────────

export function SettingRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <OptionRow label={label} description={description} disabled={disabled}>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </OptionRow>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-1 pt-6 first:pt-4">
      <span aria-hidden="true" className="h-3 w-0.5 shrink-0 bg-f1red" />
      <span className="text-small font-black uppercase tracking-eyebrow text-fg">
        {children}
      </span>
    </div>
  );
}

// ── Option row: label + description with a control on the right ──────────────

export function OptionRow({
  label,
  description,
  disabled = false,
  stackOnMobile = false,
  children,
}: {
  label: string;
  description?: string;
  disabled?: boolean;
  stackOnMobile?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex gap-4 border-b border-panel py-3 last:border-0 ${
        stackOnMobile
          ? "flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          : "items-center justify-between"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <div className="min-w-0">
        <div className="text-body leading-tight text-fg/90">{label}</div>
        {description && (
          <div className="mt-0.5 text-small leading-tight text-muted">
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Segmented control (joined buttons, one active) ────────────────────────────

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 border border-panel">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={(e) => {
              animateMotion(e.currentTarget, pressMotion());
              onChange(option.value);
            }}
            className={`h-7 min-w-9 px-2.5 font-mono text-small font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-f1red ${
              active
                ? "bg-f1red text-white"
                : "text-muted hover:bg-panel hover:text-fg"
            } ${disabled ? "cursor-not-allowed" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Chip toggle (multi-select) ────────────────────────────────────────────────

export function Chip({
  label,
  active,
  onToggle,
  color,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  /** Fill colour when active; defaults to F1 red. */
  color?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={(e) => {
        animateMotion(e.currentTarget, pressMotion());
        onToggle();
      }}
      className={[
        "flex items-center gap-1.5 border px-2 py-1 text-caption font-bold uppercase tracking-widest transition-colors",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-fg/40",
        active
          ? color
            ? "border-panel bg-track text-fg"
            : "border-f1red bg-f1red text-white"
          : "border-panel bg-transparent text-muted hover:border-muted hover:text-fg",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
      style={active && color ? { borderColor: color } : undefined}
    >
      {color && (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0"
          style={{ backgroundColor: active ? color : "transparent", boxShadow: `inset 0 0 0 1px ${color}` }}
        />
      )}
      {label}
    </button>
  );
}

// ── Chip field: label + description above a wrap of chips ────────────────────

export function ChipField({
  label,
  description,
  muted = false,
  children,
}: {
  label: string;
  description?: string;
  /** Render the label as a small secondary caption (nested under a toggle). */
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-panel py-3 last:border-0">
      <div
        className={
          muted
            ? "text-small leading-tight text-muted"
            : "text-body leading-tight text-fg/90"
        }
      >
        {label}
      </div>
      {description && (
        <div className="mt-0.5 text-small leading-tight text-muted">
          {description}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
