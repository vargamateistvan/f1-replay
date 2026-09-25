import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { OpenF1Error } from "@/api/client";
import { LiveDataNotice } from "./LiveDataNotice";
import { resetLiveDataNoticeDismissal } from "./dismissal";

describe("LiveDataNotice", () => {
  beforeEach(() => {
    resetLiveDataNoticeDismissal();
  });

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

  it("can be dismissed, hiding every instance for the rest of the session", () => {
    const error = new OpenF1Error(403, "position");
    render(
      <>
        <LiveDataNotice error={error} />
        <LiveDataNotice error={error} />
      </>,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Dismiss live data notice" })[0],
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("f1replay:live-data-notice-dismissed")).toBe(
      "1",
    );
  });
});
