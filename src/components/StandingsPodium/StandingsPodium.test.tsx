import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StandingsPodium, type PodiumEntry } from "./StandingsPodium";

const entry = (position: number, label: string, points: number): PodiumEntry => ({
  key: label,
  position,
  label,
  detail: `${label} full name`,
  color: "#3671c6",
  points,
  href: `/standings/driver/${position}`,
});

const ENTRIES = [
  entry(1, "ANT", 380),
  entry(2, "VER", 261),
  entry(3, "HAM", 259),
  entry(4, "RUS", 250),
];

describe("StandingsPodium", () => {
  it("shows the top three with points and the gap to the leader", () => {
    render(
      <MemoryRouter>
        <StandingsPodium entries={ENTRIES} label="Driver championship top three" />
      </MemoryRouter>,
    );
    const list = screen.getByRole("list", { name: "Driver championship top three" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("ANT");
    expect(items[0]).toHaveTextContent("380");
    expect(items[0]).toHaveTextContent("Leader");
    expect(items[1]).toHaveTextContent("−119");
    expect(items[2]).toHaveTextContent("−121");
    expect(screen.queryByText("RUS")).toBeNull();
  });

  it("links each card to its profile", () => {
    render(
      <MemoryRouter>
        <StandingsPodium entries={ENTRIES} label="Top three" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "P2 VER, 261 points" })).toHaveAttribute(
      "href",
      "/standings/driver/2",
    );
  });

  it("renders nothing without standings", () => {
    const { container } = render(<StandingsPodium entries={[]} label="Top three" />);
    expect(container).toBeEmptyDOMElement();
  });
});
