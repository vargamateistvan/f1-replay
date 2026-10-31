import { loadScriptOnce } from "@/lib/idle";

/**
 * Lazy loader for the YouTube IFrame Player API, which reports playback
 * errors (e.g. 150: the owner blocks embedding) that a bare iframe can't.
 */
export const YOUTUBE_IFRAME_API_URL = "https://www.youtube.com/iframe_api";
const SCRIPT_ID = "youtube-iframe-api";

export interface YouTubePlayer {
  destroy(): void;
}

export interface YouTubePlayerOptions {
  host?: string;
  videoId: string;
  width?: string;
  height?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onError?: (event: { data: number }) => void;
  };
}

export interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: Partial<YouTubeApi>;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let pending: Promise<YouTubeApi> | null = null;

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API needs a browser"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT as YouTubeApi);
  pending ??= new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT as YouTubeApi);
      else reject(new Error("YouTube API loaded without a Player"));
    };
    const script = loadScriptOnce(SCRIPT_ID, YOUTUBE_IFRAME_API_URL);
    script?.addEventListener(
      "error",
      () => {
        // Let a later dialog retry (e.g. after a network blip).
        script.remove();
        pending = null;
        reject(new Error("YouTube API script failed to load"));
      },
      { once: true },
    );
  });
  return pending;
}

/** Test hook: forget the cached loader. */
export function resetYouTubeApiForTests(): void {
  pending = null;
}
