import { useCallback, useEffect, useState } from "react";
import { isQualiSession } from "@/utils/session";

interface UseRaceWeekendOverlayDialogsArgs {
  showFinalClassification: boolean;
  hasSessionResultError: boolean;
  sessionName: string;
  qualiPhase: string | null;
}

export function useRaceWeekendOverlayDialogs({
  showFinalClassification,
  hasSessionResultError,
  sessionName,
  qualiPhase,
}: Readonly<UseRaceWeekendOverlayDialogsArgs>) {
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);
  const [isQualiEliminationsDialogOpen, setIsQualiEliminationsDialogOpen] =
    useState(false);

  useEffect(() => {
    if (!showFinalClassification) {
      setIsResultsDialogOpen(false);
      return;
    }
    if (!hasSessionResultError) {
      setIsResultsDialogOpen(true);
    }
  }, [showFinalClassification, hasSessionResultError]);

  useEffect(() => {
    if (!isQualiSession(sessionName) || !qualiPhase) {
      setIsQualiEliminationsDialogOpen(false);
    }
  }, [qualiPhase, sessionName]);

  const openResultsDialog = useCallback(() => {
    setIsResultsDialogOpen(true);
  }, []);

  const closeResultsDialog = useCallback(() => {
    setIsResultsDialogOpen(false);
  }, []);

  const openQualiEliminationsDialog = useCallback(() => {
    setIsQualiEliminationsDialogOpen(true);
  }, []);

  const closeQualiEliminationsDialog = useCallback(() => {
    setIsQualiEliminationsDialogOpen(false);
  }, []);

  return {
    isResultsDialogOpen,
    isQualiEliminationsDialogOpen,
    openResultsDialog,
    closeResultsDialog,
    openQualiEliminationsDialog,
    closeQualiEliminationsDialog,
  } as const;
}
