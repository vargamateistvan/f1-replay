import { useCallback, useEffect, useId, useRef, type MouseEvent } from "react";
import { useSettings } from "@/stores/settings";
import { SettingsBody } from "./SettingsControls";
import { DialogHeader } from "@/components/DialogHeader";
import { trackEvent } from "@/lib/analytics";
import {
  animateMotion,
  modalBackdropMotion,
  modalPanelMotion,
  motionEnabled,
} from "@/lib/motion";

export function SettingsModal() {
  const { isOpen, modalTab, closeModal } = useSettings();
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const closeWithReason = useCallback(
    (reason: "escape" | "backdrop" | "button") => {
      trackEvent("settings_modal_closed", { reason });
      closeModal();
    },
    [closeModal],
  );

  useEffect(() => {
    if (isOpen) {
      trackEvent("settings_modal_opened");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !motionEnabled()) return;
    const backdropAnimation = animateMotion(
      backdropRef.current,
      modalBackdropMotion(),
    );
    const panelAnimation = animateMotion(panelRef.current, modalPanelMotion());

    return () => {
      backdropAnimation?.revert();
      panelAnimation?.revert();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeWithReason("escape");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeWithReason]);

  if (!isOpen) return null;

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) closeWithReason("backdrop");
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative mx-4 flex h-[85dvh] max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden border border-panel bg-surface shadow-2xl"
      >
        <DialogHeader
          eyebrow="Preferences"
          meta="Saved on this device"
          title="Settings"
          titleId={titleId}
          closeLabel="Close settings"
          onClose={() => closeWithReason("button")}
        />

        {/* Scrollable body */}
        <div
          className="flex min-h-0 flex-1 flex-col overscroll-contain px-4 pb-4 md:px-5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <SettingsBody initialTab={modalTab} />
        </div>
      </div>
    </div>
  );
}
