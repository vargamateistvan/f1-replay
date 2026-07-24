import type { ComponentProps } from "react";
import { QualifyingBanner } from "@/components/QualifyingBanner";
import { ErrorMessage } from "@/components/ErrorMessage";
import { FinalClassificationDialog } from "@/components/FinalClassification";
import { CatchupSummary } from "@/components/CatchupSummary/CatchupSummary";

type CatchupSummaryProps = ComponentProps<typeof CatchupSummary>;
type QualifyingBannerProps = ComponentProps<typeof QualifyingBanner>;
type FinalClassificationDialogProps = ComponentProps<
  typeof FinalClassificationDialog
>;

interface RaceWeekendOverlaysAdapterProps {
  catchupSummaryEnabled: boolean;
  catchupSummary: CatchupSummaryProps["summary"] | null;
  drivers: CatchupSummaryProps["drivers"];
  onDismissCatchup: CatchupSummaryProps["onDismiss"];
  showFinalClassification: boolean;
  hasSessionResultError: boolean;
  showQualifyingBanner: boolean;
  qualiPhase: QualifyingBannerProps["phase"] | null;
  positions: QualifyingBannerProps["positions"];
  sessionTimeMs: QualifyingBannerProps["sessionTimeMs"];
  sessionStartMs: QualifyingBannerProps["sessionStartMs"];
  countdownMs: QualifyingBannerProps["countdownMs"];
  onCloseQualifyingBanner: QualifyingBannerProps["onClose"];
  isResultsDialogOpen: boolean;
  results: FinalClassificationDialogProps["results"];
  sessionName: FinalClassificationDialogProps["sessionName"];
  onCloseResultsDialog: FinalClassificationDialogProps["onClose"];
}

export function RaceWeekendOverlaysAdapter({
  catchupSummaryEnabled,
  catchupSummary,
  drivers,
  onDismissCatchup,
  showFinalClassification,
  hasSessionResultError,
  showQualifyingBanner,
  qualiPhase,
  positions,
  sessionTimeMs,
  sessionStartMs,
  countdownMs,
  onCloseQualifyingBanner,
  isResultsDialogOpen,
  results,
  sessionName,
  onCloseResultsDialog,
}: Readonly<RaceWeekendOverlaysAdapterProps>) {
  return (
    <>
      {catchupSummaryEnabled && catchupSummary !== null && (
        <CatchupSummary
          summary={catchupSummary}
          drivers={drivers}
          onDismiss={onDismissCatchup}
        />
      )}

      {showFinalClassification && hasSessionResultError && (
        <div className="shrink-0 border-t border-panel">
          <ErrorMessage message="Failed to load final classification" compact />
        </div>
      )}

      {showQualifyingBanner && qualiPhase && (
        <QualifyingBanner
          phase={qualiPhase}
          drivers={drivers}
          positions={positions}
          sessionTimeMs={sessionTimeMs}
          sessionStartMs={sessionStartMs}
          countdownMs={countdownMs}
          openByDefault
          dialogOnly
          onClose={onCloseQualifyingBanner}
        />
      )}

      {showFinalClassification &&
        !hasSessionResultError &&
        isResultsDialogOpen && (
          <FinalClassificationDialog
            results={results}
            drivers={drivers}
            sessionName={sessionName}
            onClose={onCloseResultsDialog}
          />
        )}
    </>
  );
}
