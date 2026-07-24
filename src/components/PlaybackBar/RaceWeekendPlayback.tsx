import type { ComponentProps } from "react";
import { PlaybackBar } from "./PlaybackBar";

export type SharedPlaybackBarProps = ComponentProps<typeof PlaybackBar>;

interface RaceWeekendMobilePlaybackProps {
  enabled: boolean;
  showSpeedControls: boolean;
  showEventChips: boolean;
  playbackBarProps: SharedPlaybackBarProps;
}

interface RaceWeekendFooterPlaybackProps {
  enabled: boolean;
  showSpeedControls: boolean;
  showEventChips: boolean;
  playbackBarProps: SharedPlaybackBarProps;
}

export function RaceWeekendMobilePlayback({
  enabled,
  showSpeedControls,
  showEventChips,
  playbackBarProps,
}: Readonly<RaceWeekendMobilePlaybackProps>) {
  if (!enabled) return null;

  return (
    <PlaybackBar
      {...playbackBarProps}
      mobileInline
      showSpeedControls={showSpeedControls}
      showEventChips={showEventChips}
    />
  );
}

export function RaceWeekendFooterPlayback({
  enabled,
  showSpeedControls,
  showEventChips,
  playbackBarProps,
}: Readonly<RaceWeekendFooterPlaybackProps>) {
  if (!enabled) return null;

  return (
    <PlaybackBar
      {...playbackBarProps}
      showSpeedControls={showSpeedControls}
      showEventChips={showEventChips}
    />
  );
}
