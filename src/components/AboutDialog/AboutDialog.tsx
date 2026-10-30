import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { DialogHeader } from "@/components/DialogHeader";
import { useReleaseDate } from "@/hooks/useReleaseDate";
import {
  appVersionLabel,
  formatReleaseDate,
  RELEASES_PAGE_URL,
} from "@/lib/appVersion";
import { OPENF1_SITE_URL } from "@/constants";
import { buttonClass } from "@/components/Button/buttonClass";

interface Props {
  open: boolean;
  onClose: () => void;
  /** In-app navigation for Privacy / Terms so the router keeps its state. */
  onNavigate: (path: string) => void;
}

const ROW = "flex items-baseline justify-between gap-3 py-2.5";
const ROW_LABEL =
  "shrink-0 text-tiny font-bold uppercase tracking-widest text-muted";
const ROW_VALUE = "min-w-0 text-right font-mono text-small text-fg";
const LINK_BUTTON = buttonClass("secondary", "block");
const PRIMARY_BUTTON = buttonClass("primary", "block");

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
      className="fixed inset-0 z-modal flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm border border-panel bg-surface shadow-2xl sm:mx-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <DialogHeader
          eyebrow="Info"
          meta="f1replay.app"
          title="About F1 Replay"
          titleId={titleId}
          subtitle="Unofficial F1 session replays"
          icon={<AppLogo size={28} />}
          closeLabel="Close about"
          onClose={onClose}
        />

        <dl className="divide-y divide-panel px-4 sm:px-5">
          <div className={ROW}>
            <dt className={ROW_LABEL}>Version</dt>
            <dd className={`${ROW_VALUE} uppercase tracking-caps`}>
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
                href={OPENF1_SITE_URL}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-f1red"
              >
                OpenF1 API
              </a>
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-2 border-t border-panel px-4 py-4 sm:px-5">
          <a
            href={RELEASES_PAGE_URL}
            target="_blank"
            rel="noreferrer"
            className={`${PRIMARY_BUTTON} col-span-2`}
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
