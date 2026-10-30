import { useState } from "react";
import {
  Chip,
  ChipField,
  OptionRow,
  SectionHeader,
  Segmented,
  SettingRow,
} from "./SettingsPrimitives";
import { TrackMapSettings } from "./TrackMapSettings";
import {
  useSettings,
  type AppSettings,
  type SettingsTabId,
} from "@/stores/settings";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { trackEvent } from "@/lib/analytics";
import {
  CORNER_HIGH_SPEED_KMH,
  CORNER_LOW_SPEED_KMH,
  SPEEDS,
} from "@/constants";
import { animateMotion, pressMotion } from "@/lib/motion";
import { TOKEN_HEX } from "@/designTokens";
import { buttonClass } from "@/components/Button/buttonClass";

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

export { SectionHeader, SettingRow, Toggle } from "./SettingsPrimitives";

// ── Speed selector ────────────────────────────────────────────────────────────

const NOTIFICATION_LIMIT_OPTIONS = [2, 4, 6, 8] as const;
const CATCHUP_EVENT_TYPE_OPTIONS = [
  { kind: "pit", label: "Pit stops", color: "#3d78ff" },
  { kind: "flag", label: "Flags", color: TOKEN_HEX.orange },
  { kind: "penalty", label: "Penalties", color: TOKEN_HEX.f1red },
  { kind: "overtake", label: "Overtakes", color: "#22c55e" },
  { kind: "fastest_lap", label: "Fastest laps", color: TOKEN_HEX.purple },
  { kind: "undercut", label: "Undercuts", color: TOKEN_HEX.teal },
  { kind: "investigation", label: "Investigations", color: TOKEN_HEX.orange },
  { kind: "radio", label: "Radio", color: "#6b6b7a" },
] as const;

const NOTIFICATION_EVENT_TYPE_OPTIONS = [
  { key: "toastPit", label: "Pit stops", color: "#3d78ff" },
  { key: "toastFlag", label: "Flags", color: TOKEN_HEX.orange },
  { key: "toastPenalty", label: "Penalties", color: TOKEN_HEX.f1red },
  { key: "toastOvertake", label: "Overtakes", color: "#22c55e" },
  { key: "toastFastestLap", label: "Fastest laps", color: TOKEN_HEX.purple },
  { key: "toastUndercut", label: "Undercuts", color: TOKEN_HEX.teal },
  { key: "toastInvestigation", label: "Investigations", color: TOKEN_HEX.orange },
  { key: "toastRadio", label: "Radio", color: "#6b6b7a" },
] as const;

const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "playback", label: "Playback" },
  { id: "notifications", label: "Alerts" },
  { id: "timing", label: "Timing" },
  { id: "track", label: "Track map" },
  { id: "telemetry", label: "Telemetry" },
  { id: "interface", label: "Interface" },
] as const satisfies readonly { id: SettingsTabId; label: string }[];

export function SpeedSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <OptionRow
      label="Default playback speed"
      description="Applied when a new session loads"
    >
      <Segmented
        options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        value={value}
        onChange={onChange}
      />
    </OptionRow>
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
    <OptionRow
      label="Max visible notifications"
      description="Simultaneous toasts in the stack, on mobile and desktop"
      disabled={disabled}
    >
      <Segmented
        options={NOTIFICATION_LIMIT_OPTIONS.map((n) => ({
          value: n,
          label: String(n),
        }))}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </OptionRow>
  );
}

// ── Unit selector ─────────────────────────────────────────────────────────────

const UNIT_OPTIONS = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial" },
] as const;

export function UnitSelector({
  value,
  onChange,
}: {
  value: "metric" | "imperial";
  onChange: (v: "metric" | "imperial") => void;
}) {
  return (
    <OptionRow
      label="Units"
      description="Display distances in km or miles, temperature in °C or °F"
      stackOnMobile
    >
      <Segmented options={UNIT_OPTIONS} value={value} onChange={onChange} />
    </OptionRow>
  );
}

// ── Settings body (all sections) ──────────────────────────────────────────────

