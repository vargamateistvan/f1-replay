import type { ReactNode } from "react";
import { X } from "lucide-react";
import { animateMotion, pressMotion } from "@/lib/motion";

/**
 * Shared modal header in the legal-page style: a red strip (eyebrow + mono
 * meta), then a black uppercase title with a square close button.
 */
export function DialogHeader({
  eyebrow,
  meta,
  title,
  titleId,
  subtitle,
  icon,
  closeLabel,
  onClose,
}: {
  eyebrow: string;
  meta?: ReactNode;
  title: string;
  titleId?: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0">
      <div className="flex h-7 items-center justify-between gap-3 bg-f1red px-4 text-white sm:px-5">
        <span className="text-caption font-black uppercase tracking-spaced">
          {eyebrow}
        </span>
        {meta != null && (
          <span className="truncate font-mono text-caption uppercase tracking-wider">
            {meta}
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-4 border-b border-panel px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-black uppercase leading-tight tracking-wider text-fg sm:text-xl"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 font-mono text-caption uppercase tracking-caps text-muted">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            animateMotion(e.currentTarget, pressMotion());
            onClose();
          }}
          aria-label={closeLabel}
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-panel text-muted transition-colors hover:border-f1red hover:text-f1red focus:outline-none focus-visible:border-f1red focus-visible:text-f1red"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
