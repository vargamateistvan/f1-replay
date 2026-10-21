import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CornerSpeedClass } from "@/utils/corners";

export type MapViewMode = "2d" | "3d" | "ring";

// All user-configurable preferences. These are persisted to localStorage.
export interface AppSettings {
  // Notifications
  toastsEnabled: boolean;
  toastRadio: boolean;
  toastRadioAutoplay: boolean;
  toastSoundsEnabled: boolean;
  toastFlag: boolean;
  toastInvestigation: boolean;
  toastPenalty: boolean;
  toastOvertake: boolean;
  toastPit: boolean;
  toastFastestLap: boolean;
  notificationMaxVisible: 2 | 4 | 6 | 8;
  // Track Map
  mapShowCompoundBadges: boolean;
  mapShowBattleRings: boolean;
  mapShowDriverHud: boolean;
  mapShowSectorFlags: boolean;
  mapShowSectorBox: boolean;
  mapShowTrackControls: boolean;
  mapShowCompass: boolean;
  mapShowWeather: boolean;
  mapShowClock: boolean;
  mapShowDriverAcronym: boolean;
  mapShowDriverNumberInside: boolean;
  mapShowRaceLeader: boolean;
  mapStartLightsSound: boolean;
  mapShowEnhancedVisuals: boolean;
  mapShowMarshalHeatmap: boolean;
  mapShowCornerNumbers: boolean;
  mapShowElevation: boolean;
  mapShowPitRejoin: boolean;
  /** Track map view: SVG map, Mapbox 3D map (when available), or the lap-progress ring. */
  mapViewMode: MapViewMode;
  /** Ring view: space the circle by lap time (reference lap) instead of distance. */
  mapRingTimeScale: boolean;
  /** Ring view: label gaps to the car ahead or to the leader. */
  mapRingGapMode: "interval" | "leader";
  /** Ring view: run the lap anticlockwise. */
  mapRingReverse: boolean;
  /** 3D map lighting follows the sun at the circuit at the playhead (else the app theme). */
  mapView3dSessionLighting: boolean;
  /** 3D map: drape everything over Mapbox terrain (elevation). */
  mapView3dTerrain: boolean;
  /** 3D map: paint flags (marshal posts + flagged sectors) onto the track. */
  mapView3dFlagColors: boolean;
  /** 3D map: per-sector condition ribbon (green when clear, flag colour when flagged). */
  mapView3dSectorRibbon: boolean;
  /** 3D map: rain from the session's weather data. */
  mapView3dWeatherEffects: boolean;
  /** 3D map: Standard style 3D buildings, trees and landmarks. */
  mapView3dBuildings: boolean;
  /** 3D map: 3D car models when zoomed in (off = 2D-style markers at every zoom). */
  mapView3dCarModels: boolean;
  /** 3D map: colour the focused car's trail by speed (else its team colour). */
  mapView3dSpeedTrail: boolean;
  /** 3D map: ribbon + interval between cars battling within 1 s (races). */
  mapView3dBattleGaps: boolean;
  // Leaderboard
  leaderboardTelemetry: boolean;
  timingShowMinisectors: boolean;
  // Driver Tracker
  trackerTimingTelemetry: boolean;
  trackerTimingCompactColumn: boolean;
  trackerTimingMobileCarData: boolean;
  trackerTimingShowPosition: boolean;
  trackerTimingShowDriver: boolean;
  trackerTimingShowAlerts: boolean;
  trackerTimingShowBestLap: boolean;
  trackerTimingShowLastLap: boolean;
  trackerTimingShowGap: boolean;
  trackerTimingShowInterval: boolean;
  trackerTimingShowS1: boolean;
  trackerTimingShowS2: boolean;
  trackerTimingShowS3: boolean;
  trackerTimingShowPosDelta: boolean;
  trackerTimingShowTyre: boolean;
  trackerTimingShowPit: boolean;
  trackerTimingShowLap: boolean;
  trackerTimingShowSpeed: boolean;
  trackerTimingShowGear: boolean;
  trackerTimingShowRpm: boolean;
  trackerTimingShowThrBrk: boolean;
  trackerTimingShowDrs: boolean;
  timingMobileShowPosition: boolean;
  timingMobileShowDriver: boolean;
  timingMobileShowAlerts: boolean;
  timingMobileShowBestLap: boolean;
  timingMobileShowLastLap: boolean;
  timingMobileShowGap: boolean;
  timingMobileShowS1: boolean;
  timingMobileShowS2: boolean;
  timingMobileShowS3: boolean;
  timingMobileShowPosDelta: boolean;
  timingMobileShowTyre: boolean;
  timingMobileShowPitCount: boolean;
  timingMobileShowInterval: boolean;
  timingMobileShowLap: boolean;
  trackScreenshotPngEnabled: boolean;
  // Telemetry charts: corner speed bands per class
  telemetryCornerZonesLow: boolean;
  telemetryCornerZonesMedium: boolean;
  telemetryCornerZonesHigh: boolean;
  // Support
  showCoffeeWidget: boolean;
  // Playback
  defaultSpeed: number;
  showPlaybackSpeedControls: boolean;
  showPlaybackEventChips: boolean;
  catchupSummaryEnabled: boolean;
  catchupSummaryDefaultFilters: string[];
  showCsvExportButtons: boolean;
  showNextRaceWeekendBanner: boolean;
  // Appearance
  lightMode: boolean;
  // Units
  metricSystem: "metric" | "imperial";
  // Onboarding
  /** Last `TOUR_VERSION` the user finished or skipped (0 = never). Kept on reset. */
  tourSeenVersion: number;
}

