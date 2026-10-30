import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";

/** An optional first-use prompt, never an automatically opened tour. */
export function useReplayWelcome(ready: boolean, live: boolean, playing: boolean) {
  const [params] = useSearchParams();
  const [eligible] = useState(() => {
    const settings = useSettings.getState();
    return !settings.replayWelcomeSeen && settings.tourSeenVersion === 0 &&
      !["t", "focus", "compare", "cam"].some((key) => params.has(key));
  });
  const [dismissed, setDismissed] = useState(false);
  const modalOpen = useSettings((s) => s.isOpen || s.isHelpOpen || s.isTourOpen);
  const setSetting = useSettings((s) => s.setSetting);
  const openTour = useSettings((s) => s.openTour);
  const shown = useRef(false);
  const visible = eligible && !dismissed && ready && !live && !playing && !modalOpen;

  useEffect(() => {
    if (!visible || shown.current) return;
    shown.current = true;
    setSetting("replayWelcomeSeen", true);
    trackEvent("replay_welcome_viewed");
  }, [visible, setSetting]);

  useEffect(() => {
    if (eligible && playing) {
      setDismissed(true);
      setSetting("replayWelcomeSeen", true);
    }
  }, [eligible, playing, setSetting]);

  function dismiss(reason: "dismiss" | "play" | "tour") {
    setDismissed(true);
    setSetting("replayWelcomeSeen", true);
    trackEvent("replay_welcome_dismissed", { reason });
  }

  function takeTour() {
    dismiss("tour");
    trackEvent("tour_started", { source: "welcome" });
    openTour();
  }

  return { visible, dismiss, takeTour };
}
