import type { ReactNode } from "react";
import { useSettings, type AppSettings } from "@/stores/settings";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { trackEvent } from "@/lib/analytics";
import { SPEEDS } from "@/constants";

function toAnalyticsValue(
  value: AppSettings[keyof AppSettings],
): string | number | boolean {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return value.join(",");
}

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
    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-muted pt-5 pb-1 first:pt-0">
      {children}
    </div>
  );
}

// ── Speed selector ────────────────────────────────────────────────────────────

const NOTIFICATION_LIMIT_OPTIONS = [2, 4, 6, 8] as const;
const CATCHUP_EVENT_TYPE_OPTIONS = [
  { kind: "pit", label: "Pit stops", color: "#3d78ff" },
  { kind: "flag", label: "Flags", color: "#f5a623" },
  { kind: "penalty", label: "Penalties", color: "#e8002d" },
  { kind: "overtake", label: "Overtakes", color: "#22c55e" },
  { kind: "fastest_lap", label: "Fastest laps", color: "#9b59f5" },
  { kind: "investigation", label: "Investigations", color: "#f5a623" },
  { kind: "radio", label: "Radio", color: "#6b6b7a" },
] as const;

const NOTIFICATION_EVENT_TYPE_OPTIONS = [
  { key: "toastPit", label: "Pit stops", color: "#3d78ff" },
  { key: "toastFlag", label: "Flags", color: "#f5a623" },
  { key: "toastPenalty", label: "Penalties", color: "#e8002d" },
  { key: "toastOvertake", label: "Overtakes", color: "#22c55e" },
  { key: "toastFastestLap", label: "Fastest laps", color: "#9b59f5" },
  { key: "toastInvestigation", label: "Investigations", color: "#f5a623" },
  { key: "toastRadio", label: "Radio", color: "#6b6b7a" },
] as const;

