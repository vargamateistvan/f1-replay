import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ResizeHandle } from "@/components/ResizeHandle";

describe("ResizeHandle", () => {
  it("renders separator semantics and title", () => {
    render(
      <ResizeHandle
        onMouseDown={vi.fn()}
        onTouchStart={vi.fn()}
      />,
    );

    const handle = screen.getByRole("separator");
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    expect(handle).toHaveAttribute("title", "Drag to resize · Double-click to reset");
  });

  it("fires drag and reset handlers", () => {
    const onMouseDown = vi.fn();
    const onTouchStart = vi.fn();
    const onDoubleClick = vi.fn();

    render(
      <ResizeHandle
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onDoubleClick={onDoubleClick}
      />,
    );

    const handle = screen.getByRole("separator");
    fireEvent.mouseDown(handle);
    fireEvent.touchStart(handle);
    fireEvent.doubleClick(handle);

    expect(onMouseDown).toHaveBeenCalledTimes(1);
    expect(onTouchStart).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });
});
