import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVerticalResize } from "./useVerticalResize";

describe("useVerticalResize", () => {
  it("updates height on drag, clamps values, and resets", () => {
    const { result } = renderHook(() =>
      useVerticalResize({ initialHeight: 200, minHeight: 120, maxHeight: 300 }),
    );

    expect(result.current.height).toBe(200);

    act(() =>
      result.current.handleProps.onMouseDown({
        preventDefault: vi.fn(),
        clientY: 200,
      } as any),
    );

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 150 }));
    });
    expect(result.current.height).toBe(250);

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: -500 }));
    });
    expect(result.current.height).toBe(300);

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    act(() => result.current.reset());
    expect(result.current.height).toBe(200);
  });
});
