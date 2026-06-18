import { useEffect, useRef, type MouseEvent } from "react";
import { useSettings } from "@/stores/settings";

export function HowItWorksModal() {
  const { isHelpOpen, closeHelp } = useSettings();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHelpOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeHelp();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isHelpOpen, closeHelp]);

  if (!isHelpOpen) return null;

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) closeHelp();
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl mx-4 max-h-[90dvh] flex flex-col bg-[#1a1a24] border border-[#2a2a35] rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2a2a35] shrink-0">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-f1red"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span className="text-[13px] font-bold text-white tracking-wide">
              How It Works
            </span>
          </div>
          <button
            onClick={closeHelp}
            aria-label="Close help"
            className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-white hover:bg-[#2a2a35] transition-colors text-base"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="space-y-6 pt-4 text-white/80">
            {/* Getting Started */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                🏁 Getting Started
              </h3>
              <p className="text-[12px] leading-relaxed mb-3">
                Select a circuit and session (Free Practice, Qualifying, or
                Race) from the top navigation. The app will load real-time F1
                data from the OpenF1 API.
              </p>
            </section>

            {/* Playback */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                ▶️ Playback & Navigation
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">Play/Pause:</strong> Toggle
                  playback with the button or spacebar
                </li>
                <li>
                  <strong className="text-white">Scrub Timeline:</strong> Click
                  or drag the playback bar to jump to any time
                </li>
                <li>
                  <strong className="text-white">Speed Control:</strong> Adjust
                  playback speed (0.5×, 1×, 2×, 4×, 8×)
                </li>
                <li>
                  <strong className="text-white">Keyboard:</strong> Arrow keys
                  frame-step, Space toggles play
                </li>
              </ul>
            </section>

            {/* Telemetry */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                📊 Telemetry & Performance
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">Telemetry Metrics:</strong>{" "}
                  View high-frequency speed, throttle, brake, RPM, gear, DRS,
                  and brake temperature data
                </li>
                <li>
                  <strong className="text-white">
                    Multi-Driver Comparison:
                  </strong>{" "}
                  Select one or more drivers to compare side-by-side telemetry
                  traces
                </li>
                <li>
                  <strong className="text-white">Tire Data:</strong> Monitor
                  tire surface temperatures and compound wear progression during
                  stints
                </li>
                <li>
                  <strong className="text-white">Focused Overlay:</strong> Use
                  the focused telemetry view for full-screen, high-resolution
                  analysis
                </li>
                <li>
                  <strong className="text-white">Hover Details:</strong> Inspect
                  exact values at any point in time with precision tooltips
                </li>
              </ul>
            </section>

            {/* Strategy */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                🏎️ Tire Strategy & Race Events
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">Strategy Timeline:</strong>{" "}
                  Visualize pit stops, tire compound changes, stint lengths, and
                  tire age tracking
                </li>
                <li>
                  <strong className="text-white">Tire Compounds:</strong>{" "}
                  Color-coded compound visualization (soft, medium, hard,
                  intermediate, wet) for all stints
                </li>
                <li>
                  <strong className="text-white">Pit Analysis:</strong> Exact
                  pit timings and strategy call sequences per driver
                </li>
                <li>
                  <strong className="text-white">Overtakes Tab:</strong>{" "}
                  Complete list of overtakes with tactical context
                </li>
                <li>
                  <strong className="text-white">Live Timing:</strong> Current
                  position, gaps, intervals, pit status, and active in-pit tags
                </li>
                <li>
                  <strong className="text-white">Team Radio:</strong> Driver
                  communications synced to playback, with direct in-toast audio
                  playback when recordings are available
                </li>
                <li>
                  <strong className="text-white">Race Control:</strong> Flags,
                  SC/VSC, incidents, and official messages
                </li>
              </ul>
            </section>

            {/* Track Info */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                🏁 Track Information
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">Circuit Layout:</strong> Visual
                  track map with turn names, DRS zones, and sector divisions
                </li>
                <li>
                  <strong className="text-white">Sector Performance:</strong>{" "}
                  Real-time sector times and speed trap data for comparison
                </li>
                <li>
                  <strong className="text-white">Driver Focus:</strong> Click a
                  driver in timing or on-map to focus the camera and follow that
                  car around the circuit
                </li>
                <li>
                  <strong className="text-white">Driver Heatmap:</strong> Focus
                  mode can overlay lap-based speed heatmap colors on the track
                  map for quick pace reads
                </li>
                <li>
                  <strong className="text-white">Circuit Details:</strong> Track
                  name, length, total lap count, and key characteristics when
                  available
                </li>
                <li>
                  <strong className="text-white">Track Status:</strong> Live
                  weather, flags, and track condition updates
                </li>
              </ul>
            </section>

            {/* Views */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                👁️ Main Views
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">Leaderboard:</strong> Grid view
                  of race standings with gaps and intervals
                </li>
                <li>
                  <strong className="text-white">Driver Tracker:</strong>{" "}
                  Immersive replay with track map, tire strategy, telemetry,
                  radio, and timing data with focused driver telemetry parity
                </li>
                <li>
                  <strong className="text-white">Commentary:</strong> Event
                  feeds (radio, race control, overtakes, weather)
                </li>
              </ul>
            </section>

            {/* Architecture */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                🧠 How It Works Under The Hood
              </h3>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">Shared Timeline:</strong> A
                  single session clock drives map, timing, telemetry, toasts,
                  and event feeds.
                </li>
                <li>
                  <strong className="text-white">Smart Caching:</strong> API
                  responses are persisted with TanStack Query, so switching tabs
                  and revisiting sessions stays fast.
                </li>
                <li>
                  <strong className="text-white">Derived Event Layers:</strong>
                  Timeline helpers transform raw API rows into markers, toasts,
                  chapters, and track-state overlays.
                </li>
                <li>
                  <strong className="text-white">Map Interpolation:</strong>
                  Car positions are interpolated at the current playhead time,
                  then rendered on SVG geometry for smooth replay motion.
                </li>
                <li>
                  <strong className="text-white">Live Settings:</strong>
                  Overlay and notification toggles update the UI immediately
                  without reloading session data.
                </li>
              </ul>
            </section>

            {/* Settings */}
            <section>
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                ⚙️ Settings
              </h3>
              <p className="text-[12px] leading-relaxed mb-2">
                Customize your experience:
              </p>
              <ul className="text-[12px] leading-relaxed space-y-1.5 ml-3">
                <li>
                  <strong className="text-white">Notifications:</strong>{" "}
                  Enable/disable event toasts (radio, flags, overtakes, pits,
                  fastest laps)
                </li>
                <li>
                  <strong className="text-white">Track Map:</strong> Show/hide
                  focused HUD, leaderboard, tyre badges, battle rings, sector
                  flags, and heatmap overlays
                </li>
                <li>
                  <strong className="text-white">Playback Speed:</strong> Set
                  default speed and enable speed controls
                </li>
                <li>
                  <strong className="text-white">Resilience:</strong> Friendly
                  error pages handle route and runtime failures without breaking
                  the app shell
                </li>
              </ul>
            </section>

            {/* Keyboard Shortcuts */}
            <section className="pb-2">
              <h3 className="text-[13px] font-bold text-white uppercase tracking-widest mb-2">
                ⌨️ Keyboard Shortcuts
              </h3>
              <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                <div>
                  <div className="text-f1red font-mono">Space</div>
                  <div className="text-[10px]">Play/Pause</div>
                </div>
                <div>
                  <div className="text-f1red font-mono">← →</div>
                  <div className="text-[10px]">Scrub ±5s</div>
                </div>
                <div>
                  <div className="text-f1red font-mono">↑ ↓</div>
                  <div className="text-[10px]">Speed up/down</div>
                </div>
                <div>
                  <div className="text-f1red font-mono">[ ]</div>
                  <div className="text-[10px]">Prev/next lap</div>
                </div>
                <div>
                  <div className="text-f1red font-mono">J K</div>
                  <div className="text-[10px]">Prev/next key moment</div>
                </div>
                <div>
                  <div className="text-f1red font-mono">1 2 3</div>
                  <div className="text-[10px]">Switch main view</div>
                </div>
                <div>
                  <div className="text-f1red font-mono">Home End</div>
                  <div className="text-[10px]">Jump start/end</div>
                </div>
                <div>
                  <div className="text-f1red font-mono">? / H</div>
                  <div className="text-[10px]">Open this help</div>
                </div>
                <div>
                  <div className="text-f1red font-mono">Esc</div>
                  <div className="text-[10px]">Close modal</div>
                </div>
              </div>
            </section>

            <hr className="border-[#2a2a35] my-2" />

            <p className="text-[11px] text-muted leading-relaxed pb-2">
              <strong>Tip:</strong> All data is from the public{" "}
              <a
                href="https://api.openf1.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-f1red hover:underline"
              >
                OpenF1 API
              </a>
              . No account required!
            </p>

            <p className="text-[11px] text-muted leading-relaxed pb-2">
              Found a bug or have feedback?{" "}
              <a
                href="https://github.com/vargamateistvan/f1-replay/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-f1red hover:underline"
              >
                Report an issue
              </a>
              .
            </p>

            <p className="text-[11px] text-muted leading-relaxed pb-2">
              Author:{" "}
              <a
                href="https://github.com/vargamateistvan"
                target="_blank"
                rel="noopener noreferrer"
                className="text-f1red hover:underline"
              >
                github.com/vargamateistvan
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
