import { memo } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  RotateCcw,
  RotateCw,
  Search,
  Settings as SettingsIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { animateMotion, pressMotion } from "@/lib/motion";

const BUTTON_CLASS =
  "w-7 h-7 flex items-center justify-center border border-panel text-white/85 hover:text-white hover:border-white/50 transition-colors";

function ControlButton({
  title,
  ariaLabel,
  onPress,
  children,
}: {
  title: string;
  ariaLabel?: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        animateMotion(e.currentTarget, pressMotion());
        onPress();
      }}
      className={BUTTON_CLASS}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

/** Top-right rotate / zoom / settings buttons. */
export const TrackControls = memo(function TrackControls({
  showTrackControls,
  overlayBackground,
  onRotateLeft,
  onRotateRight,
  onZoomOut,
  onZoomIn,
  onZoomReset,
  onOpenSettings,
  onEnter3d,
}: {
  showTrackControls: boolean;
  overlayBackground: string;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomReset: () => void;
  onOpenSettings?: () => void;
  /** When set, shows a button that switches to the 3D map. */
  onEnter3d?: () => void;
}) {
  if (!showTrackControls && !onOpenSettings && !onEnter3d) return null;

  const settingsButton = onOpenSettings && (
    <ControlButton
      title="Track map settings"
      ariaLabel="Track map settings"
      onPress={onOpenSettings}
    >
      <SettingsIcon size={14} strokeWidth={2.2} aria-hidden="true" />
    </ControlButton>
  );

  const enter3dButton = onEnter3d && (
    <ControlButton
      title="Switch to 3D map"
      ariaLabel="Switch to 3D map"
      onPress={onEnter3d}
    >
      <span className="text-[10px] font-black tracking-widest">3D</span>
    </ControlButton>
  );

  return (
    <div
      className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1 p-1"
      style={{ background: overlayBackground, backdropFilter: "blur(4px)" }}
    >
      {!showTrackControls && (
        <div className="flex items-center gap-1">
          {enter3dButton}
          {settingsButton}
        </div>
      )}
      {showTrackControls && (
        <>
          <div className="flex items-center gap-1">
            <ControlButton title="Rotate left" onPress={onRotateLeft}>
              <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
            </ControlButton>
            <ControlButton title="Rotate right" onPress={onRotateRight}>
              <RotateCw size={14} strokeWidth={2.2} aria-hidden="true" />
            </ControlButton>
            {enter3dButton}
            {settingsButton}
          </div>
          <div className="flex items-center gap-1">
            <ControlButton title="Zoom out" onPress={onZoomOut}>
              <ZoomOut size={14} strokeWidth={2.2} aria-hidden="true" />
            </ControlButton>
            <ControlButton title="Zoom in" onPress={onZoomIn}>
              <ZoomIn size={14} strokeWidth={2.2} aria-hidden="true" />
            </ControlButton>
            <ControlButton title="Reset zoom" onPress={onZoomReset}>
              <Search size={14} strokeWidth={2.2} aria-hidden="true" />
            </ControlButton>
          </div>
        </>
      )}
    </div>
  );
});
