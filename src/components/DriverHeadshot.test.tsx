import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import type { Driver } from "@/api/types";

const drivers: Driver[] = [
  {
    driver_number: 1,
    name_acronym: "VER",
    full_name: "Max Verstappen",
    team_colour: "3671C6",
    headshot_url: "https://example.com/ver.png",
  },
  {
    driver_number: 16,
    name_acronym: "LEC",
    full_name: "Charles Leclerc",
    team_colour: "E8002D",
  },
] as unknown as Driver[];

describe("DriverHeadshot", () => {
  it("renders acronym fallback when no image url is present", () => {
    render(<DriverHeadshot driver={drivers[1]} accent="#fff" size="sm" />);
    expect(screen.getByText("LEC")).toBeInTheDocument();
  });

  it("renders image and falls back to acronym on image error", () => {
    render(<DriverHeadshot driver={drivers[0]} accent="#fff" size="sm" />);
    const image = screen.getByAltText("Max Verstappen");
    expect(image).toBeInTheDocument();

    fireEvent.error(image);
    expect(screen.getByText("VER")).toBeInTheDocument();
  });
});
