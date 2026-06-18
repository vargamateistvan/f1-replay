import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

describe("ErrorBoundary", () => {
  it("renders fallback when child throws and can recover via retry", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    function FlakyChild({ shouldCrash }: { shouldCrash: boolean }) {
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
});
