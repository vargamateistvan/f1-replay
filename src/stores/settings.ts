import { create } from "zustand";
import { persist } from "zustand/middleware";

// All user-configurable preferences. These are persisted to localStorage.
export interface AppSettings {
  // Notifications
  toastsEnabled: boolean;
  toastRadio: boolean;
  toastRadioAutoplay: boolean;
  toastSoundsEnabled: boolean;
  toastFlag: boolean;
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
  // Leaderboard
  leaderboardTelemetry: boolean;
  timingShowMinisectors: boolean;
  // Driver Tracker
  trackerTimingTelemetry: boolean;
  trackScreenshotPngEnabled: boolean;
  // Support
  showCoffeeWidget: boolean;
  // Playback
  defaultSpeed: number;
  showPlaybackSpeedControls: boolean;
  showPlaybackEventChips: boolean;
  catchupSummaryEnabled: boolean;
  showCsvExportButtons: boolean;
  showNextRaceWeekendBanner: boolean;
  // Appearance
  lightMode: boolean;
}

interface SettingsStore extends AppSettings {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
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
  toastOvertake: true,
  toastPit: true,
  toastFastestLap: true,
  notificationMaxVisible: 4,
  mapShowCompoundBadges: true,
  mapShowBattleRings: true,
  mapShowDriverHud: true,
  mapShowSectorFlags: true,
  mapShowSectorBox: true,
  mapShowTrackControls: true,
  mapShowCompass: true,
  mapShowWeather: true,
  leaderboardTelemetry: true,
  timingShowMinisectors: true,
  trackerTimingTelemetry: false,
  trackScreenshotPngEnabled: true,
  showCoffeeWidget: true,
  defaultSpeed: 1,
  showPlaybackSpeedControls: true,
  showPlaybackEventChips: true,
  catchupSummaryEnabled: true,
  showCsvExportButtons: true,
  showNextRaceWeekendBanner: true,
  lightMode: false,
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...SETTINGS_DEFAULTS,
      isOpen: false,
      openModal: () => set({ isOpen: true }),
      closeModal: () => set({ isOpen: false }),
      isHelpOpen: false,
      openHelp: () => set({ isHelpOpen: true }),
      closeHelp: () => set({ isHelpOpen: false }),
      setSetting: (key, value) => set((s) => ({ ...s, [key]: value })),
      reset: () => set((s) => ({ ...s, ...SETTINGS_DEFAULTS })),
    }),
    {
      name: "f1-replay-settings",
      // Only persist the AppSettings fields, not the modal state or actions.
      partialize: (state) => {
        const {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          isOpen,
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
