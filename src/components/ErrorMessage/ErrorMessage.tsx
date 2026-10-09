import { Inbox, TriangleAlert } from "lucide-react";

interface Props {
  readonly message?: string;
  readonly compact?: boolean;
  readonly variant?: "error" | "empty";
}

const TONES = {
  error: {
    Icon: TriangleAlert,
    kicker: "Error",
    accent: "border-l-f1red",
    iconCls: "text-f1red",
    role: "alert",
  },
  empty: {
    Icon: Inbox,
    kicker: "No data",
    accent: "border-l-flag-sc",
    iconCls: "text-flag-sc",
    role: "status",
  },
} as const;

export function ErrorMessage({
  message = "Failed to load data",
  compact = false,
  variant = "error",
}: Props) {
  const { Icon, kicker, accent, iconCls, role } = TONES[variant];

  if (compact) {
    return (
      <div
        role={role}
        className={`inline-flex max-w-full items-center gap-1.5 border border-panel border-l-2 ${accent} bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted`}
      >
        <Icon aria-hidden="true" className={`h-3 w-3 shrink-0 ${iconCls}`} />
        <span className="truncate">{message}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div
        role={role}
        className={`flex w-full max-w-sm items-center gap-3 border border-panel border-l-2 ${accent} bg-surface px-4 py-3`}
      >
        <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${iconCls}`} />
        <div className="min-w-0">
          <div
            className={`text-[10px] font-black uppercase tracking-widest ${iconCls}`}
          >
            {kicker}
          </div>
          <div className="mt-0.5 text-xs font-bold uppercase tracking-[0.12em] text-white">
            {message}
          </div>
        </div>
      </div>
    </div>
  );
}
