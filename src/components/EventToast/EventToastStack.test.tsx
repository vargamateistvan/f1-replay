import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventToastStack } from "@/components/EventToast/EventToastStack";
import type { Driver } from "@/api/types";
import type { ActiveToast } from "@/hooks/useEventToasts";

const drivers: Driver[] = [
  {
    driver_number: 1,
    name_acronym: "VER",
    full_name: "Max Verstappen",
    team_colour: "3671C6",
  },
] as unknown as Driver[];

describe("EventToastStack", () => {
  it("returns null with no toasts", () => {
    const { container } = render(
      <EventToastStack toasts={[]} drivers={drivers} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a flag toast and dismisses it", () => {
    const onDismiss = vi.fn();
    render(
      <EventToastStack
        toasts={
          [
            {
              addedAt: Date.now(),
              event: {
                id: "flag-1",
                ms: 1000,
                kind: "flag",
                priority: "high",
                payload: {
                  flag: "YELLOW",
                  message: "Yellow flag sector 2",
                  lapNumber: 2,
                },
              },
            },
          ] as ActiveToast[]
        }
        drivers={drivers}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("YELLOW")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith("flag-1");
  });

  it("renders radio toast and toggles play/stop", () => {
    render(
      <EventToastStack
        toasts={
          [
            {
              addedAt: Date.now(),
              event: {
                id: "radio-1",
                ms: 1000,
                kind: "radio",
                priority: "high",
                payload: {
                  driverNumber: 1,
                  recordingUrl: "https://example.com/radio.mp3",
                },
              },
            },
          ] as ActiveToast[]
        }
        drivers={drivers}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });
});
