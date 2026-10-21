import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useSpoilers } from "@/stores/spoilers";
import { SpoilerNotice } from "./SpoilerNotice";

const round = (key: number, location: string, session_name = "Race") => ({
  session_key: key,
  session_name,
  location,
});

beforeEach(() => {
  useSpoilers.setState({ enabled: true, knownBeforeMs: 0, watched: {} });
});

describe("SpoilerNotice", () => {
  it("renders nothing without hidden rounds", () => {
    const { container } = render(<SpoilerNotice hidden={[]} through={round(1, "Monza")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the last included round and counts the hidden ones", () => {
    render(
      <SpoilerNotice
        hidden={[round(2, "Baku", "Sprint"), round(3, "Baku")]}
        through={round(1, "Monza")}
      />,
    );
    expect(screen.getByText("Standings after Monza GP")).toBeInTheDocument();
    expect(screen.getByText(/2 newer rounds hidden/)).toBeInTheDocument();
  });

  it("reveals the next round only", () => {
    render(<SpoilerNotice hidden={[round(2, "Baku", "Sprint"), round(3, "Baku")]} through={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal Baku Sprint" }));
    expect(useSpoilers.getState().watched[2]).toBeDefined();
    expect(useSpoilers.getState().watched[3]).toBeUndefined();
  });

  it("reveals everything", () => {
    render(<SpoilerNotice hidden={[round(2, "Baku"), round(3, "Singapore")]} through={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal all" }));
    expect(useSpoilers.getState().knownBeforeMs).toBeGreaterThan(0);
  });
});
