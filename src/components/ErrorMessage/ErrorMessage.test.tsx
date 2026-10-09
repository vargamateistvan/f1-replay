import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorMessage } from "@/components/ErrorMessage";

describe("ErrorMessage", () => {
  it("renders compact variant as an alert with the red accent", () => {
    render(<ErrorMessage message="Load failed" compact />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Load failed");
    expect(alert.className).toContain("border-l-f1red");
  });

  it("renders full variant with kicker and fallback message", () => {
    const { rerender } = render(<ErrorMessage message="Crashed" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Crashed")).toBeInTheDocument();

    rerender(<ErrorMessage />);
    expect(screen.getByText("Failed to load data")).toBeInTheDocument();
  });

  it("renders empty variant as a status, not an alert", () => {
    render(<ErrorMessage message="No data found" variant="empty" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No data");
    expect(status).toHaveTextContent("No data found");
    expect(status.className).toContain("border-l-flag-sc");
  });
});
