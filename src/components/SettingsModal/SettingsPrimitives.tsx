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
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-f1red ${
        disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
      } ${checked ? "bg-f1red" : "bg-panel"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
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
    <div
      className={`flex items-center justify-between gap-4 py-3 border-b border-panel last:border-0 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-[13px] text-white/90 leading-tight">{label}</div>
        {description && (
          <div className="text-[11px] text-muted mt-0.5 leading-tight">
            {description}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-muted pt-5 pb-1 first:pt-3">
      {children}
    </div>
  );
}
