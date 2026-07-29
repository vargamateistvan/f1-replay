import type { ReactNode } from "react";
import { useSettings, type AppSettings } from "@/stores/settings";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { trackEvent } from "@/lib/analytics";
import { SPEEDS } from "@/constants";
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_OPTIONS,
  type SupportedLanguage,
} from "@/i18n/language";
import { t } from "@/i18n/translations";

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
  { kind: "pit", labelKey: "settings.eventTypes.pit", color: "#3d78ff" },
  { kind: "flag", labelKey: "settings.eventTypes.flag", color: "#f5a623" },
  {
    kind: "penalty",
    labelKey: "settings.eventTypes.penalty",
    color: "#e8002d",
  },
  {
    kind: "overtake",
    labelKey: "settings.eventTypes.overtake",
    color: "#22c55e",
  },
  {
    kind: "fastest_lap",
    labelKey: "settings.eventTypes.fastestLap",
    color: "#9b59f5",
  },
  {
    kind: "investigation",
    labelKey: "settings.eventTypes.investigation",
    color: "#f5a623",
  },
  { kind: "radio", labelKey: "settings.eventTypes.radio", color: "#6b6b7a" },
] as const;

const NOTIFICATION_EVENT_TYPE_OPTIONS = [
  { key: "toastPit", labelKey: "settings.eventTypes.pit", color: "#3d78ff" },
  { key: "toastFlag", labelKey: "settings.eventTypes.flag", color: "#f5a623" },
  {
    key: "toastPenalty",
    labelKey: "settings.eventTypes.penalty",
    color: "#e8002d",
  },
  {
    key: "toastOvertake",
    labelKey: "settings.eventTypes.overtake",
    color: "#22c55e",
  },
  {
    key: "toastFastestLap",
    labelKey: "settings.eventTypes.fastestLap",
    color: "#9b59f5",
  },
  {
    key: "toastInvestigation",
    labelKey: "settings.eventTypes.investigation",
    color: "#f5a623",
  },
  {
    key: "toastRadio",
    labelKey: "settings.eventTypes.radio",
    color: "#6b6b7a",
  },
] as const;