/** Setting that controls whether each corner speed class is shaded on telemetry charts. */
export const TELEMETRY_CORNER_ZONE_SETTINGS = {
  low: "telemetryCornerZonesLow",
  medium: "telemetryCornerZonesMedium",
  high: "telemetryCornerZonesHigh",
} as const satisfies Record<CornerSpeedClass, keyof AppSettings>;

/** Category tabs in the settings panel; used to deep-link from a view. */
export const SETTINGS_TAB_IDS = [
  "general",
  "playback",
  "notifications",
  "timing",
  "telemetry",
  "track",
  "interface",
] as const;
export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

export function isSettingsTabId(value: unknown): value is SettingsTabId {
  return (SETTINGS_TAB_IDS as readonly unknown[]).includes(value);
}

interface SettingsStore extends AppSettings {
  isOpen: boolean;
  /** Tab the modal opens on. */
  modalTab: SettingsTabId;
  openModal: (tab?: SettingsTabId) => void;
  closeModal: () => void;
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  isTourOpen: boolean;
  openTour: () => void;
  closeTour: () => void;
  setSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  reset: () => void;
}

export const SETTINGS_DEFAULTS: AppSettings = {
  toastsEnabled: true,
  toastRadio: true,
  toastRadioAutoplay: false,
  toastSoundsEnabled: false,
  toastFlag: true,
  toastInvestigation: true,
  toastPenalty: true,
  toastOvertake: true,
  toastPit: true,
  toastFastestLap: true,
  notificationMaxVisible: 4,
  mapShowCompoundBadges: false,
  mapShowBattleRings: false,
  mapShowDriverHud: false,
  mapShowSectorFlags: true,
  mapShowSectorBox: false,
  mapShowTrackControls: true,
  mapShowCompass: true,
  mapShowWeather: true,
  mapShowClock: false,
  mapShowDriverAcronym: true,
  mapShowDriverNumberInside: false,
  mapShowRaceLeader: true,
  mapStartLightsSound: true,
  mapShowEnhancedVisuals: true,
  mapShowMarshalHeatmap: false,
  mapShowCornerNumbers: false,
  mapShowElevation: false,
  mapShowPitRejoin: true,
  mapViewMode: "2d",
  mapRingTimeScale: true,
  mapRingGapMode: "interval",
  mapRingReverse: false,
  mapView3dSessionLighting: true,
  mapView3dTerrain: false,
  mapView3dFlagColors: true,
  mapView3dSectorRibbon: true,
  mapView3dWeatherEffects: true,
  mapView3dBuildings: true,
  mapView3dCarModels: true,
  mapView3dSpeedTrail: true,
  mapView3dBattleGaps: false,
  leaderboardTelemetry: true,
  timingShowMinisectors: true,
  trackerTimingTelemetry: true,
  trackerTimingCompactColumn: true,
  trackerTimingMobileCarData: false,
  trackerTimingShowPosition: true,
  trackerTimingShowDriver: true,
  trackerTimingShowAlerts: true,
  trackerTimingShowBestLap: true,
  trackerTimingShowLastLap: false,
  trackerTimingShowGap: true,
  trackerTimingShowInterval: false,
  trackerTimingShowS1: true,
  trackerTimingShowS2: true,
  trackerTimingShowS3: true,
  trackerTimingShowPosDelta: true,
  trackerTimingShowTyre: true,
  trackerTimingShowPit: true,
  trackerTimingShowLap: false,
  trackerTimingShowSpeed: true,
  trackerTimingShowGear: false,
  trackerTimingShowRpm: false,
  trackerTimingShowThrBrk: true,
  trackerTimingShowDrs: true,
  timingMobileShowPosition: true,
  timingMobileShowDriver: true,
  timingMobileShowAlerts: false,
  timingMobileShowBestLap: true,
  timingMobileShowLastLap: false,
  timingMobileShowGap: true,
  timingMobileShowS1: false,
  timingMobileShowS2: false,
  timingMobileShowS3: false,
  timingMobileShowPosDelta: true,
  timingMobileShowTyre: true,
  timingMobileShowPitCount: true,
  timingMobileShowInterval: false,
  timingMobileShowLap: false,
  trackScreenshotPngEnabled: false,
  telemetryCornerZonesLow: true,
  telemetryCornerZonesMedium: true,
  telemetryCornerZonesHigh: true,
  showCoffeeWidget: true,
  defaultSpeed: 4,
  showPlaybackSpeedControls: true,
  showPlaybackEventChips: true,
  catchupSummaryEnabled: true,
  catchupSummaryDefaultFilters: [
    "penalty",
    "fastest_lap",
    "investigation",
    "radio",
  ],
  showCsvExportButtons: true,
  showNextRaceWeekendBanner: true,
  lightMode: false,
  metricSystem: "metric",
  tourSeenVersion: 0,
};

