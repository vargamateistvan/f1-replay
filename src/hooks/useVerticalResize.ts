import React, { useEffect, useRef, useState } from "react";

interface Options {
  initialHeight: number;
  minHeight: number;
  maxHeight: number;
}

/**
 * Drag-to-resize for a vertically-split layout where the bottom panel has a
 * controlled height. The handle sits above the bottom panel; dragging it UP
 * grows the panel, dragging DOWN shrinks it.
 */
export function useVerticalResize({
  initialHeight,
  minHeight,
  maxHeight,
}: Options) {
  const [height, setHeight] = useState(initialHeight);

  // Stable refs so the window listeners created once stay up to date.
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const clampRef = useRef({ minHeight, maxHeight });
  clampRef.current = { minHeight, maxHeight };

  useEffect(() => {
    function onMove(clientY: number) {
      if (!dragRef.current) return;
      const delta = clientY - dragRef.current.startY;
      const { minHeight, maxHeight } = clampRef.current;
      setHeight(
        Math.max(
          minHeight,
          Math.min(maxHeight, dragRef.current.startH - delta),
        ),
      );
    }

    function onMouseMove(e: MouseEvent) {
      onMove(e.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      onMove(e.touches[0]!.clientY);
    }

    function onEnd() {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []); // single mount/unmount — clampRef keeps values current

  function startDrag(clientY: number) {
    dragRef.current = { startY: clientY, startH: height };
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }

  const handleProps = {
    onMouseDown(e: React.MouseEvent) {
      e.preventDefault();
      startDrag(e.clientY);
    },
    onTouchStart(e: React.TouchEvent) {
      startDrag(e.touches[0]!.clientY);
    },
  };

  const reset = () => setHeight(initialHeight);

  return { height, handleProps, reset };
}
