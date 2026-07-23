import type { ReactNode } from "react";
import type { Driver, Weather } from "@/api/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { EventToastStack } from "@/components/EventToast/EventToastStack";
import type { ActiveToast } from "@/hooks/useEventToasts";
import { WeatherPanel } from "@/components/Weather/WeatherPanel";
import { TrackerMapPane } from "./TrackerMapPane";

interface TrackerMobileMapContentProps {
  mapShowWeather: boolean;
  weatherError: boolean;
  weatherEntries: Weather[];
  sessionKey: number | null;
  sessionTimeMs: number;
  sessionStartMs: number;
  toasts: ActiveToast[];
  drivers: Driver[];
  onDismissToast: (id: string) => void;
  radioAutoplay: boolean;
  soundsEnabled: boolean;
  maxVisibleToasts: 2 | 4 | 6 | 8;
  mapContent: ReactNode;
  isLoadingSessionData: boolean;
}

export function TrackerMobileMapContent({
  mapShowWeather,
  weatherError,
  weatherEntries,
  sessionKey,
  sessionTimeMs,
  sessionStartMs,
  toasts,
  drivers,
  onDismissToast,
  radioAutoplay,
  soundsEnabled,
  maxVisibleToasts,
  mapContent,
  isLoadingSessionData,
}: Readonly<TrackerMobileMapContentProps>) {
  const toastOverlay = (
    <EventToastStack
      toasts={toasts}
      drivers={drivers}
      onDismiss={onDismissToast}
      radioAutoplay={radioAutoplay}
      soundsEnabled={soundsEnabled}
      maxVisible={maxVisibleToasts}
      layout="overlay"
    />
  );

  const weatherSection = mapShowWeather ? (
    <div className="shrink-0 border-b border-panel">
      {weatherError ? (
        <ErrorMessage message="Failed to load weather" compact />
      ) : (
        <WeatherPanel
          entries={weatherEntries}
          sessionKey={sessionKey}
          sessionTimeMs={sessionTimeMs}
          sessionStartMs={sessionStartMs}
        />
      )}
    </div>
  ) : undefined;

  return (
    <TrackerMapPane
      variant="mobile"
      weatherSection={weatherSection}
      toastOverlay={toastOverlay}
      mapContent={mapContent}
      isLoadingSessionData={isLoadingSessionData}
    />
  );
}
