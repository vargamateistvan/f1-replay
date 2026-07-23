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

  it("places overlay notifications below the header area", () => {
    render(
      <EventToastStack
        toasts={
          [
            {
              addedAt: Date.now(),
              event: {
                id: "flag-2",
                ms: 1000,
                kind: "flag",
                priority: "high",
                payload: {
                  flag: "RED",
                  message: "Red flag",
                  lapNumber: 3,
                },
              },
            },
          ] as ActiveToast[]
        }
        drivers={drivers}
        onDismiss={vi.fn()}
        layout="overlay"
      />,
    );

    expect(
      screen.getByRole("region", { name: "Live race notifications" }),
    ).toHaveClass("top-[calc(4.5rem+env(safe-area-inset-top)+20px)]");
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

  it("shows penalty subtype badge for warning notices", () => {
    render(
      <EventToastStack
        toasts={
          [
            {
              addedAt: Date.now(),
              event: {
                id: "penalty-1",
                ms: 2000,
                kind: "penalty",
                priority: "high",
                payload: {
                  flag: "",
                  message: "Black and white flag for car 4",
                  lapNumber: 12,
                },
              },
            },
          ] as ActiveToast[]
        }
        drivers={drivers}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("PENALTY")).toBeInTheDocument();
    expect(screen.getByText("NOTICE")).toBeInTheDocument();
  });
});
