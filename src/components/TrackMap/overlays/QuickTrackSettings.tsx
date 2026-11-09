import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";
import { Button } from "@/components/Button/Button";
import { useSettings, type AppSettings, type MapViewMode } from "@/stores/settings";
import { MAP_QUICK_SETTINGS_INSET } from "@/constants";
import { trackEvent } from "@/lib/analytics";

type BooleanSetting = {
  [Key in keyof AppSettings]: AppSettings[Key] extends boolean ? Key : never;
}[keyof AppSettings];
type Option = readonly [BooleanSetting | readonly BooleanSetting[], string];

const COMMON: readonly Option[] = [
  ["mapShowWeather", "Weather readings"],
  ["mapShowDriverAcronym", "Driver labels"],
  ["mapShowDriverNumberInside", "Driver numbers"],
  ["mapShowCompoundBadges", "Tyre badges"],
  ["mapShowSectorFlags", "Sector flags"],
  ["mapShowDriverHud", "Focused driver HUD"],
  ["mapShowCornerNumbers", "Corner numbers"],
  ["mapShowClock", "Track clock"],
];
const VIEW_OPTIONS: Record<MapViewMode, readonly Option[]> = {
  "2d": [
    ["mapWeatherEffectsEnabled", "Weather effects"],
    ["mapFollowFocusedCar", "Follow focused car"],
    ["mapShowDriverHeatmap", "Driver heatmap"],
    ["mapShowPitRejoin", "Pit rejoin projection"],
    ["mapShowKerbs", "Track kerbs"],
    ["mapShowCompass", "Compass"],
  ],
  ring: [
    ["mapWeatherEffectsEnabled", "Weather effects"],
    ["mapRingTimeScale", "Space by lap time"],
    ["mapRingReverse", "Anticlockwise"],
    ["mapRingShowPitWindowOutcomes", "Pit window outcomes"],
  ],
  "3d": [
    ["mapView3dWeatherEffects", "Weather effects"],
    ["mapFollowFocusedCar", "Follow focused car"],
    ["mapShowDriverHeatmap", "Driver heatmap"],
    ["mapShowPitRejoin", "Pit rejoin projection"],
    ["mapView3dSessionLighting", "Session lighting"],
    ["mapView3dCarModels", "3D car models"],
    ["mapView3dKerbs", "Track kerbs"],
    ["mapView3dRunoff", "Run-off areas"],
    ["mapView3dTerrain", "Terrain"],
  ],
};

const TIMING_DESKTOP: readonly Option[] = [
  ["trackerTimingTelemetry", "Telemetry columns"],
  ["trackerTimingCompactColumn", "Compact telemetry column"],
  ["timingShowMinisectors", "Mini-sectors"],
  ["trackerTimingShowPosition", "Position"],
  ["trackerTimingShowDriver", "Driver"],
  ["trackerTimingShowAlerts", "Alerts"],
  ["trackerTimingShowBestLap", "Best lap"],
  ["trackerTimingShowLastLap", "Last lap"],
  ["trackerTimingShowGap", "Gap"],
  ["trackerTimingShowInterval", "Interval"],
  [["trackerTimingShowS1", "trackerTimingShowS2", "trackerTimingShowS3"], "Sectors"],
  ["trackerTimingShowPosDelta", "Position change"],
  ["trackerTimingShowTyre", "Tyre"],
  ["trackerTimingShowPit", "Pit stops"],
  ["trackerTimingShowLap", "Lap"],
  ["trackerTimingShowSpeed", "Speed"],
  ["trackerTimingShowGear", "Gear"],
  ["trackerTimingShowRpm", "RPM"],
  ["trackerTimingShowThrBrk", "Throttle / brake"],
  ["trackerTimingShowDrs", "DRS"],
];
const TIMING_MOBILE: readonly Option[] = [
  ["trackerTimingMobileCarData", "Mobile telemetry"],
  ["timingShowMinisectors", "Mini-sectors"],
  ["timingMobileShowPosition", "Position"],
  ["timingMobileShowDriver", "Driver"],
  ["timingMobileShowAlerts", "Alerts"],
  ["timingMobileShowBestLap", "Best lap"],
  ["timingMobileShowLastLap", "Last lap"],
  ["timingMobileShowGap", "Gap"],
  ["timingMobileShowInterval", "Interval"],
  [["timingMobileShowS1", "timingMobileShowS2", "timingMobileShowS3"], "Sectors"],
  ["timingMobileShowPosDelta", "Position change"],
  ["timingMobileShowTyre", "Tyre"],
  ["timingMobileShowPitCount", "Pit stops"],
  ["timingMobileShowLap", "Lap"],
];

