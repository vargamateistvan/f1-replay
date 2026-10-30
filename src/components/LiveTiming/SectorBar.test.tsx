import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SectorBar } from "@/components/LiveTiming/SectorBar";

describe("SectorBar", () => {
  it("maps OpenF1 minisector states to the correct colors", () => {
    const { container } = render(
      <SectorBar
        tier="none"
        segments={[2048, 2049, 2051, 2064, 2050, 2052, 2068, 0]}
      />,
    );
    const minisectors = container.querySelectorAll(
      "div > span:nth-child(2) > span",
    );

    expect(minisectors).toHaveLength(8);
    expect(minisectors[0]).toHaveClass("bg-yellow");
    expect(minisectors[1]).toHaveClass("bg-green");
    expect(minisectors[2]).toHaveClass("bg-purple");
    expect(minisectors[3]).toHaveClass("bg-blue");
    expect(minisectors[4]).toHaveClass("bg-faint");
    expect(minisectors[5]).toHaveClass("bg-faint");
    expect(minisectors[6]).toHaveClass("bg-faint");
    expect(minisectors[7]).toHaveClass("bg-panel");
  });

  it("renders minisectors and fallback block branches", () => {
    const { container, rerender } = render(
      <SectorBar
        tier="fastest"
        segments={[2064, 2051, 2049, 1, 0]}
        title="S1"
      />,
    );

    expect(container.querySelectorAll("span").length).toBeGreaterThan(3);

    rerender(
      <SectorBar
        tier="none"
        segments={[]}
        showMinisectors={false}
        widthClass="w-10"
        title="S2"
      />,
    );

    expect(container.querySelector("div.w-10")).toBeInTheDocument();
  });
});
