import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TyreChange } from "./TyreChange";

describe("TyreChange", () => {
  it("shows the old set's laps and NEW for a fresh set", () => {
    render(
      <TyreChange
        off={{ compound: "SOFT", age: 23 }}
        on={{ compound: "HARD", age: 0 }}
      />,
    );
    expect(screen.getByText("23L")).toBeInTheDocument();
    expect(screen.getByText("NEW")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Off: Soft after 23 laps · On: New Hard",
      }),
    ).toBeInTheDocument();
  });

  it("shows the age of a used set", () => {
    render(<TyreChange on={{ compound: "MEDIUM", age: 4 }} />);
    expect(screen.getByText("4L")).toBeInTheDocument();
    expect(screen.queryByText("→")).toBeNull();
  });

  it("renders nothing without tyre data", () => {
    const { container } = render(<TyreChange off={null} on={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("drops the lap suffix in compact mode", () => {
    render(
      <TyreChange
        off={{ compound: "SOFT", age: 23 }}
        on={{ compound: "HARD", age: 5 }}
        compact
      />,
    );
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("23L")).toBeNull();
  });
});
