import type { TooltipRenderProps } from "react-joyride";

/** Joyride tooltip in the app's panel style (theme tokens, so light mode works). */
export function TourTooltip({
  step,
  index,
  size,
  isLastStep,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  const primaryLabel = isLastStep ? "Done" : "Next";
  return (
    <div
      {...tooltipProps}
      className="w-[min(22rem,calc(100vw-2rem))] rounded-sm border border-panel bg-surface shadow-2xl"
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {step.title && (
            <h2 className="text-compact font-black uppercase tracking-widest text-fg">
              {step.title}
            </h2>
          )}
          <span className="ml-auto shrink-0 font-mono text-caption text-muted">
            {index + 1} / {size}
          </span>
        </div>
        <div className="text-body leading-relaxed text-fg/80">
          {step.content}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-panel px-4 py-2.5">
        {!isLastStep && (
          <button
            {...skipProps}
            aria-label="Skip tour"
            title="Skip tour"
            type="button"
            className="text-caption font-bold uppercase tracking-widest text-muted transition-colors hover:text-fg"
          >
            Skip tour
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {index > 0 && (
            <button
              {...backProps}
              type="button"
              className="h-8 rounded-sm px-3 text-caption font-bold uppercase tracking-widest text-fg/70 transition-colors hover:text-fg"
            >
              Back
            </button>
          )}
          <button
            {...primaryProps}
            aria-label={primaryLabel}
            title={primaryLabel}
            type="button"
            className="h-8 rounded-sm bg-f1red px-3.5 text-caption font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
