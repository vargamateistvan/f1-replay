import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Play } from "lucide-react";
import { DialogHeader } from "@/components/DialogHeader";
import { buttonClass } from "@/components/Button/buttonClass";
import {
  youTubeThumbnailUrl,
  youTubeWatchUrl,
  type SessionHighlight,
} from "@/data/sessionHighlights";
import { loadYouTubeApi, type YouTubePlayer } from "@/lib/youtubePlayer";
import { trackEvent } from "@/lib/analytics";
import { HIGHLIGHTS_PLAYER_TIMEOUT_MS } from "@/constants";

interface Props {
  highlight: SessionHighlight;
  sessionKey: number;
  sessionName: string;
  meta?: string;
  subtitle?: string;
  onClose: () => void;
}

// YouTube IFrame API errors 101 / 150: the owner doesn't allow embedded playback.
const EMBED_BLOCKED_REASONS = new Set(["error_101", "error_150"]);

/**
 * Tries YouTube's privacy-enhanced player; when the video can't play here
 * (FOM blocks embeds on other sites, script blocked, timeout) it shows the
 * thumbnail with a link to watch on YouTube instead.
 */
export function HighlightsDialog({
  highlight,
  sessionKey,
  sessionName,
  meta,
  subtitle,
  onClose,
}: Props) {
  const titleId = useId();
  const playerHostRef = useRef<HTMLDivElement>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const blocked = fallbackReason !== null;
  const watchUrl = youTubeWatchUrl(highlight.videoId);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const host = playerHostRef.current;
    if (!host) return;
    let player: YouTubePlayer | null = null;
    let settled = false;
    const fallBack = (reason: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      trackEvent("highlights_player_fallback", { session_key: sessionKey, reason });
      setFallbackReason(reason);
    };
    const timer = window.setTimeout(() => fallBack("timeout"), HIGHLIGHTS_PLAYER_TIMEOUT_MS);

    loadYouTubeApi()
      .then((YT) => {
        if (settled) return;
        // The API swaps its mount node for an iframe, so give it a node React
        // doesn't own.
        const mount = document.createElement("div");
        host.appendChild(mount);
        player = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          videoId: highlight.videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => window.clearTimeout(timer),
            onError: (event) => fallBack(`error_${event.data}`),
          },
        });
      })
      .catch(() => fallBack("script"));

    return () => {
      settled = true;
      window.clearTimeout(timer);
      player?.destroy();
      host.replaceChildren();
    };
  }, [highlight.videoId, sessionKey]);

  // Portalled: the route shell's enter animation leaves a transform, which
  // would otherwise become the containing block for `fixed`.
  const dialog = (
    <div
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="highlights-backdrop"
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/70 px-3 py-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-6"
    >
      {/* Width capped by the height left for the 16:9 video after header +
          footer (~11rem), so short and landscape screens fit without scrolling. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90dvh] w-full max-w-[max(20rem,min(56rem,calc((90dvh-11rem)*16/9)))] flex-col overflow-y-auto border border-panel bg-surface shadow-2xl"
      >
        <DialogHeader
          eyebrow="Highlights"
          meta={meta}
          title={sessionName}
          titleId={titleId}
          subtitle={subtitle}
          closeLabel="Close highlights"
          onClose={onClose}
        />

        <div className="shrink-0 bg-black">
          <div className="relative aspect-video w-full">
            {blocked ? (
              <a
                href={watchUrl}
                target="_blank"
                rel="noreferrer"
                className="group absolute inset-0 flex items-center justify-center"
                aria-label={`Watch ${highlight.title} on YouTube`}
              >
                <img
                  src={youTubeThumbnailUrl(highlight.videoId)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-60 transition-opacity group-hover:opacity-80"
                  referrerPolicy="no-referrer"
                />
                <span className="relative inline-flex items-center gap-1.5 bg-f1red px-4 py-2 text-caption font-bold uppercase tracking-caps text-white">
                  <Play aria-hidden="true" className="h-3 w-3" />
                  Watch on YouTube
                  <ExternalLink aria-hidden="true" className="h-3 w-3" />
                </span>
              </a>
            ) : (
              <>
                <p
                  role="status"
                  className="absolute inset-0 flex items-center justify-center font-mono text-caption uppercase tracking-caps text-white/60"
                >
                  Loading player…
                </p>
                <div
                  ref={playerHostRef}
                  data-testid="highlights-player"
                  className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full"
                />
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-3 border-t border-panel px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
          <p className="min-w-0 flex-1 text-caption leading-4 text-muted">
            {fallbackReason && EMBED_BLOCKED_REASONS.has(fallbackReason)
              ? "The video's owner doesn't allow it to play outside YouTube."
              : blocked
                ? "The player couldn't load here."
                : "From the FORMULA 1 YouTube channel. Not playing? Watch it on YouTube."}
          </p>
          {/* The fallback thumbnail is itself the YouTube link. */}
          {!blocked && (
            <a
              href={watchUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "md", "w-full sm:w-auto")}
            >
              Open on YouTube
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
