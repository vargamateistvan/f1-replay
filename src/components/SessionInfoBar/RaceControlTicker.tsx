import { RotateCcw } from "lucide-react";
import type { Driver } from "@/api/types";
import { RC_TICKER_FRESH_MS } from "@/constants";
import { teamColor } from "@/utils/color";
import type { NormalizedRaceControlEvent } from "@/timeline/raceControl";
import { COMMENTARY_BADGE_CLASS } from "@/components/CommentaryPanels/commentaryList";
import {
  raceControlEventAccent,
  raceControlEventBadge,
} from "@/components/RaceControl/eventStyle";
import { TOKEN_HEX } from "@/designTokens";

interface Props {
  event: NormalizedRaceControlEvent;
  /** Other messages issued at the same instant (shown as "+N"). */
  sameTimeCount?: number;
  driver?: Driver;
  sessionTimeMs: number;
  onJumpToSessionTime?: (sessionTimeMs: number) => void;
  className?: string;
}

function fmtAge(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 1) return "now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** Latest race control message, styled like the commentary feed; re-animates on each new message. */
export function RaceControlTicker({
  event,
  sameTimeCount = 0,
  driver,
  sessionTimeMs,
  onJumpToSessionTime,
  className: extraClassName = "",
}: Readonly<Props>) {
  const badge = raceControlEventBadge(event);
  const accent = raceControlEventAccent(event, driver?.team_colour);
  const ageMs = sessionTimeMs - event.ms;
  const isFresh = ageMs < RC_TICKER_FRESH_MS;
  const driverColour = driver ? teamColor(driver.team_colour) : null;
  const pulseColour =
    accent?.backgroundColor ?? badge.style?.backgroundColor ?? TOKEN_HEX.f1red;

  const content = (
    <>
      {accent && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[4px]"
          style={accent}
        />
      )}
      {accent && isFresh && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 motion-safe:animate-rc-ticker-flash"
          style={accent}
        />
      )}
      <span className="flex shrink-0 items-center gap-1.5 text-muted">
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          {isFresh && (
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping"
              style={{ backgroundColor: pulseColour }}
            />
          )}
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full transition-colors"
            style={{
              backgroundColor: isFresh ? pulseColour : "rgb(var(--color-muted))",
            }}
          />
        </span>
        <span className="hidden xl:inline">Race Control</span>
      </span>
      <span
        className={`flex min-w-0 flex-1 items-center gap-2 ${
          isFresh ? "motion-safe:animate-rc-ticker-in" : ""
        }`}
      >
        {event.lapNumber !== null && (
          <span className="shrink-0 text-muted">L{event.lapNumber}</span>
        )}
        <span
          className={`${COMMENTARY_BADGE_CLASS} ${badge.className}`}
          style={badge.style}
        >
          {badge.label}
        </span>
        {driver && driverColour && (
          <span
            className="shrink-0 rounded-sm px-1 py-0.5 font-black leading-none"
            style={{
              color: driverColour,
              backgroundColor: `${driverColour}26`,
            }}
          >
            {driver.name_acronym}
          </span>
        )}
        <span
          className={`truncate font-medium normal-case tracking-normal transition-colors ${
            isFresh ? "text-fg/90" : "text-fg/60"
          }`}
        >
          {event.description}
        </span>
        {sameTimeCount > 0 && (
          <span
            className="shrink-0 rounded-sm bg-fg/10 px-1 py-0.5 leading-none text-muted"
            title={`${sameTimeCount} more message${sameTimeCount === 1 ? "" : "s"} at this time`}
          >
            +{sameTimeCount}
          </span>
        )}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1 font-mono normal-case tracking-normal tabular-nums text-muted">
        {fmtAge(ageMs)}
        {onJumpToSessionTime && (
          <RotateCcw
            aria-hidden="true"
            className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </span>
    </>
  );

  const className = `group relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden border-t border-panel py-2 pl-4 pr-3 sm:border-t-0 ${extraClassName}`;

  if (!onJumpToSessionTime) {
    return (
      <div className={className} title={event.description}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onJumpToSessionTime(event.ms)}
      className={`${className} text-left uppercase transition-colors hover:bg-fg/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-f1red`}
      title={`${event.description} — click to replay from here`}
      aria-label={`Replay from race control message: ${event.description}`}
    >
      {content}
    </button>
  );
}
