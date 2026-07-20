import type { KeyMoment } from "@/components/KeyMoments/types";

interface Props {
  moments: KeyMoment[];
  sessionTimeMs: number;
  onJump: (ms: number) => void;
}

const KIND_CONFIG: Record<
  KeyMoment["kind"],
  { badge: string; badgeBg: string; badgeText: string }
> = {
  lead_change: { badge: "LEAD", badgeBg: "#2a2a35", badgeText: "#fff" },
  fastest_lap: { badge: "FASTEST", badgeBg: "#9b59f5", badgeText: "#fff" },
  safety_car: { badge: "SC", badgeBg: "#f5a623", badgeText: "#000" },
  vsc: { badge: "VSC", badgeBg: "#f5a623", badgeText: "#000" },
  red_flag: { badge: "RED", badgeBg: "#e8002d", badgeText: "#fff" },
};

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m)}:${pad(s % 60)}`;
}

export function KeyMoments({ moments, sessionTimeMs, onJump }: Props) {
  if (moments.length === 0) {
    return (
      <div className="text-muted text-xs p-3">
        No key moments yet — scrub forward or select a session
      </div>
    );
  }

  return (
    <div className="panel-scroll">
      <div className="divide-y divide-[#2a2a35]">
        {moments.map((m, i) => {
          const cfg = KIND_CONFIG[m.kind];
          const isPast = m.ms <= sessionTimeMs;
          return (
            <button
              key={i}
              onClick={() => onJump(m.ms)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] ${
                isPast ? "" : "opacity-40"
              }`}
            >
              {/* Session time */}
              <span className="text-[10px] font-mono tabular-nums text-muted w-10 shrink-0">
                {fmtMs(m.ms)}
              </span>

              {/* Kind badge */}
              <span
                className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 shrink-0"
                style={{ background: cfg.badgeBg, color: cfg.badgeText }}
              >
                {cfg.badge}
              </span>

              {/* Label + sublabel */}
              <span className="flex-1 min-w-0">
                <span
                  className="text-[11px] font-bold block truncate"
                  style={{
                    color:
                      m.kind === "lead_change"
                        ? m.color
                        : "rgba(255,255,255,0.9)",
                  }}
                >
                  {m.label}
                </span>
                {m.sublabel && (
                  <span
                    className="text-[10px] font-mono tabular-nums block"
                    style={{ color: m.color }}
                  >
                    {m.sublabel}
                  </span>
                )}
              </span>

              {/* Jump arrow */}
              <span className="text-muted text-[10px] shrink-0">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
