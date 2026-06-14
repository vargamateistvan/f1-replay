import { create } from "zustand";
import { persist } from "zustand/middleware";

// All user-configurable preferences. These are persisted to localStorage.
export interface AppSettings {
  // Notifications
  toastsEnabled: boolean;
  toastRadio: boolean;
  toastFlag: boolean;
  toastOvertake: boolean;
  toastPit: boolean;
  toastFastestLap: boolean;
  // Track Map
  mapShowLeaderboard: boolean;
  mapShowCompoundBadges: boolean;
  mapShowBattleRings: boolean;
  mapShowDriverHud: boolean;
  mapShowSectorFlags: boolean;
  // Leaderboard
  leaderboardTelemetry: boolean;
  // Playback
  defaultSpeed: number;
  catchupSummaryEnabled: boolean;
}

interface SettingsStore extends AppSettings {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  setSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  reset: () => void;
}

export const SETTINGS_DEFAULTS: AppSettings = {
  toastsEnabled: true,
  toastRadio: true,
  toastFlag: true,
  toastOvertake: true,
  toastPit: true,
  toastFastestLap: true,
  mapShowLeaderboard: true,
  mapShowCompoundBadges: true,
  mapShowBattleRings: true,
  mapShowDriverHud: true,
  mapShowSectorFlags: true,
  leaderboardTelemetry: true,
  defaultSpeed: 1,
  catchupSummaryEnabled: true,
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...SETTINGS_DEFAULTS,
      isOpen: false,
      openModal: () => set({ isOpen: true }),
      closeModal: () => set({ isOpen: false }),
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
