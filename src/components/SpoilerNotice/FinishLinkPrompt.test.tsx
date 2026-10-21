import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FinishLinkPrompt } from "./FinishLinkPrompt";

describe("FinishLinkPrompt", () => {
  it("only covers the page while checking", () => {
    render(
      <FinishLinkPrompt sessionLabel="the Zandvoort Race" checking onStartOver={vi.fn()} onReveal={vi.fn()} />,
    );
    expect(screen.getByRole("dialog", { name: "Checking for spoilers…" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers to start over or show the link anyway", () => {
    const onStartOver = vi.fn();
    const onReveal = vi.fn();
    render(
      <FinishLinkPrompt
        sessionLabel="the Zandvoort Race"
        checking={false}
        onStartOver={onStartOver}
        onReveal={onReveal}
      />,
    );
    expect(screen.getByText(/You haven't watched the Zandvoort Race yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start from the beginning" }));
    fireEvent.click(screen.getByRole("button", { name: "Show it anyway" }));
    expect(onStartOver).toHaveBeenCalledOnce();
    expect(onReveal).toHaveBeenCalledOnce();
  });
});
