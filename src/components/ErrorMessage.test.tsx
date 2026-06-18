import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorMessage } from "@/components/ErrorMessage";

describe("ErrorMessage", () => {
  it("renders compact variant", () => {
    render(<ErrorMessage message="Load failed" compact />);
    expect(screen.getByText("⚠ Load failed")).toBeInTheDocument();
  });

  it("renders full variant with icon and fallback message", () => {
    const { rerender } = render(<ErrorMessage message="Crashed" />);
    expect(screen.getByText("⚠")).toBeInTheDocument();
    expect(screen.getByText("Crashed")).toBeInTheDocument();

    rerender(<ErrorMessage />);
    expect(screen.getByText("Failed to load data")).toBeInTheDocument();
  });
});
