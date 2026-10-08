import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TitleOutlookBanner, type TitleEntry } from "./TitleOutlookBanner";

const remaining = { races: 2, sprints: 1, driver: 58, team: 101 };

const entry = (
  key: string,
  points: number,
  status: NonNullable<TitleEntry["title"]>["status"],
): TitleEntry => ({
  key,
  label: key,
  color: "#fff",
  points,
  title: { status, maxPoints: points + remaining.driver },
});

describe("TitleOutlookBanner", () => {
  it("lists contenders with their gap to the leader", () => {
    render(
      <TitleOutlookBanner
        scope="driver"
        remaining={remaining}
        entries={[
          entry("NOR", 300, "leader"),
          entry("PIA", 280, "contender"),
          entry("VER", 200, "eliminated"),
        ]}
      />,
    );
    expect(screen.getByText("2 drivers in contention")).toBeInTheDocument();
    expect(screen.getByText(/58 pts left \(2 races, 1 sprint\)/)).toBeInTheDocument();
    expect(screen.getByText("−20")).toBeInTheDocument();
    expect(screen.queryByText("VER")).not.toBeInTheDocument();
  });

  it("announces a clinched title", () => {
    render(
      <TitleOutlookBanner
        scope="team"
        remaining={remaining}
        entries={[entry("McLaren", 600, "champion"), entry("Ferrari", 300, "eliminated")]}
      />,
    );
    expect(screen.getByText("McLaren")).toBeInTheDocument();
    expect(screen.getByText("clinched the title with 2 races to go")).toBeInTheDocument();
  });

  it("announces the champion when the season is over", () => {
    render(
      <TitleOutlookBanner
        scope="driver"
        remaining={{ races: 0, sprints: 0, driver: 0, team: 0 }}
        entries={[entry("VER", 400, "champion")]}
      />,
    );
    expect(screen.getByText("won the championship")).toBeInTheDocument();
  });

  it("renders nothing without outlook data", () => {
    const { container } = render(
      <TitleOutlookBanner scope="driver" remaining={null} entries={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