export function SpeedSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-panel">
      <div>
        <div className="text-[13px] text-white/90 leading-tight">
          Default playback speed
        </div>
        <div className="text-[11px] text-muted mt-0.5 leading-tight">
          Applied when a new session loads
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`w-9 h-8 text-[11px] font-bold rounded transition-colors ${
              value === s
                ? "bg-f1red text-white"
                : "bg-track text-muted hover:text-white hover:bg-panel"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

export function NotificationLimitSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: 2 | 4 | 6 | 8;
  onChange: (v: 2 | 4 | 6 | 8) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 border-b border-panel ${disabled ? "opacity-40" : ""}`}
    >
      <div>
        <div className="text-[13px] text-white/90 leading-tight">
          Max visible notifications
        </div>
        <div className="text-[11px] text-muted mt-0.5 leading-tight">
          Applies to mobile and desktop toast stack
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {NOTIFICATION_LIMIT_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => !disabled && onChange(n)}
            disabled={disabled}
            className={`w-9 h-8 text-[11px] font-bold rounded transition-colors ${
              value === n
                ? "bg-f1red text-white"
                : "bg-track text-muted hover:text-white hover:bg-panel"
            } ${disabled ? "cursor-not-allowed" : ""}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
// ── Unit selector ─────────────────────────────────────────────────────────────

export function UnitSelector({
  value,
  onChange,
}: {
  value: "metric" | "imperial";
  onChange: (v: "metric" | "imperial") => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-panel">
      <div>
        <div className="text-[13px] text-white/90 leading-tight">Units</div>
        <div className="text-[11px] text-muted mt-0.5 leading-tight">
          Display distances in km or miles, temperature in °C or °F
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {(["metric", "imperial"] as const).map((unit) => (
          <button
            key={unit}
            onClick={() => onChange(unit)}
            className={`px-3 h-8 text-[11px] font-bold rounded transition-colors ${
              value === unit
                ? "bg-f1red text-white"
                : "bg-track text-muted hover:text-white hover:bg-panel"
            }`}
          >
            {unit === "metric" ? "Metric" : "Imperial"}
          </button>
        ))}
      </div>
    </div>
  );
}
// ── Settings body (all sections) ──────────────────────────────────────────────

export function SettingsBody() {
  const { setSetting, reset, ...settings } = useSettings();
  const isMobileViewport = useMediaQuery("(max-width: 767px)");

  function updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) {
    setSetting(key, value);
    trackEvent("settings_changed", {
      setting_key: key,
      setting_value: toAnalyticsValue(value),
    });
  }

  function toggle(key: keyof AppSettings) {
    return (v: boolean) => updateSetting(key, v as AppSettings[typeof key]);
  }

  const trackerSectorsActive =
    settings.trackerTimingShowS1 &&
    settings.trackerTimingShowS2 &&
    settings.trackerTimingShowS3;
  const mobileSectorsActive =
    settings.timingMobileShowS1 &&
    settings.timingMobileShowS2 &&
    settings.timingMobileShowS3;

  const trackerTimingColumns = [
    {
      label: "P",
      active: settings.trackerTimingShowPosition,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowPosition",
          !settings.trackerTimingShowPosition,
        ),
    },
    {
      label: "Driver",
      active: settings.trackerTimingShowDriver,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowDriver",
          !settings.trackerTimingShowDriver,
        ),
    },
    {
      label: "Alerts",
      active: settings.trackerTimingShowAlerts,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowAlerts",
          !settings.trackerTimingShowAlerts,
        ),
    },
    {
      label: "Best lap",
      active: settings.trackerTimingShowBestLap,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowBestLap",
          !settings.trackerTimingShowBestLap,
        ),
    },
    {
      label: "Last lap",
      active: settings.trackerTimingShowLastLap,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowLastLap",
          !settings.trackerTimingShowLastLap,
        ),
    },
    {
      label: "Gap",
      active: settings.trackerTimingShowGap,
      onToggle: () =>
        updateSetting("trackerTimingShowGap", !settings.trackerTimingShowGap),
    },
    {
      label: "Interval",
      active: settings.trackerTimingShowInterval,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowInterval",
          !settings.trackerTimingShowInterval,
        ),
    },
    {
      label: "Sectors",
      active: trackerSectorsActive,
      onToggle: () => {
        const next = !trackerSectorsActive;
        updateSetting("trackerTimingShowS1", next);
        updateSetting("trackerTimingShowS2", next);
        updateSetting("trackerTimingShowS3", next);
      },
    },
    {
      label: "Pos",
      active: settings.trackerTimingShowPosDelta,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowPosDelta",
          !settings.trackerTimingShowPosDelta,
        ),
    },
    {
      label: "Tyre",
      active: settings.trackerTimingShowTyre,
      onToggle: () =>
        updateSetting("trackerTimingShowTyre", !settings.trackerTimingShowTyre),
    },
    {
      label: "Pit",
      active: settings.trackerTimingShowPit,
      onToggle: () =>
        updateSetting("trackerTimingShowPit", !settings.trackerTimingShowPit),
    },
    {
      label: "Lap",
      active: settings.trackerTimingShowLap,
      onToggle: () =>
        updateSetting("trackerTimingShowLap", !settings.trackerTimingShowLap),
    },
    {
      label: "Speed",
      active: settings.trackerTimingShowSpeed,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowSpeed",
          !settings.trackerTimingShowSpeed,
        ),
    },
    {
      label: "Gear",
      active: settings.trackerTimingShowGear,
      onToggle: () =>
        updateSetting("trackerTimingShowGear", !settings.trackerTimingShowGear),
    },
    {
      label: "RPM",
      active: settings.trackerTimingShowRpm,
      onToggle: () =>
        updateSetting("trackerTimingShowRpm", !settings.trackerTimingShowRpm),
    },
    {
      label: "Thr/Brk",
      active: settings.trackerTimingShowThrBrk,
      onToggle: () =>
        updateSetting(
          "trackerTimingShowThrBrk",
          !settings.trackerTimingShowThrBrk,
        ),
    },
    {
      label: "DRS",
      active: settings.trackerTimingShowDrs,
      onToggle: () =>
        updateSetting("trackerTimingShowDrs", !settings.trackerTimingShowDrs),
    },
  ] as const;

  const mobileTimingColumns = [
    {
      label: "P",
      active: settings.timingMobileShowPosition,
      onToggle: () =>
        updateSetting(
          "timingMobileShowPosition",
          !settings.timingMobileShowPosition,
        ),
    },
    {
      label: "Driver",
      active: settings.timingMobileShowDriver,
      onToggle: () =>
        updateSetting(
          "timingMobileShowDriver",
          !settings.timingMobileShowDriver,
        ),
    },
    {
      label: "Alerts",
      active: settings.timingMobileShowAlerts,
      onToggle: () =>
        updateSetting(
          "timingMobileShowAlerts",
          !settings.timingMobileShowAlerts,
        ),
    },
    {
      label: "Best lap",
      active: settings.timingMobileShowBestLap,
      onToggle: () =>
        updateSetting(
          "timingMobileShowBestLap",
          !settings.timingMobileShowBestLap,
        ),
    },
    {
      label: "Last lap",
      active: settings.timingMobileShowLastLap,
      onToggle: () =>
        updateSetting(
          "timingMobileShowLastLap",
          !settings.timingMobileShowLastLap,
        ),
    },
    {
      label: "Gap",
      active: settings.timingMobileShowGap,
      onToggle: () =>
        updateSetting("timingMobileShowGap", !settings.timingMobileShowGap),
    },
    {
      label: "Interval",
      active: settings.timingMobileShowInterval,
      onToggle: () =>
        updateSetting(
          "timingMobileShowInterval",
          !settings.timingMobileShowInterval,
        ),
    },
    {
      label: "Sectors",
      active: mobileSectorsActive,
      onToggle: () => {
        const next = !mobileSectorsActive;
        updateSetting("timingMobileShowS1", next);
        updateSetting("timingMobileShowS2", next);
        updateSetting("timingMobileShowS3", next);
      },
    },
    {
      label: "Pos",
      active: settings.timingMobileShowPosDelta,
      onToggle: () =>
        updateSetting(
          "timingMobileShowPosDelta",
          !settings.timingMobileShowPosDelta,
        ),
    },
    {
      label: "Tyre",
      active: settings.timingMobileShowTyre,
      onToggle: () =>
        updateSetting("timingMobileShowTyre", !settings.timingMobileShowTyre),
    },
    {
      label: "Pit",
      active: settings.timingMobileShowPitCount,
      onToggle: () =>
        updateSetting(
          "timingMobileShowPitCount",
          !settings.timingMobileShowPitCount,
        ),
    },
    {
      label: "Lap",
      active: settings.timingMobileShowLap,
      onToggle: () =>
        updateSetting("timingMobileShowLap", !settings.timingMobileShowLap),
    },
  ] as const;

  return (
    <>
      <SectionHeader>Appearance</SectionHeader>
      <SettingRow
        label="Light mode"
        description="Switch to a light colour scheme"
        checked={settings.lightMode}
        onChange={toggle("lightMode")}
      />
      <UnitSelector
        value={settings.metricSystem}
        onChange={(v) => updateSetting("metricSystem", v)}
      />

      <SectionHeader>Playback</SectionHeader>
      <SpeedSelector
        value={settings.defaultSpeed}
        onChange={(v) => updateSetting("defaultSpeed", v)}
      />
      <SettingRow
        label="Playback speed controls"
        description="Show 1x/2x/4x/8x buttons in playback bar"
        checked={settings.showPlaybackSpeedControls}
        onChange={toggle("showPlaybackSpeedControls")}
      />
      <SettingRow
        label="Forward event chips"
        description="Show jump chips (incident, pit, flag, SC, pass, radio)"
        checked={settings.showPlaybackEventChips}
        onChange={toggle("showPlaybackEventChips")}
      />
      <SettingRow
        label="Catch-up summary"
        description="Show missed events after a large scrub forward"
        checked={settings.catchupSummaryEnabled}
        onChange={toggle("catchupSummaryEnabled")}
      />
      {settings.catchupSummaryEnabled && (
        <div className="py-2.5 border-b border-panel">
          <div className="text-[11px] text-muted mb-2 leading-tight">
            Default visible event types
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATCHUP_EVENT_TYPE_OPTIONS.map(({ kind, label, color }) => {
              const active =
                settings.catchupSummaryDefaultFilters.includes(kind);
              return (
                <button
                  key={kind}
                  onClick={() => {
                    const current = settings.catchupSummaryDefaultFilters;
                    const next = active
                      ? current.filter((k) => k !== kind)
                      : [...current, kind];
                    if (next.length > 0)
                      updateSetting("catchupSummaryDefaultFilters", next);
                  }}
                  className={[
                    "text-[10px] font-bold px-2 py-0.5 rounded-sm border transition-all",
                    "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                    active
                      ? "border-transparent text-black"
                      : "border-panel text-muted bg-transparent",
                  ].join(" ")}
                  style={
                    active ? { backgroundColor: color, borderColor: color } : {}
                  }
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <SectionHeader>Notifications</SectionHeader>
      <SettingRow
        label="Enable notifications"
        description="Show event toasts during playback"
        checked={settings.toastsEnabled}
        onChange={toggle("toastsEnabled")}
      />
      <NotificationLimitSelector
        value={settings.notificationMaxVisible}
        onChange={(v) => updateSetting("notificationMaxVisible", v)}
        disabled={!settings.toastsEnabled}
      />
      <div className="-mt-2.5 mb-1 text-[10px] text-muted/80 leading-tight border-b border-panel pb-2.5">
        Controls the number of simultaneous toasts shown in the live stack.
      </div>
      <SettingRow
        label="Auto-play radio messages"
        description="Automatically play new team radio toasts"
        checked={settings.toastRadioAutoplay}
        onChange={toggle("toastRadioAutoplay")}
        disabled={!settings.toastsEnabled || !settings.toastRadio}
      />
      <SettingRow
        label="Toast sounds"
        description="Play short sound cues for new notifications"
        checked={settings.toastSoundsEnabled}
        onChange={toggle("toastSoundsEnabled")}
        disabled={!settings.toastsEnabled}
      />
      <div className="py-2.5 border-b border-panel">
        <div className="text-[11px] text-muted mb-2 leading-tight">
          Default visible event types
        </div>
        <div className="flex flex-wrap gap-1.5">
          {NOTIFICATION_EVENT_TYPE_OPTIONS.map(({ key, label, color }) => {
            const active = settings[key];
            const disabled = !settings.toastsEnabled;
            return (
              <button
                key={key}
                onClick={() =>
                  updateSetting(key, !active as AppSettings[typeof key])
                }
                disabled={disabled}
                className={[
                  "text-[10px] font-bold px-2 py-0.5 rounded-sm border transition-all",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                  active
                    ? "border-transparent text-black"
                    : "border-panel text-muted bg-transparent",
                  disabled ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
                style={
                  active ? { backgroundColor: color, borderColor: color } : {}
                }
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <SectionHeader>Race Views</SectionHeader>
      <SettingRow
        label="Live car telemetry"
        description="Speed, gear, RPM, throttle, brake & DRS columns"
        checked={settings.leaderboardTelemetry}
        onChange={toggle("leaderboardTelemetry")}
      />
      <SettingRow
        label="Timing minisectors"
        description="Show minisector strips under S1/S2/S3 bars"
        checked={settings.timingShowMinisectors}
        onChange={toggle("timingShowMinisectors")}
      />
      {!isMobileViewport && (
        <SettingRow
          label="Timing box live telemetry"
          description="Show speed, gear, RPM, throttle, brake & DRS in tracker timing"
          checked={settings.trackerTimingTelemetry}
          onChange={toggle("trackerTimingTelemetry")}
        />
      )}
      {!isMobileViewport && (
        <div className="py-2.5 border-b border-panel">
          <div className="text-[13px] text-white/90 leading-tight">
            Driver tracker columns
          </div>
          <div className="text-[11px] text-muted mt-0.5 leading-tight">
            Pick which leaderboard-style timing columns appear in the tracker
            table
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {trackerTimingColumns.map(({ label, active, onToggle }) => (
              <button
                key={label}
                onClick={onToggle}
                className={[
                  "text-[10px] font-bold px-2 py-0.5 rounded-sm border transition-all",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                  active
                    ? "border-f1red bg-f1red text-white"
                    : "border-panel bg-transparent text-muted hover:border-muted hover:text-white",
                ].join(" ")}
                aria-pressed={active}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {isMobileViewport && (
        <div>
          <SettingRow
            label="Mobile timing car data"
            description="Show speed, RPM, gear, DRS, throttle and brake in tracker timing rows on mobile"
            checked={settings.trackerTimingMobileCarData}
            onChange={toggle("trackerTimingMobileCarData")}
          />
          <div className="py-2.5 border-b border-panel">
            <div className="text-[13px] text-white/90 leading-tight">
              Mobile timing columns
            </div>
            <div className="text-[11px] text-muted mt-0.5 leading-tight">
              Pick which timing columns appear in mobile timing rows
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mobileTimingColumns.map(({ label, active, onToggle }) => (
                <button
                  key={label}
                  onClick={onToggle}
                  className={[
                    "text-[10px] font-bold px-2 py-0.5 rounded-sm border transition-all",
                    "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                    active
                      ? "border-f1red bg-f1red text-white"
                      : "border-panel bg-transparent text-muted hover:border-muted hover:text-white",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <SectionHeader>Track Map</SectionHeader>
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
      <SettingRow
        label="Sector status box"
        description="Show S1/S2/S3 flag chips near compass"
        checked={settings.mapShowSectorBox}
        onChange={toggle("mapShowSectorBox")}
      />
      <SettingRow
        label="Track controls"
        description="Show zoom and rotate controls on map"
        checked={settings.mapShowTrackControls}
        onChange={toggle("mapShowTrackControls")}
      />
      <SettingRow
        label="Compass overlay"
        description="Show north indicator in track controls"
        checked={settings.mapShowCompass}
        onChange={toggle("mapShowCompass")}
      />
      <SettingRow
        label="Track weather"
        description="Show weather panel/overlay in track map view"
        checked={settings.mapShowWeather}
        onChange={toggle("mapShowWeather")}
      />
      <SettingRow
        label="Driver acronym labels"
        description="Show 3-letter driver labels next to car dots"
        checked={settings.mapShowDriverAcronym}
        onChange={toggle("mapShowDriverAcronym")}
      />
      <SettingRow
        label="Driver number inside dot"
        description="Show driver number centered in each car dot"
        checked={settings.mapShowDriverNumberInside}
        onChange={toggle("mapShowDriverNumberInside")}
      />
      <SettingRow
        label="Enhanced track visuals"
        description="Show finish line, sector markers, ghost delta map, braking hotspots, overtake arcs, condition ribbon, marshal lights and elevation contours"
        checked={settings.mapShowEnhancedVisuals}
        onChange={toggle("mapShowEnhancedVisuals")}
      />
      <SettingRow
        label="Marshal sector heatmap"
        description="Paint all ~15-22 individual marshal posts as coloured arc segments on the track (S1 red / S2 yellow / S3 blue)"
        checked={settings.mapShowMarshalHeatmap}
        onChange={toggle("mapShowMarshalHeatmap")}
      />
      <SettingRow
        label="Corner numbers"
        description="Show corner numbers next to the track from baked circuit geometry"
        checked={settings.mapShowCornerNumbers}
        onChange={toggle("mapShowCornerNumbers")}
      />
      <SettingRow
        label="Elevation heatmap"
        description="Colour the track ribbon by altitude (blue = low, yellow = high)"
        checked={settings.mapShowElevation}
        onChange={toggle("mapShowElevation")}
      />
      <SettingRow
        label="PNG track snapshot"
        description="Show download button for track screenshots"
        checked={settings.trackScreenshotPngEnabled}
        onChange={toggle("trackScreenshotPngEnabled")}
      />

      <SectionHeader>Data & Interface</SectionHeader>
      <SettingRow
        label="CSV export buttons"
        description="Show export controls on Race Control, Team Radio, Overtakes and Weather panels"
        checked={settings.showCsvExportButtons}
        onChange={toggle("showCsvExportButtons")}
      />
      <SettingRow
        label="Next race weekend banner"
        description="Show countdown banner for the next race weekend"
        checked={settings.showNextRaceWeekendBanner}
        onChange={toggle("showNextRaceWeekendBanner")}
      />

      <SectionHeader>Support</SectionHeader>
      <SettingRow
        label="Buy Me a Coffee button"
        description="Show the floating support widget"
        checked={settings.showCoffeeWidget}
        onChange={toggle("showCoffeeWidget")}
      />

      <div className="pt-6 pb-2 flex justify-end">
        <button
          onClick={() => {
            reset();
            trackEvent("settings_reset_defaults");
          }}
          className="text-[11px] font-medium text-muted hover:text-white transition-colors px-3 py-1.5 rounded hover:bg-panel"
        >
          Reset to defaults
        </button>
      </div>
    </>
  );
}