/**
 * v0 → v1: the `mapView3d` boolean became `mapViewMode` (adds the ring view).
 * Unknown fields are kept; missing ones are filled from the defaults on merge.
 */
export function migrateSettings(persisted: unknown, version: number): AppSettings {
  const state = { ...(persisted as Record<string, unknown> | null) };
  if (version < 1) {
    if (state.mapViewMode === undefined) {
      state.mapViewMode = state.mapView3d === true ? "3d" : "2d";
    }
    delete state.mapView3d;
  }
  return state as unknown as AppSettings;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...SETTINGS_DEFAULTS,
      isOpen: false,
      modalTab: "general",
      openModal: (tab = "general") => set({ isOpen: true, modalTab: tab }),
      closeModal: () => set({ isOpen: false }),
      isHelpOpen: false,
      openHelp: () => set({ isHelpOpen: true }),
      closeHelp: () => set({ isHelpOpen: false }),
      isTourOpen: false,
      openTour: () => set({ isTourOpen: true }),
      closeTour: () => set({ isTourOpen: false }),
      setSetting: (key, value) => set((s) => ({ ...s, [key]: value })),
      // Resetting preferences shouldn't replay the tour.
      reset: () =>
        set((s) => ({
          ...s,
          ...SETTINGS_DEFAULTS,
          tourSeenVersion: s.tourSeenVersion,
        })),
    }),
    {
      name: "f1-replay-settings",
      version: 1,
      migrate: migrateSettings,
      // Only persist the AppSettings fields, not the modal state or actions.
      partialize: (state) => {
        const {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          isOpen,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          modalTab,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          openModal,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          closeModal,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          isHelpOpen,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          openHelp,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          closeHelp,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          isTourOpen,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          openTour,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          closeTour,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          setSetting,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          reset,
          ...settings
        } = state;
        return settings as AppSettings;
      },
    },
  ),
);
