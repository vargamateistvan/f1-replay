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
  const [isDragging, setIsDragging] = useState(false);

  // Stable refs so the window listeners created once stay up to date.
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const clampRef = useRef({ minHeight, maxHeight });
  clampRef.current = { minHeight, maxHeight };

  useEffect(() => {
    if (!isDragging) return;

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
      if (!dragRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      onMove(touch.clientY);
    }

    function onEnd() {
      dragRef.current = null;
      setIsDragging(false);
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
  }, [isDragging]);

  function startDrag(clientY: number) {
    dragRef.current = { startY: clientY, startH: height };
    setIsDragging(true);
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
