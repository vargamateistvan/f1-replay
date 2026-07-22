import React from "react";

interface Props {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onDoubleClick?: () => void;
  orientation?: "horizontal" | "vertical";
  /** Extra Tailwind classes */
  className?: string;
}

/**
 * A thin horizontal drag handle for resizing adjacent vertical panels.
 * Drag UP/DOWN to resize; double-click to reset to default.
 */
export function ResizeHandle({
  onMouseDown,
  onTouchStart,
  onDoubleClick,
  orientation = "horizontal",
  className = "",
}: Props) {
  const isVertical = orientation === "vertical";

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · Double-click to reset"
      role="separator"
      aria-orientation={orientation}
      className={`shrink-0 bg-[#2a2a35] hover:bg-[#38383f] active:bg-f1red transition-colors flex items-center justify-center group select-none ${
        isVertical
          ? "h-full w-[5px] cursor-ew-resize"
          : "h-[5px] cursor-ns-resize"
      } ${className}`}
    >
      {/* Grip indicator: three short lines */}
      <div
        className={`opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none ${
          isVertical ? "flex flex-row gap-[2px]" : "flex flex-col gap-[2px]"
        }`}
      >
        <span
          className={`${isVertical ? "h-6 w-px" : "h-px w-6"} rounded-full bg-white`}
        />
        <span
          className={`${isVertical ? "h-6 w-px" : "h-px w-6"} rounded-full bg-white`}
        />
        <span
          className={`${isVertical ? "h-6 w-px" : "h-px w-6"} rounded-full bg-white`}
        />
      </div>
    </div>
  );
}
