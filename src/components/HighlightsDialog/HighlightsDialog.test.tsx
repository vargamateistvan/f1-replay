import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { HighlightsDialog } from "./HighlightsDialog";
import type { YouTubePlayerOptions } from "@/lib/youtubePlayer";
import { HIGHLIGHTS_PLAYER_TIMEOUT_MS } from "@/constants";

const mockLoadYouTubeApi = vi.fn();
vi.mock("@/lib/youtubePlayer", () => ({
  loadYouTubeApi: () => mockLoadYouTubeApi(),
}));
const mockTrackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

const highlight = {
  videoId: "xyz789",
  title: "Qualifying Highlights | 2026 Monaco Grand Prix",
  publishedAt: "2026-05-23T16:00:00Z",
};

let playerOptions: YouTubePlayerOptions | null;
const destroy = vi.fn();
class FakePlayer {
  constructor(element: HTMLElement, options: YouTubePlayerOptions) {
    playerOptions = options;
    element.replaceWith(Object.assign(document.createElement("iframe"), { title: "player" }));
  }
  destroy = destroy;
}

function renderDialog(onClose = () => {}) {
  return render(
    <HighlightsDialog
      highlight={highlight}
      sessionKey={42}
      sessionName="Qualifying"
      meta="Monte Carlo · 2026"
      subtitle="Monaco Grand Prix"
      onClose={onClose}
    />,
  );
}

const flush = () => act(async () => {});

describe("HighlightsDialog", () => {
  beforeEach(() => {
    playerOptions = null;
    mockLoadYouTubeApi.mockResolvedValue({ Player: FakePlayer });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("plays the video in the privacy-enhanced YouTube player", async () => {
    const { unmount } = renderDialog();
    await flush();
    const dialog = screen.getByRole("dialog", { name: "Qualifying" });
    expect(dialog.textContent).toContain("Monaco Grand Prix");
    expect(playerOptions).toMatchObject({
      host: "https://www.youtube-nocookie.com",
      videoId: "xyz789",
      playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
    });
    expect(screen.getByTestId("highlights-player").querySelector("iframe")).not.toBeNull();
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the thumbnail when the owner blocks embedding", async () => {
    renderDialog();
    await flush();
    act(() => playerOptions?.events?.onError?.({ data: 150 }));

    const watch = screen.getByRole("link", { name: `Watch ${highlight.title} on YouTube` });
    expect(watch).toHaveAttribute("href", "https://www.youtube.com/watch?v=xyz789");
    expect(watch).toHaveAttribute("target", "_blank");
    expect(screen.queryByTestId("highlights-player")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open on YouTube" })).toBeNull();
    expect(screen.getByText(/owner doesn't allow it to play outside YouTube/)).toBeTruthy();
    expect(mockTrackEvent).toHaveBeenCalledWith("highlights_player_fallback", {
      session_key: 42,
      reason: "error_150",
    });
  });

  it("falls back when the player script can't load", async () => {
    mockLoadYouTubeApi.mockRejectedValue(new Error("blocked"));
    renderDialog();
    await flush();
    expect(screen.getByText("The player couldn't load here.")).toBeTruthy();
    expect(mockTrackEvent).toHaveBeenCalledWith("highlights_player_fallback", {
      session_key: 42,
      reason: "script",
    });
  });

  it("falls back when the player never gets ready", async () => {
    vi.useFakeTimers();
    mockLoadYouTubeApi.mockReturnValue(new Promise(() => {}));
    renderDialog();
    act(() => vi.advanceTimersByTime(HIGHLIGHTS_PLAYER_TIMEOUT_MS));
    expect(screen.getByRole("link", { name: `Watch ${highlight.title} on YouTube` })).toBeTruthy();
    expect(mockTrackEvent).toHaveBeenCalledWith("highlights_player_fallback", {
      session_key: 42,
      reason: "timeout",
    });
  });

  it("keeps playing once the player is ready", async () => {
    vi.useFakeTimers();
    renderDialog();
    await flush();
    act(() => playerOptions?.events?.onReady?.());
    act(() => vi.advanceTimersByTime(HIGHLIGHTS_PLAYER_TIMEOUT_MS * 2));
    expect(screen.getByTestId("highlights-player")).toBeTruthy();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("closes from the backdrop, the close button and Escape", () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("highlights-backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "Close highlights" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
