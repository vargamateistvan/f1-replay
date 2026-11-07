import { useId } from "react";
import { TRACK_PIT_ACCESS_GLOW_SCALE, TRACK_PIT_ACCESS_MARKER_RADIUS } from "@/constants";
import { TOKEN_HEX } from "@/designTokens";

export function PitAccessLight({ part, state, x, y }: {
  part: "entry" | "exit";
  state: "open" | "closed";
  x: number;
  y: number;
}) {
  const id = useId();
  const color = state === "closed" ? TOKEN_HEX.red : TOKEN_HEX.green;
  const radius = TRACK_PIT_ACCESS_MARKER_RADIUS;

  return (
    <g role="img" aria-label={`Pit ${part} ${state}, last reported`}>
      <title>{`Pit ${part} ${state} (last reported)`}</title>
      <defs>
        <radialGradient id={id}>
          <stop offset="0%" stopColor={color} stopOpacity={0.65} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle data-testid={`pit-${part}-glow`} cx={x} cy={y} r={radius * TRACK_PIT_ACCESS_GLOW_SCALE} fill={`url(#${id})`} />
      <circle cx={x} cy={y} r={radius + 1} fill={TOKEN_HEX.track} />
      <circle data-testid={`pit-${part}-status`} cx={x} cy={y} r={radius} fill={color} />
      <circle cx={x - radius * 0.3} cy={y - radius * 0.3} r={radius * 0.28} fill={TOKEN_HEX.fg} fillOpacity={0.7} />
    </g>
  );
}
