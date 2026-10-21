import { useEffect, useRef, useState } from "react";
import { TOUR_VERSION } from "@/constants";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";

/**
 * Opens the app tour once per page load for users who haven't seen this
 * `TOUR_VERSION`, as soon as `ready` (the session's data is on screen).
 * A link that lands on a moment (`?t=`) is a shared replay, not a first look
 * around, so it never starts the tour.
 */
export function useAutoStartTour(ready: boolean) {
  const [landedOnMoment] = useState(
    () => new URLSearchParams(window.location.search).has("t"),
  );
  const tourSeenVersion = useSettings((s) => s.tourSeenVersion);
  const otherModalOpen = useSettings((s) => s.isOpen || s.isHelpOpen);
  const openTour = useSettings((s) => s.openTour);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || landedOnMoment || !ready || otherModalOpen) return;
    if (tourSeenVersion >= TOUR_VERSION) return;
    startedRef.current = true;
    trackEvent("tour_started", { source: "auto" });
    openTour();
  }, [landedOnMoment, ready, otherModalOpen, tourSeenVersion, openTour]);
}
