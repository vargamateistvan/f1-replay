import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useSettings } from "@/stores/settings";
import { trackEvent } from "@/lib/analytics";
import { DialogHeader } from "@/components/DialogHeader";
import {
  animateMotion,
  modalBackdropMotion,
  modalPanelMotion,
  pressMotion,
  motionEnabled,
} from "@/lib/motion";

interface Item {
  term: string;
  text: ReactNode;
  /** Colour swatch instead of the red bullet (timing colours, flags). */
  swatch?: string;
  termColor?: string;
}

interface Section {
  id: string;
  title: string;
  intro?: string;
  items?: Item[];
}

const SECTIONS: Section[] = [
  {
    id: "playback",
    title: "Playback & Navigation",
    items: [
      { term: "Play/Pause", text: "Toggle playback with the button or spacebar" },
      {
        term: "Scrub Timeline",
        text: "Click or drag the playback bar to jump to any time",
      },
      {
        term: "Speed Control",
        text: "Adjust playback speed (1×, 2×, 4×, 8×, 16×)",
      },
      { term: "Keyboard", text: "Arrow keys frame-step, Space toggles play" },
    ],
  },
  {
    id: "telemetry",
    title: "Telemetry & Performance",
    items: [
      {
        term: "Telemetry Metrics",
        text: "View high-frequency speed, throttle, brake, RPM, gear, DRS, and brake temperature data",
      },
      {
        term: "Multi-Driver Comparison",
        text: "Select one or more drivers to compare side-by-side telemetry traces",
      },
      {
        term: "Tire Data",
        text: "Monitor tire surface temperatures and compound wear progression during stints",
      },
      {
        term: "Focused Overlay",
        text: "Use the focused telemetry view for full-screen, high-resolution analysis",
      },
      {
        term: "Hover Details",
        text: "Inspect exact values at any point in time with precision tooltips",
      },
    ],
  },
  {
    id: "strategy",
    title: "Tire Strategy & Race Events",
    items: [
      {
        term: "Strategy Timeline",
        text: "Visualize pit stops, tire compound changes, stint lengths, and tire age tracking",
      },
      {
        term: "Tire Compounds",
        text: "Color-coded compound visualization (soft, medium, hard, intermediate, wet) for all stints",
      },
      {
        term: "Pit Analysis",
        text: "Exact pit timings and strategy call sequences per driver",
      },
      {
        term: "Overtakes Tab",
        text: "Complete list of overtakes with tactical context",
      },
      {
        term: "Live Timing",
        text: "Current position, gaps, intervals, pit status, and active in-pit tags",
      },
      {
        term: "Team Radio",
        text: "Driver communications synced to playback, with direct in-toast audio playback when recordings are available",
      },
      {
        term: "Race Control",
        text: "Flags, SC/VSC, incidents, and official messages",
      },
    ],
  },
  {
    id: "track",
    title: "Track Information",
    items: [
      {
        term: "Circuit Layout",
        text: "Visual track map with turn names, DRS zones, and sector divisions",
      },
      {
        term: "Sector Performance",
        text: "Real-time sector times and speed trap data for comparison",
      },
      {
        term: "Driver Focus",
        text: "Click a driver in timing or on-map to focus the camera and follow that car around the circuit",
      },
      {
        term: "Driver Heatmap",
        text: "Focus mode can overlay lap-based speed heatmap colors on the track map for quick pace reads",
      },
      {
        term: "Circuit Details",
        text: "Track name, length, total lap count, and key characteristics when available",
      },
      {
        term: "Track Status",
        text: "Live weather, flags, and track condition updates",
      },
    ],
  },
  {
    id: "map3d",
    title: "3D Track Map",
    intro:
      "Switch the track map to 3D with its 3D button (or in Settings → Track map). Needs WebGL2; available for circuits with mapped geometry.",
    items: [
      {
        term: "Real Circuit",
        text: "Full-width asphalt, kerbs, pit lane and start grid on a real map, with flags painted on the track",
      },
      {
        term: "Light & Weather",
        text: "Lighting follows the sun at the circuit (night races are night); rain brings a wet track and haze",
      },
      {
        term: "Cameras",
        text: "The camera button cycles follow, chase (behind the car), onboard (T-cam) and orbit; close-up cameras show a minimap of the whole field",
      },
      {
        term: "TV Mode",
        text: "In races, an auto-director cuts between overtakes, pit stops, the closest battle and the leader. Click any car to take over",
      },
      {
        term: "Take the Camera",
        text: "Drag, rotate or tilt to look around; Resume follow picks the car back up",
      },
      {
        term: "Share a View",
        text: "The URL keeps the time, focused driver and camera mode",
      },
    ],
  },
  {
    id: "colours",
    title: "Timing Colours",
    items: [
      {
        term: "Purple",
        swatch: "#9b59f5",
        termColor: "#b982ff",
        text: "The absolute fastest time recorded by any driver in that specific sector or lap during the current session.",
      },
      {
        term: "Green",
        swatch: "#39b54a",
        termColor: "#39d743",
        text: "A personal best time for that specific driver in that sector or lap during the session, but not fast enough to beat the overall session leader.",
      },
      {
        term: "Yellow",
        swatch: "#f5d400",
        termColor: "#f5d400",
        text: "A time that is slower than that specific driver's personal best for that sector or lap.",
      },
    ],
  },
  {
    id: "flags",
    title: "Track Flags & Status",
    items: [
      {
        term: "Green flag",
        swatch: "#00c851",
        termColor: "#00c851",
        text: "Track is clear and racing can continue normally.",
      },
      {
        term: "Yellow flag",
        swatch: "#f5d400",
        termColor: "#f5d400",
        text: "Hazard on track; slow down and no overtaking in the affected sector.",
      },
      {
        term: "Double yellow flags",
        swatch: "#f5d400",
        termColor: "#f5d400",
        text: "Major hazard; be prepared to stop and no overtaking.",
      },
      {
        term: "Red flag",
        swatch: "#e8002d",
        termColor: "#e8002d",
        text: "Session is stopped because conditions are unsafe.",
      },
      {
        term: "Safety Car (SC)",
        swatch: "#f5a623",
        termColor: "#f5a623",
        text: "The safety car is deployed and the field must follow it at a controlled speed.",
      },
      {
        term: "Virtual Safety Car (VSC)",
        swatch: "#f5a623",
        termColor: "#f5a623",
        text: "Drivers must follow a regulated delta time without a physical safety car on track.",
      },
      {
        term: "Chequered flag",
        swatch: "#ffffff",
        text: "Session or race is complete.",
      },
      {
        term: "Black and white flag",
        swatch: "#aaaaaa",
        termColor: "#aaaaaa",
        text: "Official warning for unsportsmanlike conduct or a rule violation.",
      },
      {
        term: "Lights out",
        swatch: "#00c851",
        termColor: "#00c851",
        text: "The race has started.",
      },
    ],
  },
  {
    id: "views",
    title: "Main Views",
    items: [
      {
        term: "Leaderboard",
        text: "Grid view of race standings with gaps and intervals",
      },
      {
        term: "Driver Tracker",
        text: "Immersive replay with track map, tire strategy, telemetry, radio, and timing data with focused driver telemetry parity",
      },
      {
        term: "Commentary",
        text: "Event feeds (radio, race control, overtakes, weather)",
      },
      {
        term: "Final Results",
        text: "Open the Final Classification dialog with podium cards and complete race result table after sessions finish",
      },
    ],
  },
  {
    id: "internals",
    title: "Under The Hood",
    items: [
      {
        term: "Shared Timeline",
        text: "A single session clock drives map, timing, telemetry, toasts, and event feeds.",
      },
      {
        term: "Smart Caching",
        text: "API responses are persisted with TanStack Query, so switching tabs and revisiting sessions stays fast.",
      },
      {
        term: "Derived Event Layers",
        text: "Timeline helpers transform raw API rows into markers, toasts, chapters, and track-state overlays.",
      },
      {
        term: "Map Interpolation",
        text: "Car positions are interpolated at the current playhead time, then rendered on SVG geometry for smooth replay motion.",
      },
      {
        term: "Live Settings",
        text: "Overlay and notification toggles update the UI immediately without reloading session data.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    intro: "Customize your experience:",
    items: [
      {
        term: "Notifications",
        text: "Enable/disable event toasts (radio, flags, overtakes, pits, fastest laps)",
      },
      {
        term: "Track Map",
        text: "Show/hide focused HUD, leaderboard, tyre badges, battle rings, sector flags, and heatmap overlays",
      },
      {
        term: "3D Map",
        text: "2D or 3D view, flag colours on track, sector ribbon, weather effects, session-time lighting, buildings, car models and terrain",
      },
      {
        term: "Playback Speed",
        text: "Set default speed and enable speed controls",
      },
      {
        term: "Resilience",
        text: "Friendly error pages handle route and runtime failures without breaking the app shell",
      },
    ],
  },
  { id: "shortcuts", title: "Keyboard Shortcuts" },
];

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["Space"], label: "Play/Pause" },
  { keys: ["←", "→"], label: "Scrub ±5s" },
  { keys: ["↑", "↓"], label: "Speed up/down" },
  { keys: ["[", "]"], label: "Prev/next lap" },
  { keys: ["J", "K"], label: "Prev/next key moment" },
  { keys: ["1", "2", "3"], label: "Switch main view" },
  { keys: ["Home", "End"], label: "Jump start/end" },
  { keys: ["?", "H"], label: "Open this help" },
  { keys: ["Esc"], label: "Close modal" },
];

