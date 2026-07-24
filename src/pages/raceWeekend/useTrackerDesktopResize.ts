import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from "react";

const TRACKER_DESKTOP_PANEL_WIDTH_STORAGE_KEY =
  "f1-replay.tracker.desktopPanelWidth";
const TRACKER_DESKTOP_PANEL_MIN_WIDTH = 420;
const TRACKER_DESKTOP_MAP_MIN_WIDTH = 320;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function defaultTrackerDesktopPanelWidth() {
  if (typeof window === "undefined") return 905;
  return window.innerWidth >= 1024 ? 905 : 745;
}

export function useTrackerDesktopResize() {
  const trackerDesktopSplitRef = useRef<HTMLDivElement | null>(null);
  const trackerDesktopDragRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const [trackerDesktopPanelWidth, setTrackerDesktopPanelWidth] = useState(
    () => {
      if (typeof window === "undefined") {
        return defaultTrackerDesktopPanelWidth();
      }
      const stored = window.localStorage.getItem(
        TRACKER_DESKTOP_PANEL_WIDTH_STORAGE_KEY,
      );
      const parsed = stored ? Number.parseFloat(stored) : Number.NaN;
      return Number.isFinite(parsed)
        ? parsed
        : defaultTrackerDesktopPanelWidth();
    },
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      TRACKER_DESKTOP_PANEL_WIDTH_STORAGE_KEY,
      String(Math.round(trackerDesktopPanelWidth)),
    );
  }, [trackerDesktopPanelWidth]);

  useEffect(() => {
    function clampTrackerDesktopPanelWidth() {
      const splitWidth = trackerDesktopSplitRef.current?.clientWidth ?? 0;
      if (splitWidth <= 0) return;
      const maxWidth = Math.max(
        TRACKER_DESKTOP_PANEL_MIN_WIDTH,
        splitWidth - TRACKER_DESKTOP_MAP_MIN_WIDTH,
      );
      const minWidth = Math.min(TRACKER_DESKTOP_PANEL_MIN_WIDTH, maxWidth);
      setTrackerDesktopPanelWidth((currentWidth) =>
        clamp(currentWidth, minWidth, maxWidth),
      );
    }

    clampTrackerDesktopPanelWidth();
    window.addEventListener("resize", clampTrackerDesktopPanelWidth);
    return () =>
      window.removeEventListener("resize", clampTrackerDesktopPanelWidth);
  }, []);

  useEffect(() => {
    function updateTrackerDesktopPanelWidth(clientX: number) {
      const drag = trackerDesktopDragRef.current;
      const splitWidth = trackerDesktopSplitRef.current?.clientWidth ?? 0;
      if (!drag || splitWidth <= 0) return;
      const maxWidth = Math.max(
        TRACKER_DESKTOP_PANEL_MIN_WIDTH,
        splitWidth - TRACKER_DESKTOP_MAP_MIN_WIDTH,
      );
      const minWidth = Math.min(TRACKER_DESKTOP_PANEL_MIN_WIDTH, maxWidth);
      setTrackerDesktopPanelWidth(
        clamp(drag.startWidth + (clientX - drag.startX), minWidth, maxWidth),
      );
    }

    function stopTrackerDesktopPanelDrag() {
      trackerDesktopDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function onMouseMove(event: globalThis.MouseEvent) {
      updateTrackerDesktopPanelWidth(event.clientX);
    }

    function onTouchMove(event: globalThis.TouchEvent) {
      if (!trackerDesktopDragRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      updateTrackerDesktopPanelWidth(touch.clientX);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopTrackerDesktopPanelDrag);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", stopTrackerDesktopPanelDrag);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopTrackerDesktopPanelDrag);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stopTrackerDesktopPanelDrag);
    };
  }, []);

  function startTrackerDesktopPanelDrag(clientX: number) {
    trackerDesktopDragRef.current = {
      startX: clientX,
      startWidth: trackerDesktopPanelWidth,
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  const trackerDesktopResizeHandleProps = {
    onMouseDown(event: MouseEvent) {
      event.preventDefault();
      startTrackerDesktopPanelDrag(event.clientX);
    },
    onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      startTrackerDesktopPanelDrag(touch.clientX);
    },
    onDoubleClick() {
      setTrackerDesktopPanelWidth(defaultTrackerDesktopPanelWidth());
    },
  };

  return {
    trackerDesktopSplitRef,
    trackerDesktopPanelWidth,
    trackerDesktopResizeHandleProps,
  } as const;
}