export function SettingsBody({
  initialTab = "general",
}: {
  initialTab?: SettingsTabId;
} = {}) {
  const { setSetting, reset, ...settings } = useSettings();
  const isMobileViewport = useMediaQuery("(max-width: 767px)");
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);

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
      <div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-4">
        <div
          role="tablist"
          aria-label="Settings categories"
          aria-orientation={isMobileViewport ? "horizontal" : "vertical"}
          className="sticky top-0 z-10 -mx-4 flex shrink-0 overflow-x-auto overscroll-x-contain border-b border-panel bg-track px-4 [scrollbar-width:none] md:static md:mx-0 md:w-36 md:flex-col md:self-stretch md:overflow-visible md:border-b-0 md:border-r md:bg-transparent md:px-0 md:py-4 md:pr-4"
        >
          {SETTINGS_TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`${tab.id}-settings-tab`}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`${tab.id}-settings-panel`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-caption font-black uppercase tracking-caps transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-f1red md:w-full md:border-b-0 md:border-l-2 md:px-3 md:py-2.5 md:text-left ${
                  isActive
                    ? "border-f1red text-fg md:bg-panel/60"
                    : "border-transparent text-muted hover:text-fg md:hover:bg-panel/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`hidden font-mono text-tiny font-bold md:inline ${
                    isActive ? "text-f1red" : "text-muted/60"
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeTab === "general" && (
            <div
              id="general-settings-panel"
              role="tabpanel"
              aria-labelledby="general-settings-tab"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            >
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
              <SectionHeader>Privacy</SectionHeader>
              <SettingRow
                label="Session replay"
                description="Share a 10% sample of interactions with Amplitude to improve the app. Turn off to stop future recordings."
                checked={settings.amplitudeSessionReplayEnabled}
                onChange={toggle("amplitudeSessionReplayEnabled")}
              />
            </div>
          )}

          {activeTab === "playback" && (
            <div
              id="playback-settings-panel"
              role="tabpanel"
              aria-labelledby="playback-settings-tab"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            >
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
                <ChipField label="Default visible event types" muted>
                  {CATCHUP_EVENT_TYPE_OPTIONS.map(({ kind, label, color }) => {
                    const active =
                      settings.catchupSummaryDefaultFilters.includes(kind);
                    return (
                      <Chip
                        key={kind}
                        label={label}
                        color={color}
                        active={active}
                        onToggle={() => {
                          const current = settings.catchupSummaryDefaultFilters;
                          const next = active
                            ? current.filter((k) => k !== kind)
                            : [...current, kind];
                          if (next.length > 0)
                            updateSetting("catchupSummaryDefaultFilters", next);
                        }}
                      />
                    );
                  })}
                </ChipField>
              )}
            </div>
          )}

          {activeTab === "notifications" && (
            <div
              id="notifications-settings-panel"
              role="tabpanel"
              aria-labelledby="notifications-settings-tab"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            >
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
              <ChipField label="Default visible event types" muted>
                {NOTIFICATION_EVENT_TYPE_OPTIONS.map(({ key, label, color }) => (
                  <Chip
                    key={key}
                    label={label}
                    color={color}
                    active={settings[key]}
                    disabled={!settings.toastsEnabled}
                    onToggle={() =>
                      updateSetting(key, !settings[key] as AppSettings[typeof key])
                    }
                  />
                ))}
              </ChipField>
            </div>
          )}

          {activeTab === "timing" && (
            <div
              id="timing-settings-panel"
              role="tabpanel"
              aria-labelledby="timing-settings-tab"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            >
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
                <SettingRow
                  label="Compact telemetry column"
                  description="Show RPM, gear, throttle, brake and DRS in a single tracker column"
                  checked={settings.trackerTimingCompactColumn}
                  onChange={toggle("trackerTimingCompactColumn")}
                  disabled={!settings.trackerTimingTelemetry}
                />
              )}
              {!isMobileViewport && (
                <ChipField
                  label="Driver tracker columns"
                  description="Pick which leaderboard-style timing columns appear in the tracker table"
                >
                  {trackerTimingColumns.map(({ label, active, onToggle }) => (
                    <Chip
                      key={label}
                      label={label}
                      active={active}
                      onToggle={onToggle}
                    />
                  ))}
                </ChipField>
              )}
              {isMobileViewport && (
                <div>
                  <SettingRow
                    label="Mobile timing car data"
                    description="Show speed, RPM, gear, DRS, throttle and brake in tracker timing rows on mobile"
                    checked={settings.trackerTimingMobileCarData}
                    onChange={toggle("trackerTimingMobileCarData")}
                  />
                  <ChipField
                    label="Mobile timing columns"
                    description="Pick which timing columns appear in mobile timing rows"
                  >
                    {mobileTimingColumns.map(({ label, active, onToggle }) => (
                      <Chip
                        key={label}
                        label={label}
                        active={active}
                        onToggle={onToggle}
                      />
                    ))}
                  </ChipField>
                </div>
              )}
            </div>
          )}

          {activeTab === "telemetry" && (
            <div
              id="telemetry-settings-panel"
              role="tabpanel"
              aria-labelledby="telemetry-settings-tab"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            >
              <SectionHeader>Telemetry Charts</SectionHeader>
              <SettingRow
                label="Low speed corner bands"
                description={`Shade corners with an apex below ${CORNER_LOW_SPEED_KMH} km/h on telemetry charts`}
                checked={settings.telemetryCornerZonesLow}
                onChange={toggle("telemetryCornerZonesLow")}
              />
              <SettingRow
                label="Medium speed corner bands"
                description={`Shade corners with a ${CORNER_LOW_SPEED_KMH}–${CORNER_HIGH_SPEED_KMH - 1} km/h apex on telemetry charts`}
                checked={settings.telemetryCornerZonesMedium}
                onChange={toggle("telemetryCornerZonesMedium")}
              />
              <SettingRow
                label="High speed corner bands"
                description={`Shade corners with an apex of ${CORNER_HIGH_SPEED_KMH} km/h or more on telemetry charts`}
                checked={settings.telemetryCornerZonesHigh}
                onChange={toggle("telemetryCornerZonesHigh")}
              />
            </div>
          )}

          {activeTab === "track" && (
            <div
              id="track-settings-panel"
              role="tabpanel"
              aria-labelledby="track-settings-tab"
              className="flex min-h-0 flex-1 flex-col"
            >
              <TrackMapSettings
                settings={settings}
                toggle={toggle}
                setViewMode={(mode) => updateSetting("mapViewMode", mode)}
              />
            </div>
          )}

          {activeTab === "interface" && (
            <div
              id="interface-settings-panel"
              role="tabpanel"
              aria-labelledby="interface-settings-tab"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            >
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
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-panel pt-3">
        <span className="font-mono text-tiny uppercase tracking-caps text-muted">
          Changes apply instantly
        </span>
        <button
          type="button"
          onClick={(e) => {
            animateMotion(e.currentTarget, pressMotion());
            reset();
            trackEvent("settings_reset_defaults");
          }}
          className={buttonClass("secondary")}
        >
          Reset to defaults
        </button>
      </div>
    </>
  );
}