const SECTION_TITLE =
  "flex items-baseline gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-white";
const SECTION_INDEX = "font-mono text-[10px] font-bold text-f1red";
const BODY_TEXT = "text-[13px] leading-6 text-white/80";

function sectionNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function ItemList({ items }: { items: Item[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map(({ term, text, swatch, termColor }) => (
        <li key={term} className={`flex items-start gap-2.5 ${BODY_TEXT}`}>
          {swatch ? (
            <span
              aria-hidden="true"
              className="mt-[7px] h-2.5 w-2.5 shrink-0"
              style={{
                backgroundColor: swatch,
                boxShadow: "inset 0 0 0 1px rgba(128,128,128,0.45)",
              }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="mt-[9px] h-1.5 w-1.5 shrink-0 bg-f1red"
            />
          )}
          <span>
            <strong
              className={termColor ? "font-bold" : "font-bold text-white"}
              style={termColor ? { color: termColor } : undefined}
            >
              {term}
            </strong>
            <span className="text-muted"> — </span>
            {text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HowItWorksModal() {
  const { isHelpOpen, closeHelp, openTour } = useSettings();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const idPrefix = useId();

  const closeWithReason = useCallback(
    (reason: "escape" | "backdrop" | "button") => {
      trackEvent("help_modal_closed", { reason });
      closeHelp();
    },
    [closeHelp],
  );

  useEffect(() => {
    if (isHelpOpen) {
      trackEvent("help_modal_opened");
    }
  }, [isHelpOpen]);

  useEffect(() => {
    if (!isHelpOpen || !motionEnabled()) return;
    const backdropAnimation = animateMotion(
      backdropRef.current,
      modalBackdropMotion(),
    );
    const panelAnimation = animateMotion(panelRef.current, modalPanelMotion());

    return () => {
      backdropAnimation?.revert();
      panelAnimation?.revert();
    };
  }, [isHelpOpen]);

  useEffect(() => {
    if (!isHelpOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeWithReason("escape");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHelpOpen, closeWithReason]);

  if (!isHelpOpen) return null;

  // The tour lives on the replay page; from elsewhere, go there with the same session.
  function startTour() {
    trackEvent("tour_started", { source: "help" });
    closeHelp();
    if (pathname !== "/") navigate(`/${search}`);
    openTour();
  }

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) closeWithReason("backdrop");
  }

  const sectionId = (id: string) => `${idPrefix}-${id}`;

  function jumpTo(id: string) {
    document.getElementById(sectionId(id))?.scrollIntoView?.({
      behavior: motionEnabled() ? "smooth" : "auto",
      block: "start",
    });
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative mx-4 flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden border border-panel bg-surface shadow-2xl"
      >
        <DialogHeader
          eyebrow="Guide"
          meta="Data · OpenF1"
          title="How It Works"
          titleId={titleId}
          subtitle="Scrub through any F1 session like a replay"
          closeLabel="Close help"
          onClose={() => closeWithReason("button")}
        />

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Guide sections"
            className="hidden w-48 shrink-0 overflow-y-auto overscroll-contain border-r border-panel py-4 md:block"
          >
            <ol>
              {SECTIONS.map((section, index) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(section.id)}
                    className="flex w-full items-baseline gap-2 border-l-2 border-transparent px-4 py-1.5 text-left text-[10px] font-black uppercase tracking-[0.12em] text-muted transition-colors hover:border-f1red hover:bg-panel/40 hover:text-white focus:outline-none focus-visible:border-f1red focus-visible:text-white"
                  >
                    <span className="font-mono text-[9px] text-muted/60">
                      {sectionNumber(index)}
                    </span>
                    <span>{section.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <section className="my-4 border border-panel bg-track p-4">
              <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                Getting Started
              </h3>
              <p className={`mt-2 ${BODY_TEXT}`}>
                Select a circuit and session (Free Practice, Qualifying, or
                Race) from the top navigation. The app will load real-time F1
                data from the OpenF1 API.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  animateMotion(e.currentTarget, pressMotion());
                  startTour();
                }}
                className="mt-3 bg-f1red px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-600"
              >
                Take the tour
              </button>
            </section>

            <div className="divide-y divide-panel border-y border-panel">
              {SECTIONS.map((section, index) => (
                <section
                  key={section.id}
                  id={sectionId(section.id)}
                  className="scroll-mt-2 py-4"
                >
                  <h3 className={SECTION_TITLE}>
                    <span className={SECTION_INDEX}>{sectionNumber(index)}</span>
                    {section.title}
                  </h3>
                  {section.intro && (
                    <p className={`mt-2 ${BODY_TEXT}`}>{section.intro}</p>
                  )}
                  {section.items && <ItemList items={section.items} />}
                  {section.id === "shortcuts" && (
                    <dl className="mt-3 grid grid-cols-2 gap-px border border-panel bg-panel sm:grid-cols-3">
                      {SHORTCUTS.map(({ keys, label }) => (
                        <div
                          key={label}
                          className="flex flex-col gap-1.5 bg-surface px-3 py-2.5"
                        >
                          <dt className="flex flex-wrap gap-1">
                            {keys.map((key) => (
                              <kbd
                                key={key}
                                className="min-w-6 border border-panel bg-track px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-white"
                              >
                                {key}
                              </kbd>
                            ))}
                          </dt>
                          <dd className="text-[11px] text-muted">{label}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              ))}
            </div>

            <footer className="space-y-4 py-5">
              <p className="text-[11px] leading-5 text-muted">
                All data is from the public{" "}
                <a
                  href="https://api.openf1.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-f1red/85 transition-colors hover:text-f1red"
                >
                  OpenF1 API
                </a>
                . No account required! Built by{" "}
                <a
                  href="https://github.com/vargamateistvan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-white/80 transition-colors hover:text-f1red"
                >
                  github.com/vargamateistvan
                </a>
                .
              </p>
              <div className="flex flex-wrap items-center gap-2 border-t border-panel pt-4">
                <a
                  href="https://github.com/vargamateistvan/f1-replay/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 border border-panel px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:border-f1red hover:text-f1red"
                >
                  Report an issue
                  <ExternalLink size={10} aria-hidden="true" />
                </a>
                <a
                  href="https://buymeacoffee.com/matt_varga"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Enjoying the project? Support development with a slice."
                  className="inline-flex items-center gap-1.5 bg-f1red px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-600"
                >
                  <span aria-hidden="true">🍕</span>
                  Buy me a pizza
                </a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
