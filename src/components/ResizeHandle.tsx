interface Props {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onDoubleClick?: () => void;
  /** Extra Tailwind classes */
  className?: string;
}

/**
 * A thin horizontal drag handle for resizing adjacent vertical panels.
 * Drag UP/DOWN to resize; double-click to reset to default.
 */
export function ResizeHandle({ onMouseDown, onTouchStart, onDoubleClick, className = "" }: Props) {
  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · Double-click to reset"
      role="separator"
      aria-orientation="horizontal"
      className={`shrink-0 h-[5px] cursor-ns-resize bg-[#2a2a35] hover:bg-[#38383f] active:bg-f1red
        transition-colors flex items-center justify-center group select-none ${className}`}
    >
      {/* Grip indicator: three short lines */}
      <div className="flex flex-col gap-[2px] opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
        <span className="w-6 h-px bg-white rounded-full" />
        <span className="w-6 h-px bg-white rounded-full" />
        <span className="w-6 h-px bg-white rounded-full" />
      </div>
    </div>
  );
}
