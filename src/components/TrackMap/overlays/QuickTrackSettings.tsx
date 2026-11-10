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
type OptionGroup = {
  label: string;
  options: readonly Option[];
};

const CAR_OPTIONS: readonly Option[] = [
  ["mapShowDriverAcronym", "Driver labels"],
  ["mapShowDriverNumberInside", "Driver numbers"],
  ["mapShowCompoundBadges", "Tyre badges"],
  ["mapShowDriverHud", "Focused driver HUD"],
];
const VIEW_GROUPS: Record<MapViewMode, readonly OptionGroup[]> = {
  "2d": [
    { label: "Track", options: [
      ["mapShowSectorMarkers", "Sector markers"],
      ["mapShowSectorFlags", "Sector flags"],
      ["mapShowCornerNumbers", "Corner numbers"],
      ["mapShowKerbs", "Track kerbs"],
    ] },
    { label: "Cars", options: [
      ...CAR_OPTIONS,
      ["mapFollowFocusedCar", "Follow focused car"],
      ["mapShowDriverHeatmap", "Driver heatmap"],
      ["mapShowPitRejoin", "Pit rejoin projection"],
    ] },
    { label: "Weather", options: [
      ["mapShowWeather", "Weather readings"],
      ["mapWeatherEffectsEnabled", "Weather effects"],
    ] },
    { label: "Overlays", options: [
      ["mapShowCompass", "Compass"],
      ["mapShowClock", "Track clock"],
    ] },
  ],
  ring: [
    { label: "Track", options: [
      ["mapRingTimeScale", "Space by lap time"],
      ["mapRingReverse", "Anticlockwise"],
      ["mapShowSectorFlags", "Sector flags"],
      ["mapShowCornerNumbers", "Corner numbers"],
    ] },
    { label: "Cars", options: [
      ...CAR_OPTIONS,
      ["mapRingShowPitWindowOutcomes", "Pit window outcomes"],
    ] },
    { label: "Weather", options: [
      ["mapShowWeather", "Weather readings"],
      ["mapWeatherEffectsEnabled", "Weather effects"],
    ] },
    { label: "Overlays", options: [["mapShowClock", "Track clock"]] },
  ],
  "3d": [
    { label: "Track", options: [
      ["mapShowSectorFlags", "Sector flags"],
      ["mapShowCornerNumbers", "Corner numbers"],
      ["mapView3dKerbs", "Track kerbs"],
      ["mapView3dRunoff", "Run-off areas"],
      ["mapView3dTerrain", "Terrain"],
    ] },
    { label: "Cars", options: [
      ...CAR_OPTIONS,
      ["mapView3dCarModels", "3D car models"],
      ["mapFollowFocusedCar", "Follow focused car"],
      ["mapShowDriverHeatmap", "Driver heatmap"],
      ["mapShowPitRejoin", "Pit rejoin projection"],
    ] },
    { label: "Weather & lighting", options: [
      ["mapShowWeather", "Weather readings"],
      ["mapView3dWeatherEffects", "Weather effects"],
      ["mapView3dSessionLighting", "Session lighting"],
    ] },
    { label: "Overlays", options: [["mapShowClock", "Track clock"]] },
  ],
};

const TIMING_DESKTOP: readonly OptionGroup[] = [
  { label: "Drivers & positions", options: [
    ["trackerTimingShowPosition", "Position"],
    ["trackerTimingShowDriver", "Driver"],
    ["trackerTimingShowAlerts", "Alerts"],
    ["trackerTimingShowPosDelta", "Position change"],
  ] },
  { label: "Laps & gaps", options: [
    ["trackerTimingShowBestLap", "Best lap"],
    ["trackerTimingShowLastLap", "Last lap"],
    ["trackerTimingShowGap", "Gap"],
    ["trackerTimingShowInterval", "Interval"],
    [["trackerTimingShowS1", "trackerTimingShowS2", "trackerTimingShowS3"], "Sectors"],
    ["timingShowMinisectors", "Mini-sectors"],
    ["trackerTimingShowLap", "Lap"],
  ] },
  { label: "Tyres & pits", options: [
    ["trackerTimingShowTyre", "Tyre"],
    ["trackerTimingShowPit", "Pit stops"],
  ] },
  { label: "Telemetry", options: [
    ["trackerTimingTelemetry", "Telemetry columns"],
    ["trackerTimingCompactColumn", "Compact telemetry column"],
    ["trackerTimingShowSpeed", "Speed"],
    ["trackerTimingShowGear", "Gear"],
    ["trackerTimingShowRpm", "RPM"],
    ["trackerTimingShowThrBrk", "Throttle / brake"],
    ["trackerTimingShowDrs", "DRS"],
  ] },
];
const TIMING_MOBILE: readonly OptionGroup[] = [
  { label: "Drivers & positions", options: [
    ["timingMobileShowPosition", "Position"],
    ["timingMobileShowDriver", "Driver"],
    ["timingMobileShowAlerts", "Alerts"],
    ["timingMobileShowPosDelta", "Position change"],
  ] },
  { label: "Laps & gaps", options: [
    ["timingMobileShowBestLap", "Best lap"],
    ["timingMobileShowLastLap", "Last lap"],
    ["timingMobileShowGap", "Gap"],
    ["timingMobileShowInterval", "Interval"],
    [["timingMobileShowS1", "timingMobileShowS2", "timingMobileShowS3"], "Sectors"],
    ["timingShowMinisectors", "Mini-sectors"],
    ["timingMobileShowLap", "Lap"],
  ] },
  { label: "Tyres & pits", options: [
    ["timingMobileShowTyre", "Tyre"],
    ["timingMobileShowPitCount", "Pit stops"],
  ] },
  { label: "Telemetry", options: [["trackerTimingMobileCarData", "Mobile telemetry"]] },
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
  const groups = timing ? (mobileTiming ? TIMING_MOBILE : TIMING_DESKTOP) : VIEW_GROUPS[view];
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

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
    const outside = (event: PointerEvent | FocusEvent) => {
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
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
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
            {groups.map((group) => (
              <section key={group.label} aria-label={group.label} className="border-b border-line pb-1 last:border-0">
                <h3 className="pt-3 pb-1 text-tiny font-bold uppercase tracking-caps text-muted">
                  {group.label}
                </h3>
                {group.options.map(([key, label]) => {
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
              </section>
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
