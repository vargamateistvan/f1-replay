import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { useSettings } from "@/stores/settings";
import { trackEvent } from "@/lib/analytics";
import { FALLBACK_LANGUAGE } from "@/i18n/language";
import { t } from "@/i18n/translations";

export function HowItWorksModal() {
  const { isHelpOpen, closeHelp, language = FALLBACK_LANGUAGE } = useSettings();
  const backdropRef = useRef<HTMLDivElement>(null);

  const closeWithReason = useCallback(
    (reason: "escape" | "backdrop" | "button") => {
      trackEvent("help_modal_closed", { reason });
      closeHelp();
    },
    [closeHelp],
  );

  useEffect(() => {
    if (isHelpOpen) {
      trackEvent("help_modal_opened");
    }
  }, [isHelpOpen]);

  useEffect(() => {
    if (!isHelpOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeWithReason("escape");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHelpOpen, closeWithReason]);

  if (!isHelpOpen) return null;

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) closeWithReason("backdrop");
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl mx-4 max-h-[90dvh] flex flex-col bg-surface border border-panel rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-panel shrink-0">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-f1red"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span className="text-[13px] font-bold text-white tracking-wide">
              {t(language, "howItWorks.title")}
            </span>
          </div>
          <button
            onClick={() => closeWithReason("button")}
            aria-label={t(language, "howItWorks.closeHelp")}
            className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-white hover:bg-panel transition-colors text-base"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="space-y-6 pt-4 text-white/80">
            {/* Getting Started */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.gettingStartedTitle")}
              </h3>
              <p className="text-[12px] leading-relaxed mb-3">
                {t(language, "howItWorks.gettingStartedBody")}
              </p>
            </section>

            {/* Playback */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.playbackTitle")}
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.playPauseLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.playPauseBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.scrubTimelineLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.scrubTimelineBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.speedControlLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.speedControlBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.keyboardLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.keyboardBody")}
                </li>
              </ul>
            </section>

            {/* Telemetry */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.telemetryTitle")}
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.telemetryMetricsLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.telemetryMetricsBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.multiDriverComparisonLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.multiDriverComparisonBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.tireDataLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.tireDataBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.focusedOverlayLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.focusedOverlayBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.hoverDetailsLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.hoverDetailsBody")}
                </li>
              </ul>
            </section>

            {/* Strategy */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.strategyTitle")}
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.strategyTimelineLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.strategyTimelineBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.tireCompoundsLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.tireCompoundsBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.pitAnalysisLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.pitAnalysisBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.overtakesTabLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.overtakesTabBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.liveTimingLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.liveTimingBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.teamRadioLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.teamRadioBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.raceControlLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.raceControlBody")}
                </li>
              </ul>
            </section>

            {/* Track Info */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.trackInformationTitle")}
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.circuitLayoutLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.circuitLayoutBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.sectorPerformanceLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.sectorPerformanceBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.driverFocusLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.driverFocusBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.driverHeatmapLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.driverHeatmapBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.circuitDetailsLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.circuitDetailsBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.trackStatusLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.trackStatusBody")}
                </li>
              </ul>
            </section>

            {/* Views */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.mainViewsTitle")}
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.leaderboardLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.leaderboardBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.driverTrackerLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.driverTrackerBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.commentaryLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.commentaryBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.finalResultsLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.finalResultsBody")}
                </li>
              </ul>
            </section>

            {/* Architecture */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.underTheHoodTitle")}
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.sharedTimelineLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.sharedTimelineBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.smartCachingLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.smartCachingBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.derivedEventLayersLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.derivedEventLayersBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.mapInterpolationLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.mapInterpolationBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.liveSettingsLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.liveSettingsBody")}
                </li>
              </ul>
            </section>

            {/* Settings */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.settingsTitle")}
              </h3>
              <p className="text-[12px] leading-relaxed mb-2">
                {t(language, "howItWorks.customizeIntro")}
              </p>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.notificationsLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.notificationsBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.trackMapLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.trackMapBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.playbackSpeedLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.playbackSpeedBody")}
                </li>
                <li>
                  <strong className="text-white">
                    {t(language, "howItWorks.resilienceLabel")}
                  </strong>{" "}
                  {t(language, "howItWorks.resilienceBody")}
                </li>
              </ul>
            </section>

            {/* Keyboard Shortcuts */}
            <section className="pb-2">
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                {t(language, "howItWorks.keyboardShortcutsTitle")}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                <div>
                  <div className="text-f1red font-mono">
                    {t(language, "howItWorks.keySpace")}
                  </div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutPlayPause")}
                  </div>
                </div>
                <div>
                  <div className="text-f1red font-mono">← →</div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutScrub")}
                  </div>
                </div>
                <div>
                  <div className="text-f1red font-mono">↑ ↓</div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutSpeed")}
                  </div>
                </div>
                <div>
                  <div className="text-f1red font-mono">[ ]</div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutLap")}
                  </div>
                </div>
                <div>
                  <div className="text-f1red font-mono">
                    {t(language, "howItWorks.keyJK")}
                  </div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutKeyMoment")}
                  </div>
                </div>
                <div>
                  <div className="text-f1red font-mono">1 2 3</div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutView")}
                  </div>
                </div>
                <div>
                  <div className="text-f1red font-mono">
                    {t(language, "howItWorks.keyHomeEnd")}
                  </div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutJump")}
                  </div>
                </div>
                <div>
                  <div className="text-f1red font-mono">? / H</div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutHelp")}
                  </div>
                </div>
                <div>
                  <div className="text-f1red font-mono">
                    {t(language, "howItWorks.keyEsc")}
                  </div>
                  <div className="text-[10px]">
                    {t(language, "howItWorks.shortcutClose")}
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-panel my-2" />

            <p className="text-[11px] text-muted leading-relaxed pb-2">
              <strong>{t(language, "howItWorks.tipLabel")}</strong>{" "}
              {t(language, "howItWorks.tipBodyPrefix")}{" "}
              <a
                href="https://api.openf1.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-f1red hover:underline"
              >
                OpenF1 API
              </a>
              . {t(language, "howItWorks.tipBodySuffix")}
            </p>

            <p className="text-[11px] text-muted leading-relaxed pb-2">
              {t(language, "howItWorks.feedbackPrefix")}{" "}
              <a
                href="https://github.com/vargamateistvan/f1-replay/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-f1red hover:underline"
              >
                {t(language, "howItWorks.feedbackLink")}
              </a>
              .
            </p>

            <p className="text-[11px] text-muted leading-relaxed pb-2">
              {t(language, "howItWorks.author")}:{" "}
              <a
                href="https://github.com/vargamateistvan"
                target="_blank"
                rel="noopener noreferrer"
                className="text-f1red hover:underline"
              >
                github.com/vargamateistvan
              </a>
            </p>

            <section className="pt-1 pb-3">
              <p className="text-[11px] text-muted leading-relaxed pb-2">
                {t(language, "howItWorks.supportBody")}
              </p>
              <a
                href="https://buymeacoffee.com/matt_varga"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-panel bg-f1red px-3 py-2 text-[12px] font-semibold text-white transition hover:brightness-110"
              >
                <span aria-hidden="true">🍕</span>
                {t(language, "howItWorks.buyPizza")}
              </a>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
