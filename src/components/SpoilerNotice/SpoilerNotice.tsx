import { EyeOff } from "lucide-react";
import type { Session } from "@/api/types";
import { trackEvent } from "@/lib/analytics";
import { useSpoilers } from "@/stores/spoilers";
import { isSprintSession } from "@/utils/session";

type RoundSession = Pick<Session, "session_key" | "session_name" | "location">;

interface Props {
  /** Rounds held back by spoiler-free mode, oldest first. */
  hidden: readonly RoundSession[];
  /** Latest round the page still includes. */
  through: RoundSession | undefined;
}

function roundLabel(s: RoundSession): string {
  return `${s.location} ${isSprintSession(s.session_name) ? "Sprint" : "GP"}`;
}

/** "Standings after X — N newer rounds hidden", with reveal buttons. */
export function SpoilerNotice({ hidden, through }: Readonly<Props>) {
  const markWatched = useSpoilers((s) => s.markWatched);
  const revealAll = useSpoilers((s) => s.revealAll);
  if (hidden.length === 0) return null;

  const next = hidden[0]!;
  const count = hidden.length;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-panel bg-surface px-4 py-2 text-xs"
    >
      <span className="flex items-center gap-2">
        <EyeOff className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="font-bold text-white">
          {through ? `Standings after ${roundLabel(through)}` : "No rounds shown yet"}
        </span>
        <span className="text-muted">
          {count === 1 ? "1 newer round hidden" : `${count} newer rounds hidden`}{" "}
          (spoiler-free mode)
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            markWatched(next.session_key);
            trackEvent("spoiler_revealed", { scope: "round" });
          }}
          className="border border-panel px-2 py-0.5 font-bold uppercase tracking-wider text-[10px] text-muted hover:text-white"
        >
          Reveal {roundLabel(next)}
        </button>
        {count > 1 && (
          <button
            type="button"
            onClick={() => {
              revealAll();
              trackEvent("spoiler_revealed", { scope: "all" });
            }}
            className="border border-panel px-2 py-0.5 font-bold uppercase tracking-wider text-[10px] text-muted hover:text-white"
          >
            Reveal all
          </button>
        )}
      </span>
    </div>
  );
}
