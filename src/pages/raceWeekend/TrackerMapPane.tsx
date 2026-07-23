import type { ReactNode } from "react";

interface TrackerMapPaneProps {
  variant: "mobile" | "desktop";
  weatherSection?: ReactNode;
  toastOverlay?: ReactNode;
  mapContent: ReactNode;
  isLoadingSessionData: boolean;
}

export function TrackerMapPane({
  variant,
  weatherSection,
  toastOverlay,
  mapContent,
  isLoadingSessionData,
}: Readonly<TrackerMapPaneProps>) {
  const mapViewportMinHeightClass =
    variant === "mobile"
      ? "relative flex-1 min-h-[64vw]"
      : "relative flex-1 min-h-0";

  const mapViewport = (
    <div className={mapViewportMinHeightClass}>
      {toastOverlay}
      {mapContent}
      {isLoadingSessionData && (
        <span className="absolute top-2 right-2 text-f1red text-[10px] animate-pulse">
          Loading…
        </span>
      )}
    </div>
  );

  if (variant === "mobile") {
    return (
      <div className="min-h-[80vw] bg-[#10101a] flex flex-col md:flex-1 md:min-w-0">
        {weatherSection}
        {mapViewport}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 bg-[#10101a] flex flex-col">
      {mapViewport}
    </div>
  );
}
