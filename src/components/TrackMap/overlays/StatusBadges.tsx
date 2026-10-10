import type { CSSProperties } from "react";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { START_LIGHT_COUNT } from "@/constants";
import { teamColor } from "@/utils/color";
import type { StatusBadge } from "../statusBadges";

// Same #111/#fff checker as the finish line and the timing-tower FIN chip.
const CHEQUERED_SWATCH_STYLE: CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage:
    "conic-gradient(#111 25%, transparent 0 50%, #111 0 75%, transparent 0)",
  backgroundSize: "5px 5px",
};

const START_LIGHT_ON_STYLE: CSSProperties = {
  background: "#e8002d",
  boxShadow:
    "0 0 6px 2px rgba(232,0,45,0.65), inset 0 1px 0 rgba(255,100,100,0.35)",
};

const START_LIGHT_OFF_STYLE: CSSProperties = {
  background: "#1e0808",
  boxShadow: "inset 0 0 0 1px #3a1414",
};

function ChequeredSwatch() {
  return (
    <span
      aria-hidden="true"
      className="h-2.5 w-3"
      style={CHEQUERED_SWATCH_STYLE}
    />
  );
}

/** Status chips stacked at the top centre of the map. */
export function StatusBadges({ badges }: { badges: readonly StatusBadge[] }) {
  if (!badges.length) return null;
  return (
    <div className="pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 flex flex-col items-center gap-1">
      {badges.map((badge) =>
        badge.lightsLit !== undefined ? (
          <div
            key={badge.key}
            role="img"
            aria-label={badge.label}
            className="flex items-center gap-[5px] rounded-sm border p-1.5 shadow-md"
            style={{ background: badge.bg, borderColor: badge.border }}
          >
            {Array.from({ length: START_LIGHT_COUNT }, (_, i) => (
              <span
                key={i}
                className="h-[15px] w-[15px] rounded-full"
                style={
                  i < (badge.lightsLit ?? 0)
                    ? START_LIGHT_ON_STYLE
                    : START_LIGHT_OFF_STYLE
                }
              />
            ))}
          </div>
        ) : (
          <div
            key={badge.key}
            className="border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] flex items-center gap-1.5 shadow-md rounded-sm"
            style={{
              background: badge.bg,
              borderColor: badge.border,
              color: badge.text,
            }}
          >
            {badge.driver && (
              <DriverHeadshot
                driver={badge.driver}
                accent={teamColor(badge.driver.team_colour)}
                size="xs"
              />
            )}
            {badge.chequered && <ChequeredSwatch />}
            <span>{badge.label}</span>
            {badge.chequered && <ChequeredSwatch />}
          </div>
        ),
      )}
    </div>
  );
}
