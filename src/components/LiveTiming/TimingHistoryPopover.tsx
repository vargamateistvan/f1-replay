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
import {
  TIMING_HISTORY_CLOSE_DELAY_MS,
  TIMING_HISTORY_VIEWPORT_PAD,
} from "@/constants";

export function TimingHistoryPopover({
  enabled,
  title,
  identity,
  triggerLabel,
  dialogLabel,
  closeLabel,
  onActivate,
  content,
  alignStart = false,
  children,
}: {
  enabled: boolean;
  title: string;
  identity: string;
  triggerLabel: string;
  dialogLabel: string;
  closeLabel: string;
  onActivate?: () => void;
  content: ReactNode;
  alignStart?: boolean;
  children: ReactNode;
}) {
  const [requestedOpen, setOpen] = useState(false);
  const open = enabled && requestedOpen;
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const panelId = useId();

  function cancelClose() {
    clearTimeout(closeTimer.current);
  }

  function show() {
    cancelClose();
    setOpen(true);
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), TIMING_HISTORY_CLOSE_DELAY_MS);
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
      const pad = TIMING_HISTORY_VIEWPORT_PAD;
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
  }, [open, content]);

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

  if (!enabled) return <>{children}</>;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={(event) => handleBlur(event.relatedTarget)}
        onClick={(event) => {
          event.stopPropagation();
          onActivate?.();
          show();
        }}
        className={`flex w-full items-center rounded-sm hover:bg-fg/5 ${alignStart ? "justify-start text-left" : "justify-center"}`}
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={dialogLabel}
          style={position}
          className="fixed z-popover w-[min(420px,92vw)] overflow-hidden rounded-sm border border-panel bg-surface text-left shadow-2xl"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocusCapture={cancelClose}
          onBlurCapture={(event) => handleBlur(event.relatedTarget)}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex h-6 items-center justify-between gap-2 bg-f1red px-2 text-white">
            <span className="text-tiny font-black uppercase tracking-caps">
              {title}
            </span>
            <span className="ml-auto font-mono text-tiny uppercase tracking-wider">
              {identity}
            </span>
            <button
              type="button"
              onClick={() => {
                anchorRef.current?.focus();
                setOpen(false);
              }}
              aria-label={closeLabel}
              className="flex h-5 w-5 shrink-0 items-center justify-center border border-white/30 transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          <div className="max-h-[min(24rem,60dvh)] overflow-y-auto overscroll-contain pt-2">
            {content}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
