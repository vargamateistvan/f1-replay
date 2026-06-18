import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AppLogo } from "@/components/AppLogo";

describe("AppLogo", () => {
  it("renders default square logo with accessibility-hidden svg", () => {
    const { container } = render(<AppLogo />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("applies custom size and className", () => {
    const { container } = render(<AppLogo size={40} className="ring-logo" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "40");
    expect(svg).toHaveAttribute("height", "40");
    expect(svg).toHaveClass("ring-logo");
  });
});
