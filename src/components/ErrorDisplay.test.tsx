import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ErrorDisplay } from "@/components/ErrorDisplay";

describe("ErrorDisplay", () => {
  it("loads stored errors, captures runtime errors, and clears list", async () => {
    sessionStorage.setItem(
      "__app_errors",
      JSON.stringify([{ msg: "Stored boom" }, "Stored fallback"]),
    );

    render(<ErrorDisplay />);

    expect(screen.getByText("Debug: 2 Error(s)")).toBeInTheDocument();
    expect(screen.getByText(/Stored boom/)).toBeInTheDocument();
    expect(screen.getByText(/Stored fallback/)).toBeInTheDocument();

    const runtimeError = new Event("error") as ErrorEvent;
    Object.defineProperty(runtimeError, "message", { value: "Window exploded" });
    Object.defineProperty(runtimeError, "error", {
      value: new Error("Window exploded"),
    });
    window.dispatchEvent(runtimeError);

    const rejectionEvent = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejectionEvent, "reason", {
      value: new Error("Async exploded"),
    });
    window.dispatchEvent(rejectionEvent);

    await waitFor(() => {
      expect(screen.getByText("Debug: 4 Error(s)")).toBeInTheDocument();
    });
    expect(screen.getByText(/Window exploded/)).toBeInTheDocument();
    expect(screen.getByText(/Promise: Async exploded/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    await waitFor(() => {
      expect(screen.queryByText(/Debug:/)).not.toBeInTheDocument();
    });
    expect(sessionStorage.getItem("__app_errors")).toBeNull();
  });

  it("handles invalid stored json gracefully", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sessionStorage.setItem("__app_errors", "{invalid");

    render(<ErrorDisplay />);

    expect(screen.queryByText(/Debug:/)).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to load stored errors:",
      expect.any(Error),
    );
  });
});
