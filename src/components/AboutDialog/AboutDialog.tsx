import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { useReleaseDate } from "@/hooks/useReleaseDate";
import {
  appVersionLabel,
  formatReleaseDate,
  RELEASES_PAGE_URL,
} from "@/lib/appVersion";

const OPENF1_URL = "https://openf1.org/";

interface Props {
  open: boolean;
  onClose: () => void;
  /** In-app navigation for Privacy / Terms so the router keeps its state. */
  onNavigate: (path: string) => void;
}

const ROW = "flex items-baseline justify-between gap-3 py-2.5";
const ROW_LABEL =
  "shrink-0 text-[9px] font-bold uppercase tracking-widest text-muted";
const ROW_VALUE = "min-w-0 text-right font-mono text-[11px] text-white";
const LINK_BUTTON =
  "flex h-9 items-center justify-center gap-1 rounded-sm bg-panel px-2 text-[10px] font-black uppercase tracking-[0.12em] text-white";

export function AboutDialog({ open, onClose, onNavigate }: Props) {
  const titleId = useId();
  const releaseDate = formatReleaseDate(useReleaseDate());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm border border-panel bg-surface shadow-2xl sm:mx-4 sm:rounded-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between border-b border-panel px-4 py-3">
          <div className="flex items-center gap-2">
            <AppLogo size={18} />
            <h2
              id={titleId}
              className="text-[12px] font-black uppercase tracking-[0.18em] text-white"
            >
              About F1 Replay
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close about"
            className="flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-panel hover:text-white"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <dl className="divide-y divide-panel px-4">
          <div className={ROW}>
            <dt className={ROW_LABEL}>Version</dt>
            <dd className={`${ROW_VALUE} uppercase tracking-[0.12em]`}>
              {appVersionLabel}
            </dd>
          </div>
          <div className={ROW}>
            <dt className={ROW_LABEL}>Released</dt>
            <dd className={`${ROW_VALUE} ${releaseDate ? "" : "text-muted"}`}>
              {releaseDate ?? "—"}
            </dd>
          </div>
          <div className={ROW}>
            <dt className={ROW_LABEL}>Data</dt>
            <dd className={ROW_VALUE}>
              <a
                href={OPENF1_URL}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-f1red"
              >
                OpenF1 API
              </a>
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-1 border-t border-panel px-4 py-3">
          <a
            href={RELEASES_PAGE_URL}
            target="_blank"
            rel="noreferrer"
            className={`${LINK_BUTTON} col-span-2`}
          >
            Release notes
            <ExternalLink size={10} aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => onNavigate("/privacy")}
            className={LINK_BUTTON}
          >
            Privacy
          </button>
          <button
            type="button"
            onClick={() => onNavigate("/terms")}
            className={LINK_BUTTON}
          >
            Terms
          </button>
          <a
            href="/.well-known/security.txt"
            className={`${LINK_BUTTON} col-span-2`}
          >
            Security
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
