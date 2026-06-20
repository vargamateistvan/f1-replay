interface Props {
  readonly message?: string;
  readonly compact?: boolean;
  readonly variant?: "error" | "empty";
}

export function ErrorMessage({
  message = "Failed to load data",
  compact = false,
  variant = "error",
}: Props) {
  if (compact) {
    const compactTone =
      variant === "empty"
        ? "text-amber-300 border-amber-500/40"
        : "text-red-400 border-red-500/40";
    const compactIcon = variant === "empty" ? "◌" : "⚠";

    return (
      <div
        className={`text-xs font-mono px-2 py-1 border rounded-sm bg-track/50 ${compactTone}`}
      >
        {compactIcon} {message}
      </div>
    );
  }

  const tone =
    variant === "empty"
      ? {
          iconChip: "bg-amber-500/10 border-amber-500/30 text-amber-300",
          text: "text-amber-200",
          border: "border-amber-500/25",
          bg: "bg-gradient-to-b from-amber-500/10 to-transparent",
          icon: "◌",
        }
      : {
          iconChip: "bg-red-500/10 border-red-500/30 text-red-400",
          text: "text-red-300",
          border: "border-red-500/30",
          bg: "bg-gradient-to-b from-red-500/10 to-transparent",
          icon: "⚠",
        };

  return (
    <div className={`flex h-full items-center justify-center p-4 ${tone.bg}`}>
      <div
        className={`max-w-md w-full rounded-md border px-4 py-5 text-center ${tone.border}`}
      >
        <div
          className={`mx-auto mb-2 w-fit rounded-full border px-3 py-1 ${tone.iconChip}`}
        >
          <span className="text-xl leading-none">{tone.icon}</span>
        </div>
        <div className={`text-sm font-mono ${tone.text}`}>{message}</div>
      </div>
    </div>
  );
}
