import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, Chip, DialogHeader, Segmented, SettingRow, Toggle, TooltipCard } from "./index";
import { Toggle as LegacyToggle } from "../SettingsModal/SettingsPrimitives";

vi.mock("@/lib/motion", () => ({
  animateMotion: vi.fn(),
  pressMotion: vi.fn(),
}));

describe("shared UI library", () => {
  it("preserves the compatibility export", () => {
    expect(LegacyToggle).toBe(Toggle);
  });

  it("labels setting switches and emits the next value", () => {
    const onChange = vi.fn();
    render(<SettingRow label="Weather effects" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Weather effects" });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute("type", "button");
  });

  it("natively disables a switch and prevents callbacks", () => {
    const onChange = vi.fn();
    render(<Toggle aria-label="Weather" checked disabled onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Weather" });
    expect(toggle).toBeDisabled();
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps numeric segmented values and selection semantics", () => {
    const onChange = vi.fn();
    render(<Segmented value={1} options={[{ value: 1, label: "1x" }, { value: 2, label: "2x" }]} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "1x" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("disables segmented choices", () => {
    const onChange = vi.fn();
    render(<Segmented disabled value="metric" options={[{ value: "metric", label: "Metric" }]} onChange={onChange} />);
    const option = screen.getByRole("button", { name: "Metric" });
    expect(option).toBeDisabled();
    fireEvent.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps chip tone and disabled behavior", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Chip label="Flags" active tone="yellow" onToggle={onToggle} />);
    const chip = screen.getByRole("button", { name: "Flags" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveClass("bg-yellow-tint");
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<Chip label="Flags" active disabled onToggle={onToggle} />);
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("exports the existing button, header and tooltip components", () => {
    const onClose = vi.fn();
    render(<>
      <Button disabled>Replay</Button>
      <DialogHeader eyebrow="Preferences" title="Settings" closeLabel="Close settings" onClose={onClose} />
      <TooltipCard title="Pit window" text="Projected position" />
    </>);
    expect(screen.getByRole("button", { name: "Replay" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Projected position");
  });
});
