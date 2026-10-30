import type { CSSProperties } from "react";

interface TooltipCardProps {
  readonly title: string;
  readonly text: string;
  readonly accentClassName?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

const BASE_CLASS_NAME =
  "border border-panel bg-track px-3 py-2 text-left text-caption text-fg shadow-[0_12px_28px_rgba(0,0,0,0.4)]";

export function TooltipCard({
  title,
  text,
  accentClassName,
  className,
  style,
}: TooltipCardProps) {
  const tooltipClassName = className
    ? `${BASE_CLASS_NAME} ${className}`
    : BASE_CLASS_NAME;

  return (
    <span role="tooltip" className={tooltipClassName} style={style}>
      <span
        className={`absolute inset-y-0 left-0 w-1 ${accentClassName ?? "bg-f1red"}`}
        aria-hidden="true"
      />
      <span className="block pl-2 text-micro font-black uppercase tracking-eyebrow text-muted">
        {title}
      </span>
      <span className="mt-1 block whitespace-normal break-words pl-2 text-small font-semibold leading-5 text-fg/90">
        {text}
      </span>
    </span>
  );
}
