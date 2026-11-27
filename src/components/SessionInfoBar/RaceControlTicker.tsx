import { useId, useState, type FocusEvent } from "react";
import { RotateCcw, X } from "lucide-react";
import type { Driver } from "@/api/types";
import { RC_TICKER_FRESH_MS } from "@/constants";
import { teamColor } from "@/utils/color";
import type { NormalizedRaceControlEvent } from "@/timeline/raceControl";
import {
  COMMENTARY_BADGE_CLASS,
  formatSessionElapsedTime,
} from "@/components/CommentaryPanels/commentaryList";
import {
  raceControlEventAccent,
  raceControlEventBadge,
} from "@/components/RaceControl/eventStyle";
import { TOKEN_HEX } from "@/designTokens";

interface Props {
  event: NormalizedRaceControlEvent;
  recentEvents: NormalizedRaceControlEvent[];
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
  recentEvents,
  sameTimeCount = 0,
  driver,
  sessionTimeMs,
  onJumpToSessionTime,
  className: extraClassName = "",
}: Readonly<Props>) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const panelId = useId();
  const isOpen = !isDismissed && (isHovered || isFocused);
  const badge = raceControlEventBadge(event);
  const accent = raceControlEventAccent(event, driver?.team_colour);
  const ageMs = sessionTimeMs - event.ms;
  const isFresh = ageMs < RC_TICKER_FRESH_MS;
  const driverColour = driver ? teamColor(driver.team_colour) : null;
  const pulseColour =
    accent?.backgroundColor ?? badge.style?.backgroundColor ?? TOKEN_HEX.f1red;

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsFocused(false);
    }
  }

  function openPanelFromHover() {
    setIsDismissed(false);
    setIsHovered(true);
  }

  function openPanelFromFocus() {
    setIsDismissed(false);
    setIsFocused(true);
  }

  function closePanel() {
    setIsDismissed(true);
    setIsHovered(false);
    setIsFocused(false);
  }

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

  return (
    <div
      className="relative min-w-0 flex-1"
      onMouseEnter={openPanelFromHover}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={openPanelFromFocus}
      onBlurCapture={handleBlur}
    >
      {onJumpToSessionTime ? (
        <button
          type="button"
          onClick={() => onJumpToSessionTime(event.ms)}
          className={`${className} text-left uppercase transition-colors hover:bg-fg/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-f1red`}
          title={`${event.description} — click to replay from here`}
          aria-label={`Replay from race control message: ${event.description}`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
        >
          {content}
        </button>
      ) : (
        <div className={className} title={event.description}>
          {content}
        </div>
      )}
      {isOpen && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Recent race control messages"
          className="absolute right-0 top-full z-popover w-[min(420px,92vw)] overflow-hidden rounded-sm border border-panel bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 bg-f1red px-4 py-1 text-white sm:px-5">
            <span className="text-caption font-black uppercase tracking-spaced">
              Race Control
            </span>
            <span className="ml-auto font-mono text-caption uppercase tracking-wider">
              {recentEvents.length} messages
            </span>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close recent messages"
              className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/30 transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[min(24rem,60dvh)] divide-y divide-panel overflow-y-auto overscroll-contain">
            {recentEvents.map((recentEvent) => {
              const recentBadge = raceControlEventBadge(recentEvent);
              const recentAccent = raceControlEventAccent(recentEvent);
              return (
                <div
                  key={recentEvent.id}
                  className="relative flex min-w-0 items-start gap-2 px-3 py-2"
                >
                  {recentAccent && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-0.5"
                      style={recentAccent}
                    />
                  )}
                  <time
                    dateTime={recentEvent.date}
                    className="shrink-0 font-mono text-small leading-4 tabular-nums text-fg/60"
                  >
                    {formatSessionElapsedTime(Math.max(0, recentEvent.ms))}
                  </time>
                  {recentEvent.lapNumber !== null && (
                    <span className="shrink-0 text-small text-muted">
                      L{recentEvent.lapNumber}
                    </span>
                  )}
                  <span
                    className={`${COMMENTARY_BADGE_CLASS} ${recentBadge.className}`}
                    style={recentBadge.style}
                  >
                    {recentBadge.label}
                  </span>
                  <span className="min-w-0 text-small leading-4 normal-case tracking-normal text-fg/90">
                    {recentEvent.description}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
