import { Fragment, memo } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  Camera,
  Maximize,
  RotateCcw,
  RotateCw,
  Settings as SettingsIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { animateMotion, pressMotion } from "@/lib/motion";

/** Same button as the 3D map's toolbar, so both maps share one control bar look. */
const BUTTON_CLASS =
  "h-7 min-w-7 px-1.5 flex items-center justify-center border border-panel text-white/85 hover:text-white hover:border-white/50 transition-colors text-[10px] font-black tracking-widest disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-panel";

function ControlButton({
  title,
  onPress,
  disabled,
  children,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
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
      aria-label={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

const icon = { size: 14, strokeWidth: 2.2, "aria-hidden": true } as const;

/**
 * Top-right toolbar in the 3D map's button style, three rows: view switch ·
 * snapshot + settings (always shown, as in 3D), then rotate, then zoom/fit
 * (both only with "Track controls" on).
 */
export const TrackControls = memo(function TrackControls({
  showTrackControls,
  overlayBackground,
  onRotateLeft,
  onRotateRight,
  onZoomOut,
  onZoomIn,
  onResetView,
  viewModified = false,
  onSnapshot,
  snapshotDisabled = false,
  onOpenSettings,
  onEnter3d,
}: {
  showTrackControls: boolean;
  overlayBackground: string;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  /** Back to the fitted zoom and the circuit's broadcast rotation. */
  onResetView: () => void;
  /** Zoom or rotation differs from the fitted view (highlights the fit button). */
  viewModified?: boolean;
  /** When set, shows the PNG snapshot button. */
  onSnapshot?: () => void;
  snapshotDisabled?: boolean;
  onOpenSettings?: () => void;
  /** When set, shows a button that switches to the 3D map. */
  onEnter3d?: () => void;
}) {
  // Row 1: always-on buttons (view switch · snapshot + settings).
  const top: ReactNode[] = [];
  if (onEnter3d) {
    top.push(
      <ControlButton key="3d" title="Switch to 3D map" onPress={onEnter3d}>
        3D
      </ControlButton>,
    );
  }
  if (onSnapshot || onOpenSettings) {
    top.push(
      <Fragment key="tools">
        {onSnapshot && (
          <ControlButton
            title={snapshotDisabled ? "Snapshot available once cars are on track" : "Download map snapshot as PNG"}
            onPress={onSnapshot}
            disabled={snapshotDisabled}
          >
            <Camera {...icon} />
          </ControlButton>
        )}
        {onOpenSettings && (
          <ControlButton title="Track map settings" onPress={onOpenSettings}>
            <SettingsIcon {...icon} />
          </ControlButton>
        )}
      </Fragment>,
    );
  }

  // Rows 2–3: rotate, then zoom/fit; hidden with "Track controls" off.
  const rotate: ReactNode[] = showTrackControls
    ? [
        <Fragment key="rotate">
          <ControlButton title="Rotate left" onPress={onRotateLeft}>
            <RotateCcw {...icon} />
          </ControlButton>
          <ControlButton title="Rotate right" onPress={onRotateRight}>
            <RotateCw {...icon} />
          </ControlButton>
        </Fragment>,
      ]
    : [];
  const zoom: ReactNode[] = showTrackControls
    ? [
        <Fragment key="zoom">
          <ControlButton title="Zoom out" onPress={onZoomOut}>
            <ZoomOut {...icon} />
          </ControlButton>
          <ControlButton
            title={viewModified ? "Fit track (reset zoom and rotation)" : "Fit track"}
            onPress={onResetView}
          >
            <Maximize {...icon} className={viewModified ? "text-f1red" : undefined} />
          </ControlButton>
          <ControlButton title="Zoom in" onPress={onZoomIn}>
            <ZoomIn {...icon} />
          </ControlButton>
        </Fragment>,
      ]
    : [];
  if (!top.length && !rotate.length) return null;

  const row = (groups: ReactNode[]) => (
    <div className="flex items-center justify-end gap-1">
      {groups.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="mx-0.5 h-4 w-px bg-white/15" aria-hidden="true" />}
          {group}
        </Fragment>
      ))}
    </div>
  );

  return (
    <div
      className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1 p-1"
      style={{ background: overlayBackground, backdropFilter: "blur(4px)" }}
      role="toolbar"
      aria-label="Track map controls"
    >
      {top.length > 0 && row(top)}
      {rotate.length > 0 && row(rotate)}
      {zoom.length > 0 && row(zoom)}
    </div>
  );
});
