import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SectorBar } from "@/components/LiveTiming/SectorBar";

describe("SectorBar", () => {
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
