import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { useSettings } from "@/stores/settings";
import { SettingsBody } from "./SettingsControls";
import { trackEvent } from "@/lib/analytics";

export function SettingsModal() {
  const { isOpen, closeModal } = useSettings();
  const backdropRef = useRef<HTMLDivElement>(null);

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
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-sm mx-4 max-h-[90dvh] flex flex-col bg-[#1a1a24] border border-[#2a2a35] rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2a2a35] shrink-0">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              strokeLinecap="round"
              className="text-muted"
            >
              <line
                x1="2"
                y1="4"
                x2="14"
                y2="4"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="10" cy="4" r="2" fill="currentColor" />
              <line
                x1="2"
                y1="8"
                x2="14"
                y2="8"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="5" cy="8" r="2" fill="currentColor" />
              <line
                x1="2"
                y1="12"
                x2="14"
                y2="12"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="11" cy="12" r="2" fill="currentColor" />
            </svg>
            <span className="text-[13px] font-bold text-white tracking-wide">
              Settings
            </span>
          </div>
          <button
            onClick={() => closeWithReason("button")}
            aria-label="Close settings"
            className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-white hover:bg-[#2a2a35] transition-colors text-base"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <SettingsBody />
        </div>
      </div>
    </div>
  );
}
