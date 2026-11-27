import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Driver, Pit, Stint } from "@/api/types";
import {
  PIT_HISTORY_CLOSE_DELAY_MS,
  PIT_HISTORY_VIEWPORT_PAD,
} from "@/constants";
import { PitFeed } from "@/components/Pits/PitFeed";

export function DriverPitHistory({
  driver,
  driverNumber,
  pits,
  stints,
  sessionTimeMs,
  sessionStartMs,
  label,
  children,
}: {
  driver?: Driver;
  driverNumber: number;
  pits: Pit[];
  stints: Stint[];
  sessionTimeMs: number;
  sessionStartMs: number;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const panelId = useId();
  const driverLabel = driver?.name_acronym ?? String(driverNumber);

  function cancelClose() {
    clearTimeout(closeTimer.current);
  }

  function show() {
    cancelClose();
    setOpen(true);
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), PIT_HISTORY_CLOSE_DELAY_MS);
  }

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const pad = PIT_HISTORY_VIEWPORT_PAD;
      const top = rect.bottom + height <= window.innerHeight - pad
        ? rect.bottom
        : Math.max(pad, rect.top - height);
      setPosition({
        top,
        left: Math.max(pad, Math.min(rect.right - width, window.innerWidth - width - pad)),
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, pits, sessionTimeMs]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        anchorRef.current?.focus();
        setOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !anchorRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function handleBlur(target: EventTarget | null) {
    if (
      !(target instanceof Node) ||
      (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target))
    ) {
      scheduleClose();
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={`${label} for ${driverLabel}: show pit stops`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={(event) => handleBlur(event.relatedTarget)}
        onClick={(event) => {
          event.stopPropagation();
          show();
        }}
        className="flex w-full items-center justify-center rounded-sm hover:bg-fg/5"
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`Pit stops for ${driverLabel}`}
          style={position}
          className="fixed z-popover w-[min(420px,92vw)] overflow-hidden rounded-sm border border-panel bg-surface text-left shadow-2xl"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocusCapture={cancelClose}
          onBlurCapture={(event) => handleBlur(event.relatedTarget)}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 bg-f1red px-4 py-1 text-white sm:px-5">
            <span className="text-caption font-black uppercase tracking-spaced">
              Pit stops
            </span>
            <span className="ml-auto font-mono text-caption uppercase tracking-wider">
              {driverLabel}
            </span>
            <button
              type="button"
              onClick={() => {
                anchorRef.current?.focus();
                setOpen(false);
              }}
              aria-label="Close pit stops"
              className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/30 transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[min(24rem,60dvh)] overflow-y-auto overscroll-contain pt-2">
            <PitFeed
              entries={pits.filter((pit) => pit.driver_number === driverNumber)}
              stints={stints}
              drivers={driver ? [driver] : []}
              sessionTimeMs={sessionTimeMs}
              sessionStartMs={sessionStartMs}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
