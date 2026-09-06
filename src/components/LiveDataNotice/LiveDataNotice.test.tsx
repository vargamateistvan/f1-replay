import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OpenF1Error } from "@/api/client";
import { LiveDataNotice } from "./LiveDataNotice";

describe("LiveDataNotice", () => {
  it("explains how to support live data after an unauthorized response", () => {
    render(<LiveDataNotice error={new OpenF1Error(401, "position")} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Live data is currently unavailable",
    );
    expect(
      screen.getByRole("link", { name: /support f1 replay/i }),
    ).toHaveAttribute("href", "https://buymeacoffee.com/matt_varga");
    expect(screen.getByRole("link", { name: "OpenF1" })).toHaveAttribute(
      "href",
      "https://openf1.org/",
    );
  });

  it("stays hidden for non-authentication errors", () => {
    const { container } = render(
      <LiveDataNotice error={new OpenF1Error(500, "position")} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
