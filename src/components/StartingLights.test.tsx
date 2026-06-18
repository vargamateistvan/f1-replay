import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StartingLights } from "@/components/StartingLights";

describe("StartingLights", () => {
  it("is hidden before the pre-start display window and after lights out", () => {
    const { rerender, container } = render(
      <StartingLights t={0} lightsOutMs={10_000} />,
    );
    expect(container.firstChild).toBeNull();

    rerender(<StartingLights t={10_000} lightsOutMs={10_000} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows get-ready then lights-out hint near race start", () => {
    const { rerender } = render(
      <StartingLights t={4_800} lightsOutMs={10_000} />,
    );
    expect(screen.getByText("GET READY")).toBeInTheDocument();

    rerender(<StartingLights t={9_900} lightsOutMs={10_000} />);
    expect(screen.getByText("LIGHTS OUT")).toBeInTheDocument();
  });
});
