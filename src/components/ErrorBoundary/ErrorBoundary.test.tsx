import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { resetStaleChunkReload } from "@/lib/staleChunkReload";

describe("ErrorBoundary", () => {
  it("renders fallback when child throws and can recover via retry", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    function FlakyChild({ shouldCrash }: Readonly<{ shouldCrash: boolean }>) {
      if (shouldCrash) throw new Error("Telemetry failed");
      return <div>Recovered child</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <FlakyChild shouldCrash />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Safety Car Deployed")).toBeInTheDocument();
    expect(screen.getByText("Telemetry failed")).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <FlakyChild shouldCrash={false} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(screen.getByText("Recovered child")).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("reloads instead of crashing when a deploy removed a chunk", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal("location", { ...globalThis.location, reload });
    sessionStorage.clear();
    resetStaleChunkReload();

    function StaleChunk(): never {
      throw new TypeError(
        "Failed to fetch dynamically imported module: https://f1replay.app/assets/Schedule-DoO3Ueew.js",
      );
    }

    render(
      <ErrorBoundary>
        <StaleChunk />
      </ErrorBoundary>,
    );

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the latest version",
    );
    expect(screen.queryByText("Safety Car Deployed")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
    resetStaleChunkReload();
    sessionStorage.clear();
    errorSpy.mockRestore();
  });

  it("recovers via Go to Home without hard navigation", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    function FlakyChild({ shouldCrash }: Readonly<{ shouldCrash: boolean }>) {
      if (shouldCrash) throw new Error("Track map failed");
      return <div>Recovered child</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <FlakyChild shouldCrash />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Safety Car Deployed")).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <FlakyChild shouldCrash={false} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Go to Home" }));
    expect(screen.getByText("Recovered child")).toBeInTheDocument();
    expect(globalThis.window.location.pathname).toBe("/");
    expect(errorSpy).toHaveBeenCalled();
  });
});
