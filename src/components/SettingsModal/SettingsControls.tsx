import type { ReactNode } from "react";
import { useSettings, type AppSettings, SETTINGS_DEFAULTS } from "@/stores/settings";

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
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-f1red ${
        disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
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
      className={`flex items-center justify-between gap-4 py-3 border-b border-[#2a2a35] last:border-0 ${
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
    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-muted pt-5 pb-1 first:pt-0">
      {children}
    </div>
  );
}

// ── Segmented row ─────────────────────────────────────────────────────────────

export function SegmentedRow<T extends string>({
  label,
  description,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 border-b border-[#2a2a35] last:border-0 ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-[13px] text-white/90 leading-tight">{label}</div>
        {description && (
          <div className="text-[11px] text-muted mt-0.5 leading-tight">{description}</div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => !disabled && onChange(opt.value)}
            className={`px-2.5 h-8 text-[11px] font-bold rounded transition-colors ${
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            } ${
              value === opt.value
                ? "bg-f1red text-white"
                : "bg-[#2a2a35] text-muted hover:text-white hover:bg-[#38383f]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Slider row ────────────────────────────────────────────────────────────────

export function SliderRow({
  label,
  description,
  min,
  max,
  step,
  value,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  description?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="py-3 border-b border-[#2a2a35] last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[13px] text-white/90 leading-tight">{label}</div>
        <div className="text-[11px] font-mono tabular-nums text-muted">{format(value)}</div>
      </div>
      {description && (
        <div className="text-[11px] text-muted mb-2 leading-tight">{description}</div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-f1red h-1"
      />
    </div>
  );
}

// ── Speed selector ────────────────────────────────────────────────────────────

const SPEED_OPTIONS = [1, 2, 4, 8] as const;

export function SpeedSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[#2a2a35]">
      <div>
        <div className="text-[13px] text-white/90 leading-tight">
          Default playback speed
        </div>
        <div className="text-[11px] text-muted mt-0.5 leading-tight">
          Applied when a new session loads
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`w-9 h-8 text-[11px] font-bold rounded transition-colors ${
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

// ── Map view options ──────────────────────────────────────────────────────────

const MAP_VIEW_OPTIONS = [
  { label: "2D", value: "2d" as const },
  { label: "3D", value: "3d" as const },
  { label: "Satellite", value: "satellite" as const },
] satisfies { label: string; value: "2d" | "3d" | "satellite" }[];

const ELEV_SCALE_OPTIONS = [1, 2, 4, 8] as const;

// ── Settings body (all sections) ──────────────────────────────────────────────

export function SettingsBody() {
  const { setSetting, reset, ...settings } = useSettings();

  function toggle(key: keyof AppSettings) {
    return (v: boolean) => setSetting(key, v as AppSettings[typeof key]);
  }

  return (
    <>
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

      <SectionHeader>Map View</SectionHeader>
      <SegmentedRow
        label="View mode"
        options={MAP_VIEW_OPTIONS}
        value={settings.mapViewMode}
        onChange={(v) => setSetting("mapViewMode", v)}
      />

      {settings.mapViewMode === "3d" && (
        <>
          <SettingRow
            label="Elevation"
            description="Lift corners and hills using Z-coordinate data"
            checked={settings.map3dElevation}
            onChange={toggle("map3dElevation")}
          />
          <div
            className={`flex items-center justify-between gap-4 py-3 border-b border-[#2a2a35] ${
              !settings.map3dElevation ? "opacity-40" : ""
            }`}
          >
            <div className="min-w-0">
              <div className="text-[13px] text-white/90 leading-tight">Elevation scale</div>
              <div className="text-[11px] text-muted mt-0.5 leading-tight">Vertical exaggeration factor</div>
            </div>
            <div className="flex gap-1 shrink-0">
              {ELEV_SCALE_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => settings.map3dElevation && setSetting("map3dElevationScale", s)}
                  className={`w-9 h-8 text-[11px] font-bold rounded transition-colors ${
                    !settings.map3dElevation ? "cursor-not-allowed" : "cursor-pointer"
                  } ${
                    settings.map3dElevationScale === s
                      ? "bg-f1red text-white"
                      : "bg-[#2a2a35] text-muted hover:text-white hover:bg-[#38383f]"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <SettingRow
            label="Auto-rotate when paused"
            description="Slow orbital camera while playback is stopped"
            checked={settings.map3dAutoRotate}
            onChange={toggle("map3dAutoRotate")}
          />
        </>
      )}

      {settings.mapViewMode === "satellite" && (
        <>
          <SliderRow
            label="Track opacity"
            description="Ribbon visibility over satellite imagery"
            min={0.3}
            max={1}
            step={0.05}
            value={settings.satelliteOpacity}
            onChange={(v) => setSetting("satelliteOpacity", v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <SettingRow
            label="Map labels"
            description="Show road and place name labels"
            checked={settings.satelliteLabels}
            onChange={toggle("satelliteLabels")}
          />
        </>
      )}

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

      <SectionHeader>Leaderboard</SectionHeader>
      <SettingRow
        label="Live car telemetry"
        description="Speed, gear, RPM, throttle, brake & DRS columns"
        checked={settings.leaderboardTelemetry}
        onChange={toggle("leaderboardTelemetry")}
      />

      <SectionHeader>Support</SectionHeader>
      <SettingRow
        label="Buy Me a Coffee button"
        description="Show the floating support widget"
        checked={settings.showCoffeeWidget}
        onChange={toggle("showCoffeeWidget")}
      />

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

      <div className="pt-6 pb-2 flex justify-end">
        <button
          onClick={reset}
          className="text-[11px] font-medium text-muted hover:text-white transition-colors px-3 py-1.5 rounded hover:bg-[#2a2a35]"
        >
          Reset to defaults
        </button>
      </div>
    </>
  );
}
