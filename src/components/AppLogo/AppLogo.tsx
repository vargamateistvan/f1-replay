interface Props {
  /** Rendered height in pixels; width matches (square mark). */
  size?: number;
  className?: string;
}

/**
 * The F1 Replay logomark: a circuit ring (gap at top = start/finish line)
 * with a play triangle inside. Renders white-on-transparent — intended for
 * use on coloured backgrounds (nav bar, splash screens).
 */
export function AppLogo({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Circuit ring — white on coloured bg */}
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="67 8"
        strokeDashoffset="71"
        transform="rotate(-90 16 16)"
      />
      {/* Start/finish ticks */}
      <line x1="13.5" y1="2.5" x2="13.5" y2="5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="18.5" y1="2.5" x2="18.5" y2="5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Play triangle */}
      <polygon points="12,10 12,22 23,16" fill="white"/>
    </svg>
  );
}