export function SpeedSelector({
  language,
  value,
  onChange,
}: {
  language: SupportedLanguage;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-panel">
      <div>
        <div className="text-[13px] text-white/90 leading-tight">
          {t(language, "settings.playback.defaultSpeed.label")}
        </div>
        <div className="text-[11px] text-muted mt-0.5 leading-tight">
          {t(language, "settings.playback.defaultSpeed.description")}
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
  language,
  value,
  onChange,
  disabled = false,
}: {
  language: SupportedLanguage;
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
          {t(language, "settings.notifications.maxVisible.label")}
        </div>
        <div className="text-[11px] text-muted mt-0.5 leading-tight">
          {t(language, "settings.notifications.maxVisible.description")}
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
  language,
  value,
  onChange,
}: {
  language: SupportedLanguage;
  value: "metric" | "imperial";
  onChange: (v: "metric" | "imperial") => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-panel">
      <div>
        <div className="text-[13px] text-white/90 leading-tight">
          {t(language, "settings.units.label")}
        </div>
        <div className="text-[11px] text-muted mt-0.5 leading-tight">
          {t(language, "settings.units.description")}
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
            {unit === "metric"
              ? t(language, "settings.units.metric")
              : t(language, "settings.units.imperial")}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LanguageSelector({
  value,
  onChange,
}: {
  value: SupportedLanguage;
  onChange: (v: SupportedLanguage) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-panel">
      <div>
        <div className="text-[13px] text-white/90 leading-tight">
          {t(value, "settings.language.label")}
        </div>
        <div className="text-[11px] text-muted mt-0.5 leading-tight">
          {t(value, "settings.language.description")}
        </div>
      </div>
      <select
        aria-label={t(value, "settings.language.label")}
        value={value}
        onChange={(event) => onChange(event.target.value as SupportedLanguage)}
        className="h-8 min-w-[140px] rounded border border-panel bg-track px-2 text-[11px] font-bold text-white outline-none transition-colors focus:border-f1red"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Settings body (all sections) ──────────────────────────────────────────────

export function SettingsBody() {
  const { setSetting, reset, ...settings } = useSettings();
  const isMobileViewport = useMediaQuery("(max-width: 767px)");
  const language = settings.language ?? FALLBACK_LANGUAGE;
  const tr = (key: string) => t(language, key);

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

  const translatedTrackerTimingColumns = trackerTimingColumns.map((column) => ({
    ...column,
    label: tr(
      `settings.columns.${column.label.toLowerCase().replace("/", "").replace(" ", "")}`,
    ),
  }));

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

  const translatedMobileTimingColumns = mobileTimingColumns.map((column) => ({
    ...column,
    label: tr(
      `settings.columns.${column.label.toLowerCase().replace("/", "").replace(" ", "")}`,
    ),
  }));

  return (
    <>
      <SectionHeader>{tr("settings.sections.appearance")}</SectionHeader>
      <LanguageSelector
        value={language}
        onChange={(v) => updateSetting("language", v)}
      />
      <SettingRow
        label={tr("settings.lightMode.label")}
        description={tr("settings.lightMode.description")}
        checked={settings.lightMode}
        onChange={toggle("lightMode")}
      />
      <UnitSelector
        language={language}
        value={settings.metricSystem}
        onChange={(v) => updateSetting("metricSystem", v)}
      />

      <SectionHeader>{tr("settings.sections.playback")}</SectionHeader>
      <SpeedSelector
        language={language}
        value={settings.defaultSpeed}
        onChange={(v) => updateSetting("defaultSpeed", v)}
      />
      <SettingRow
        label={tr("settings.playback.speedControls.label")}
        description={tr("settings.playback.speedControls.description")}
        checked={settings.showPlaybackSpeedControls}
        onChange={toggle("showPlaybackSpeedControls")}
      />
      <SettingRow
        label={tr("settings.playback.forwardChips.label")}
        description={tr("settings.playback.forwardChips.description")}
        checked={settings.showPlaybackEventChips}
        onChange={toggle("showPlaybackEventChips")}
      />
      <SettingRow
        label={tr("settings.playback.catchupSummary.label")}
        description={tr("settings.playback.catchupSummary.description")}
        checked={settings.catchupSummaryEnabled}
        onChange={toggle("catchupSummaryEnabled")}
      />
      {settings.catchupSummaryEnabled && (
        <div className="py-2.5 border-b border-panel">
          <div className="text-[11px] text-muted mb-2 leading-tight">
            {tr("settings.defaultVisibleEventTypes")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATCHUP_EVENT_TYPE_OPTIONS.map(({ kind, labelKey, color }) => {
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
                  {tr(labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <SectionHeader>{tr("settings.sections.notifications")}</SectionHeader>
      <SettingRow
        label={tr("settings.notifications.enable.label")}
        description={tr("settings.notifications.enable.description")}
        checked={settings.toastsEnabled}
        onChange={toggle("toastsEnabled")}
      />
      <NotificationLimitSelector
        language={language}
        value={settings.notificationMaxVisible}
        onChange={(v) => updateSetting("notificationMaxVisible", v)}
        disabled={!settings.toastsEnabled}
      />
      <div className="-mt-2.5 mb-1 text-[10px] text-muted/80 leading-tight border-b border-panel pb-2.5">
        {tr("settings.notifications.stackHint")}
      </div>
      <SettingRow
        label={tr("settings.notifications.autoPlayRadio.label")}
        description={tr("settings.notifications.autoPlayRadio.description")}
        checked={settings.toastRadioAutoplay}
        onChange={toggle("toastRadioAutoplay")}
        disabled={!settings.toastsEnabled || !settings.toastRadio}
      />
      <SettingRow
        label={tr("settings.notifications.sounds.label")}
        description={tr("settings.notifications.sounds.description")}
        checked={settings.toastSoundsEnabled}
        onChange={toggle("toastSoundsEnabled")}
        disabled={!settings.toastsEnabled}
      />
      <div className="py-2.5 border-b border-panel">
        <div className="text-[11px] text-muted mb-2 leading-tight">
          {tr("settings.defaultVisibleEventTypes")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {NOTIFICATION_EVENT_TYPE_OPTIONS.map(({ key, labelKey, color }) => {
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
                {tr(labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <SectionHeader>{tr("settings.sections.raceViews")}</SectionHeader>
      <SettingRow
        label={tr("settings.raceViews.liveTelemetry.label")}
        description={tr("settings.raceViews.liveTelemetry.description")}
        checked={settings.leaderboardTelemetry}
        onChange={toggle("leaderboardTelemetry")}
      />
      <SettingRow
        label={tr("settings.raceViews.timingMinisectors.label")}
        description={tr("settings.raceViews.timingMinisectors.description")}
        checked={settings.timingShowMinisectors}
        onChange={toggle("timingShowMinisectors")}
      />
      {!isMobileViewport && (
        <SettingRow
          label={tr("settings.raceViews.timingBoxTelemetry.label")}
          description={tr("settings.raceViews.timingBoxTelemetry.description")}
          checked={settings.trackerTimingTelemetry}
          onChange={toggle("trackerTimingTelemetry")}
        />
      )}
      {!isMobileViewport && (
        <div className="py-2.5 border-b border-panel">
          <div className="text-[13px] text-white/90 leading-tight">
            {tr("settings.raceViews.trackerColumns.title")}
          </div>
          <div className="text-[11px] text-muted mt-0.5 leading-tight">
            {tr("settings.raceViews.trackerColumns.description")}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {translatedTrackerTimingColumns.map(
              ({ label, active, onToggle }) => (
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
              ),
            )}
          </div>
        </div>
      )}
      {isMobileViewport && (
        <div>
          <SettingRow
            label={tr("settings.raceViews.mobileTimingCarData.label")}
            description={tr(
              "settings.raceViews.mobileTimingCarData.description",
            )}
            checked={settings.trackerTimingMobileCarData}
            onChange={toggle("trackerTimingMobileCarData")}
          />
          <div className="py-2.5 border-b border-panel">
            <div className="text-[13px] text-white/90 leading-tight">
              {tr("settings.raceViews.mobileColumns.title")}
            </div>
            <div className="text-[11px] text-muted mt-0.5 leading-tight">
              {tr("settings.raceViews.mobileColumns.description")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {translatedMobileTimingColumns.map(
                ({ label, active, onToggle }) => (
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
                ),
              )}
            </div>
          </div>
        </div>
      )}

      <SectionHeader>{tr("settings.sections.trackMap")}</SectionHeader>
      <SettingRow
        label={tr("settings.trackMap.tyreBadges.label")}
        description={tr("settings.trackMap.tyreBadges.description")}
        checked={settings.mapShowCompoundBadges}
        onChange={toggle("mapShowCompoundBadges")}
      />
      <SettingRow
        label={tr("settings.trackMap.drsRings.label")}
        description={tr("settings.trackMap.drsRings.description")}
        checked={settings.mapShowBattleRings}
        onChange={toggle("mapShowBattleRings")}
      />
      <SettingRow
        label={tr("settings.trackMap.focusHud.label")}
        description={tr("settings.trackMap.focusHud.description")}
        checked={settings.mapShowDriverHud}
        onChange={toggle("mapShowDriverHud")}
      />
      <SettingRow
        label={tr("settings.trackMap.sectorFlagColoring.label")}
        description={tr("settings.trackMap.sectorFlagColoring.description")}
        checked={settings.mapShowSectorFlags}
        onChange={toggle("mapShowSectorFlags")}
      />
      <SettingRow
        label={tr("settings.trackMap.sectorStatusBox.label")}
        description={tr("settings.trackMap.sectorStatusBox.description")}
        checked={settings.mapShowSectorBox}
        onChange={toggle("mapShowSectorBox")}
      />
      <SettingRow
        label={tr("settings.trackMap.controls.label")}
        description={tr("settings.trackMap.controls.description")}
        checked={settings.mapShowTrackControls}
        onChange={toggle("mapShowTrackControls")}
      />
      <SettingRow
        label={tr("settings.trackMap.compass.label")}
        description={tr("settings.trackMap.compass.description")}
        checked={settings.mapShowCompass}
        onChange={toggle("mapShowCompass")}
      />
      <SettingRow
        label={tr("settings.trackMap.weather.label")}
        description={tr("settings.trackMap.weather.description")}
        checked={settings.mapShowWeather}
        onChange={toggle("mapShowWeather")}
      />
      <SettingRow
        label={tr("settings.trackMap.clock.label")}
        description={tr("settings.trackMap.clock.description")}
        checked={settings.mapShowClock}
        onChange={toggle("mapShowClock")}
      />
      <SettingRow
        label={tr("settings.trackMap.driverAcronym.label")}
        description={tr("settings.trackMap.driverAcronym.description")}
        checked={settings.mapShowDriverAcronym}
        onChange={toggle("mapShowDriverAcronym")}
      />
      <SettingRow
        label={tr("settings.trackMap.driverNumberInside.label")}
        description={tr("settings.trackMap.driverNumberInside.description")}
        checked={settings.mapShowDriverNumberInside}
        onChange={toggle("mapShowDriverNumberInside")}
      />
      <SettingRow
        label={tr("settings.trackMap.enhancedVisuals.label")}
        description={tr("settings.trackMap.enhancedVisuals.description")}
        checked={settings.mapShowEnhancedVisuals}
        onChange={toggle("mapShowEnhancedVisuals")}
      />
      <SettingRow
        label={tr("settings.trackMap.marshalHeatmap.label")}
        description={tr("settings.trackMap.marshalHeatmap.description")}
        checked={settings.mapShowMarshalHeatmap}
        onChange={toggle("mapShowMarshalHeatmap")}
      />
      <SettingRow
        label={tr("settings.trackMap.cornerNumbers.label")}
        description={tr("settings.trackMap.cornerNumbers.description")}
        checked={settings.mapShowCornerNumbers}
        onChange={toggle("mapShowCornerNumbers")}
      />
      <SettingRow
        label={tr("settings.trackMap.elevationHeatmap.label")}
        description={tr("settings.trackMap.elevationHeatmap.description")}
        checked={settings.mapShowElevation}
        onChange={toggle("mapShowElevation")}
      />
      <SettingRow
        label={tr("settings.trackMap.pngSnapshot.label")}
        description={tr("settings.trackMap.pngSnapshot.description")}
        checked={settings.trackScreenshotPngEnabled}
        onChange={toggle("trackScreenshotPngEnabled")}
      />

      <SectionHeader>{tr("settings.sections.dataInterface")}</SectionHeader>
      <SettingRow
        label={tr("settings.dataInterface.csvExport.label")}
        description={tr("settings.dataInterface.csvExport.description")}
        checked={settings.showCsvExportButtons}
        onChange={toggle("showCsvExportButtons")}
      />
      <SettingRow
        label={tr("settings.dataInterface.nextRaceBanner.label")}
        description={tr("settings.dataInterface.nextRaceBanner.description")}
        checked={settings.showNextRaceWeekendBanner}
        onChange={toggle("showNextRaceWeekendBanner")}
      />

      <SectionHeader>{tr("settings.sections.support")}</SectionHeader>
      <SettingRow
        label={tr("settings.support.coffeeButton.label")}
        description={tr("settings.support.coffeeButton.description")}
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
          {tr("settings.resetDefaults")}
        </button>
      </div>
    </>
  );
}
