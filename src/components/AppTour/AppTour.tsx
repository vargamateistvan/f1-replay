import { useEffect, useMemo } from "react";
import { EVENTS, STATUS, useJoyride, type Options } from "react-joyride";
import { TOUR_VERSION } from "@/constants";
import { Z_LAYERS } from "@/designTokens";
import { trackEvent } from "@/lib/analytics";
import { prefersReducedMotion } from "@/lib/motion";
import { useSettings } from "@/stores/settings";
import { buildTourSteps, type TourContext } from "./steps";
import { TourTooltip } from "./TourTooltip";

const TOUR_OPTIONS: Partial<Options> = {
  skipBeacon: true,
  buttons: ["back", "primary", "skip"],
  closeButtonAction: "skip",
  // Esc skips the tour (handled below); Joyride's own Esc would only close the step.
  dismissKeyAction: false,
  overlayClickAction: false,
  // The tour explains the UI; clicking through the spotlight would seek or switch views.
  blockTargetInteraction: true,
  overlayColor: "rgb(0 0 0 / 0.65)",
  arrowColor: "rgb(var(--color-surface))",
  spotlightRadius: 6,
  spotlightPadding: 6,
  zIndex: Z_LAYERS.tour,
};

interface AppTourProps {
  readonly context: TourContext;
}

/** Guided tour of the replay page. Mounted (lazily) only while `isTourOpen`. */
export function AppTour({ context }: AppTourProps) {
  const closeTour = useSettings((s) => s.closeTour);
  const setSetting = useSettings((s) => s.setSetting);
  // Steps are fixed for a run: a resize mid-tour shouldn't restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => buildTourSteps(context), []);

  const { Tour, controls, on } = useJoyride({
    steps,
    run: true,
    continuous: true,
    tooltipComponent: TourTooltip,
    options: {
      ...TOUR_OPTIONS,
      scrollDuration: prefersReducedMotion() ? 0 : 300,
    },
  });

  useEffect(
    () =>
      on(EVENTS.TOOLTIP, ({ step, index }) => {
        trackEvent("tour_step_viewed", { step: String(step.id), index });
      }),
    [on],
  );

  // Finished or skipped: don't show this version again.
  useEffect(
    () =>
      on(EVENTS.TOUR_END, ({ status, step, index }) => {
        if (status === STATUS.SKIPPED) {
          trackEvent("tour_skipped", { step: String(step.id), index });
        } else {
          trackEvent("tour_completed");
        }
        setSetting("tourSeenVersion", TOUR_VERSION);
        closeTour();
      }),
    [on, setSetting, closeTour],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      controls.skip("button_close");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controls]);

  return Tour;
}
