import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";
import { useSettings, type AppSettings } from "@/stores/settings";

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({
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
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-f1red ${
        disabled
          ? "opacity-30 cursor-not-allowed"
          : "cursor-pointer"
      } ${checked ? "bg-f1red" : "bg-[#38383f]"}`}
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

function SettingRow({
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
      className={`flex items-center justify-between gap-4 py-2.5 border-b border-[#2a2a35] last:border-0 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-[12px] text-white/90 leading-tight">{label}</div>
        {description && (
          <div className="text-[10px] text-muted mt-0.5 leading-tight">
            {description}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-muted pt-4 pb-1 first:pt-0">
      {children}
    </div>
  );
}

// ── Speed selector ────────────────────────────────────────────────────────────

const SPEED_OPTIONS = [1, 2, 4, 8] as const;

function SpeedSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[#2a2a35]">
      <div>
        <div className="text-[12px] text-white/90 leading-tight">
          Default playback speed
        </div>
        <div className="text-[10px] text-muted mt-0.5 leading-tight">
          Applied when a new session loads
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`w-8 h-7 text-[11px] font-bold rounded transition-colors ${
              value === s
                ? "bg-f1red text-white"
                : "bg-[#2a2a35] text-muted hover:text-white hover:bg-[#38383f]"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function SettingsModal() {
  const { isOpen, closeModal, setSetting, reset, ...settings } = useSettings();
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeModal]);

  // Prevent body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  function toggle(key: keyof AppSettings) {
    return (v: boolean) => setSetting(key, v as AppSettings[typeof key]);
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) closeModal();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-sm mx-4 max-h-[90vh] flex flex-col bg-[#1a1a24] border border-[#2a2a35] rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2a2a35] shrink-0">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" strokeLinecap="round" className="text-muted">
              <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="10" cy="4" r="2" fill="currentColor"/>
              <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="5" cy="8" r="2" fill="currentColor"/>
              <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="11" cy="12" r="2" fill="currentColor"/>
            </svg>
            <span className="text-[13px] font-bold text-white tracking-wide">
              Settings
            </span>
          </div>
          <button
            onClick={closeModal}
            aria-label="Close settings"
            className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-white hover:bg-[#2a2a35] transition-colors text-base"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4" style={{ touchAction: 'pan-y' }}>
          {/* ── Notifications ──────────────────────────────────────── */}
          <SectionHeader>Notifications</SectionHeader>
          <SettingRow
            label="Enable notifications"
            description="Show event toasts during playback"
            checked={settings.toastsEnabled}
            onChange={toggle("toastsEnabled")}
          />
          <SettingRow
            label="Team radio"
            checked={settings.toastRadio}
            onChange={toggle("toastRadio")}
            disabled={!settings.toastsEnabled}
          />
          <SettingRow
            label="Flags & race control"
            checked={settings.toastFlag}
            onChange={toggle("toastFlag")}
            disabled={!settings.toastsEnabled}
          />
          <SettingRow
            label="Overtakes"
            checked={settings.toastOvertake}
            onChange={toggle("toastOvertake")}
            disabled={!settings.toastsEnabled}
          />
          <SettingRow
            label="Pit stops"
            checked={settings.toastPit}
            onChange={toggle("toastPit")}
            disabled={!settings.toastsEnabled}
          />
          <SettingRow
            label="Fastest lap"
            checked={settings.toastFastestLap}
            onChange={toggle("toastFastestLap")}
            disabled={!settings.toastsEnabled}
          />

          {/* ── Track Map ──────────────────────────────────────────── */}
          <SectionHeader>Track Map</SectionHeader>
          <SettingRow
            label="Mini leaderboard"
            description="Position list overlay bottom-left"
            checked={settings.mapShowLeaderboard}
            onChange={toggle("mapShowLeaderboard")}
          />
          <SettingRow
            label="Tyre compound badges"
            description="Compound icons on each driver dot"
            checked={settings.mapShowCompoundBadges}
            onChange={toggle("mapShowCompoundBadges")}
          />
          <SettingRow
            label="DRS battle rings"
            description="Highlight drivers within 1s"
            checked={settings.mapShowBattleRings}
            onChange={toggle("mapShowBattleRings")}
          />
          <SettingRow
            label="Focused driver HUD"
            description="Speed, gear and throttle for selected driver"
            checked={settings.mapShowDriverHud}
            onChange={toggle("mapShowDriverHud")}
          />
          <SettingRow
            label="Sector flag colouring"
            description="Tint track sectors on yellow/red flags"
            checked={settings.mapShowSectorFlags}
            onChange={toggle("mapShowSectorFlags")}
          />

          {/* ── Leaderboard ────────────────────────────────────────── */}
          <SectionHeader>Leaderboard</SectionHeader>
          <SettingRow
            label="Live car telemetry"
            description="Speed, gear, RPM, throttle, brake & DRS columns (extra data)"
            checked={settings.leaderboardTelemetry}
            onChange={toggle("leaderboardTelemetry")}
          />

          {/* ── Support ────────────────────────────────────────────── */}
          <SectionHeader>Support</SectionHeader>
          <SettingRow
            label="Buy Me a Coffee button"
            description="Show the floating support widget"
            checked={settings.showCoffeeWidget}
            onChange={toggle("showCoffeeWidget")}
          />

          {/* ── Playback ───────────────────────────────────────────── */}
          <SectionHeader>Playback</SectionHeader>
          <SpeedSelector
            value={settings.defaultSpeed}
            onChange={(v) => setSetting("defaultSpeed", v)}
          />
          <SettingRow
            label="Catch-up summary"
            description="Show missed events after a large scrub forward"
            checked={settings.catchupSummaryEnabled}
            onChange={toggle("catchupSummaryEnabled")}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2a2a35] shrink-0 flex justify-end">
          <button
            onClick={reset}
            className="text-[11px] font-medium text-muted hover:text-white transition-colors px-3 py-1.5 rounded hover:bg-[#2a2a35]"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