export function QuickTrackSettings({
  view,
  buttonClass,
  onOpenSettings,
  mobileTiming = false,
}: {
  view: MapViewMode | "timing";
  buttonClass: string;
  onOpenSettings?: () => void;
  mobileTiming?: boolean;
}) {
  const settings = useSettings((state) => state);
  const timing = view === "timing";
  const label = timing ? "Quick timing settings" : "Quick track settings";
  const groups = timing ? [mobileTiming ? TIMING_MOBILE : TIMING_DESKTOP] : [VIEW_OPTIONS[view], COMMON];
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const contains = (target: EventTarget | null) =>
    target instanceof Node && (rootRef.current?.contains(target) || panelRef.current?.contains(target));

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!trigger || !panel) return;
      setPosition({
        top: Math.max(MAP_QUICK_SETTINGS_INSET, Math.min(
          trigger.bottom + MAP_QUICK_SETTINGS_INSET,
          window.innerHeight - panel.height - MAP_QUICK_SETTINGS_INSET,
        )),
        right: Math.max(MAP_QUICK_SETTINGS_INSET, Math.min(
          window.innerWidth - trigger.right,
          window.innerWidth - panel.width - MAP_QUICK_SETTINGS_INSET,
        )),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={`${buttonClass} ${open ? "!border-f1red" : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          style={position}
          className="fixed z-popover flex max-h-[calc(100dvh-1rem)] w-64 max-w-[calc(100vw-2rem)] flex-col rounded-sm border border-line bg-surface text-fg shadow-xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-panel px-3 py-2">
            <span className="text-caption font-black uppercase tracking-caps">
              {timing ? (mobileTiming ? "Mobile timing" : "Timing") : view === "ring" ? "Ring" : view.toUpperCase()} quick settings
            </span>
            <button
              type="button"
              aria-label={`Close ${label.toLowerCase()}`}
              className="p-1 text-muted hover:text-fg"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 max-h-80 overflow-y-auto overscroll-contain px-3">
            {groups.map((group, index) => (
              <div key={index} className={index ? "border-t border-line" : undefined}>
                {group.map(([key, label]) => {
                  const keys = typeof key === "string" ? [key] : key;
                  const checked = keys.every((setting) => settings[setting]);
                  return (
                  <button
                    key={keys.join(",")}
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    disabled={key === "trackerTimingCompactColumn" && !settings.trackerTimingTelemetry}
                    onClick={() => {
                      const enabled = !checked;
                      if (key === "mapFollowFocusedCar") trackEvent("trackmap_follow_toggled", { following: enabled, view });
                      if (key === "mapShowDriverHeatmap") trackEvent("trackmap_heatmap_toggled", { shown: enabled, view });
                      keys.forEach((setting) => settings.setSetting(setting, enabled));
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-panel py-2 text-left text-compact last:border-0 hover:text-f1red-fg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span>{label}</span>
                    <span
                      aria-hidden="true"
                      className={`relative h-4 w-7 shrink-0 border ${checked ? "border-f1red bg-f1red" : "border-line bg-track"}`}
                    >
                      <span className={`absolute top-0.5 h-2.5 w-2.5 ${checked ? "right-0.5 bg-white" : "left-0.5 bg-muted"}`} />
                    </span>
                  </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="shrink-0 border-t border-panel p-2">
            <Button
              variant="quiet"
              size="sm"
              className="w-full"
              onClick={() => {
                setOpen(false);
                (onOpenSettings ?? (() => settings.openModal(timing ? "timing" : "track")))();
              }}
            >
              {timing ? "All timing settings" : "All track settings"}
            </Button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
