import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CarData, Driver } from "@/api/types";
import { FocusedDriverHud } from "./FocusedDriverHud";
import { PitRejoinPanel } from "./PitRejoinPanel";

const driver: Driver = {
  driver_number: 55,
  session_key: 1,
  meeting_key: 1,
  broadcast_name: "C SAINZ",
  full_name: "Carlos Sainz",
  first_name: "Carlos",
  last_name: "Sainz",
  name_acronym: "SAI",
  team_name: "Ferrari",
  team_colour: "E8002D",
  headshot_url: null,
  country_code: null,
};

const sample: CarData = {
  driver_number: 55,
  session_key: 1,
  meeting_key: 1,
  date: "2024-01-01T12:00:00Z",
  speed: 89,
  n_gear: 1,
  throttle: 50,
  brake: 0,
  rpm: 10000,
  drs: null,
};

describe("map overlay cards", () => {
  it("labels the driver, speed units, gear and pedal values", () => {
    const { container } = render(<FocusedDriverHud sample={sample} driver={driver} metricSystem="metric" />);
    expect(container.firstElementChild).toHaveClass("w-32", "bg-surface/80");
    expect(screen.getByText("SAI")).toBeInTheDocument();
    expect(screen.getByText("Telemetry")).toHaveClass("text-tiny");
    expect(screen.getByText("89")).toBeInTheDocument();
    expect(screen.getByText("km/h")).toHaveClass("text-tiny");
    expect(screen.getByTitle("Gear 1")).toHaveTextContent("1");
    expect(screen.getByText("50")).toHaveClass("text-caption", "text-fg/80");
  });

  it("preserves imperial units and neutral gear, and clamps pedal bars", () => {
    const { container } = render(
      <FocusedDriverHud
        sample={{ ...sample, n_gear: 0, throttle: 120, brake: -10 }}
        driver={undefined}
        metricSystem="imperial"
      />,
    );
    expect(screen.getByText("#55")).toBeInTheDocument();
    expect(screen.getByText("mph")).toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByTitle("Neutral")).toHaveTextContent("N");
    expect(container.querySelector(".bg-green")).toHaveStyle({ width: "100%" });
    expect(container.querySelector(".bg-red")).toHaveStyle({ width: "0%" });
  });

  it.each([
    ["normal", "Green", "bg-green-tint"],
    ["vsc", "VSC", "bg-yellow-tint"],
    ["sc", "SC", "bg-orange-tint"],
  ] as const)("renders the %s pit-loss condition with a semantic badge", (condition, label, badgeClass) => {
    render(
      <PitRejoinPanel
        projection={{
          position: 15,
          ahead: { driverNumber: 55, gapS: 9.7 },
          behind: { driverNumber: 23, gapS: 1.7 },
        }}
        lossS={condition === "normal" ? 22.8 : condition === "sc" ? 12.5 : 15.4}
        pitLoss={{ normal: "22.8", sc: "12.5", vsc: "15.4" }}
        condition={condition}
        color="#E8002D"
        driverByNumber={new Map([[55, driver]])}
      />,
    );
    expect(screen.getByText("Pit now")).toBeInTheDocument();
    expect(screen.getByText("P15")).toBeInTheDocument();
    expect(screen.getByText("SAI", { exact: false })).toHaveTextContent("9.7s");
    expect(screen.getByText("#23", { exact: false })).toHaveTextContent("1.7s");
    expect(screen.getByText("22.8s")).toBeInTheDocument();
    expect(screen.getByText(label).parentElement).toHaveClass(badgeClass);
    expect(screen.getByText("SC").parentElement).toHaveClass("text-orange-fg");
    expect(screen.getByText("VSC").parentElement).toHaveClass("text-yellow-fg");
    if (condition !== "sc") {
      expect(screen.getByText("SC").parentElement).toHaveClass("border-transparent");
    }
    if (condition !== "vsc") {
      expect(screen.getByText("VSC").parentElement).toHaveClass("border-transparent");
    }
    expect(screen.getByTestId("pit-rejoin-panel")).toHaveClass("hidden", "md:block", "w-32", "bg-surface/80");
    expect(screen.getByText(label)).toHaveClass("text-tiny");
    expect(screen.getByText("22.8s")).toHaveClass("text-caption");
    for (const [key, value] of [["normal", "22.8s"], ["sc", "12.5s"], ["vsc", "15.4s"]] as const) {
      const title = key === "normal" ? "Green" : key.toUpperCase();
      expect(screen.getByTitle(`${title} pit time loss${key === condition ? " (current)" : ""}`))
        .toHaveTextContent(value);
    }
  });

  it("shows Rejoin for a car in the pits and omits absent neighbours", () => {
    render(
      <PitRejoinPanel
        projection={{ position: 1, ahead: null, behind: null }}
        lossS={22.8}
        condition="normal"
        color="#E8002D"
        driverByNumber={new Map()}
        inPit
      />,
    );
    expect(screen.getByText("Rejoin")).toBeInTheDocument();
    expect(screen.queryByText("Behind")).not.toBeInTheDocument();
    expect(screen.queryByText("Ahead of")).not.toBeInTheDocument();
    expect(screen.getByTitle("SC pit time loss")).toHaveTextContent("—");
    expect(screen.getByTitle("VSC pit time loss")).toHaveTextContent("—");
  });
});
