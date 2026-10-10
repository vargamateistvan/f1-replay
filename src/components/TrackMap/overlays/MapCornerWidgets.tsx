import { memo } from "react";
import type { TimingSectorFlags } from "@/timeline/raceControl";
import { FLAG_PALETTE } from "../statusBadges";

/** S1 / S2 / S3 chips coloured by each timing sector's current flag. */
export const SectorChips = memo(function SectorChips({
  timingSectorFlags,
  overlayBackground,
}: {
  timingSectorFlags: TimingSectorFlags;
  overlayBackground: string;
}) {
  return (
    <div
      className="flex flex-col gap-px"
      style={{ backdropFilter: "blur(4px)" }}
    >
      <div
        className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-muted text-center"
        style={{ background: overlayBackground }}
      >
        Sectors
      </div>
      <div className="flex gap-px">
        {([1, 2, 3] as const).map((sectorNum) => {
          const flag = timingSectorFlags[sectorNum];
          const color = flag
            ? (FLAG_PALETTE[flag]?.color ?? "#6b6b7a")
            : "#2e2e3a";
          return (
            <div
              key={`sector-chip-${sectorNum}`}
              className="flex flex-col items-center justify-center px-2 py-1 border border-panel"
              style={{
                background: flag ? `${color}22` : overlayBackground,
                borderColor: flag ? `${color}66` : "rgb(var(--color-panel))",
                minWidth: 34,
              }}
            >
              <span
                className="w-2 h-2 rounded-full mb-0.5"
                style={{ background: color }}
              />
              <span className="text-[8px] font-black uppercase text-white/70">
                S{sectorNum}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

/** Compass rose; the needle counter-rotates with the map so it keeps pointing north. */
export const Compass = memo(function Compass({
  rotationDeg,
}: {
  rotationDeg: number;
}) {
  return (
    <div
      className="w-[46px] h-12 bg-track/85 flex items-center justify-center"
      title="Compass"
    >
      <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="8.5"
          fill="none"
          stroke="#6b6b7a"
          strokeWidth="0.8"
        />
        <text
          x="12"
          y="2.8"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="3.2"
          fontWeight="900"
        >
          N
        </text>
        {(
          [
            ["S", 12, 23],
            ["W", 1.9, 12.9],
            ["E", 22.1, 12.9],
          ] as const
        ).map(([label, x, y]) => (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor="middle"
            fill="#8c8ca0"
            fontSize="2.5"
            fontWeight="700"
          >
            {label}
          </text>
        ))}
        <line
          x1="12"
          y1="3.7"
          x2="12"
          y2="20.3"
          stroke="#4f5061"
          strokeWidth="0.45"
        />
        <line
          x1="3.7"
          y1="12"
          x2="20.3"
          y2="12"
          stroke="#4f5061"
          strokeWidth="0.45"
        />
        <g transform={`rotate(${-rotationDeg} 12 12)`}>
          <path d="M12 4.6 L13.8 12 L12 10.6 L10.2 12 Z" fill="#ff2d4d" />
          <path d="M12 19.4 L13.4 12 L12 13.1 L10.6 12 Z" fill="#5f6175" />
          <circle cx="12" cy="12" r="1.1" fill="#d4d4df" />
        </g>
      </svg>
    </div>
  );
});
