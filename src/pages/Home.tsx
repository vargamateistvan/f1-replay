import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bug,
  CalendarDays,
  ChevronsRight,
  CircleHelp,
  CloudSun,
  Coffee,
  Compass,
  Gauge,
  Keyboard,
  ListOrdered,
  MapPinned,
  MessagesSquare,
  Play,
  Settings as SettingsIcon,
  Share2,
  Star,
  Timer,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { AppLogo } from "@/components/AppLogo/AppLogo";
import { FOCUS_RING, buttonClass } from "@/components/Button/buttonClass";
import type { MainView } from "@/components/Nav";
import { OPENF1_SITE_URL } from "@/constants";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";
import { useReleaseDate } from "@/hooks/useReleaseDate";
import {
  appVersionLabel,
  formatReleaseDate,
  RELEASES_PAGE_URL,
} from "@/lib/appVersion";

const SUPPORT_URL = "https://buymeacoffee.com/matt_varga";
const REPO_URL = "https://github.com/vargamateistvan/f1-replay";
const ISSUES_URL = `${REPO_URL}/issues`;

interface Feature {
  id: string;
  title: string;
  text: string;
  tags: string[];
  icon: LucideIcon;
  path: string;
  view?: MainView;
}

const FEATURES: Feature[] = [
  {
    id: "tracker",
    title: "Driver Tracker",
    text: "Every car moving around the circuit, synced to the replay. Switch between the track map, the ring view that spaces cars by their time gaps, and an optional 3D map.",
    tags: ["Track map", "Ring view", "3D map", "Start lights"],
    icon: MapPinned,
    path: "/",
    view: "tracker",
  },
  {
    id: "leaderboard",
    title: "Live Timing",
    text: "A timing tower that follows the playhead: positions, intervals, mini-sectors, tyres and live telemetry for every driver.",
    tags: ["Intervals", "Mini-sectors", "Tyres"],
    icon: ListOrdered,
    path: "/",
    view: "leaderboard",
  },
  {
    id: "commentary",
    title: "Commentary Feeds",
    text: "Race control, team radio, pit stops with undercut verdicts, overtakes, key moments and weather. Jump to any of them in one click.",
    tags: ["Race control", "Team radio", "Pit stops"],
    icon: MessagesSquare,
    path: "/",
    view: "commentary",
  },
  {
    id: "telemetry",
    title: "Telemetry",
    text: "Put two laps side by side: speed, throttle, brake, gear and RPM, plus the time gained or lost in every corner.",
    tags: ["Lap compare", "Corner analysis"],
    icon: Activity,
    path: "/telemetry",
  },
  {
    id: "schedule",
    title: "Schedule",
    text: "The season calendar in your time or track time, a world map of every round, results and highlights for finished sessions.",
    tags: ["Calendar", "World map", "Results"],
    icon: CalendarDays,
    path: "/schedule",
  },
  {
    id: "standings",
    title: "Standings",
    text: "Driver and constructor championships, points progression, title maths, teammate head-to-heads and season profiles.",
    tags: ["Championship", "Head-to-heads", "Profiles"],
    icon: Trophy,
    path: "/standings",
  },
];

const EXTRAS: { icon: LucideIcon; text: string }[] = [
  { icon: Gauge, text: "Tyre strategy and degradation per stint" },
  { icon: Timer, text: "Gap and lap time charts" },
  { icon: ChevronsRight, text: "Catch-up summary when you skip ahead" },
  { icon: Share2, text: "Shareable links to any moment" },
  { icon: CloudSun, text: "Weather and track conditions" },
  { icon: Keyboard, text: "Keyboard shortcuts for playback" },
];

function SectionTitle({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <span className="text-caption font-black uppercase tracking-eyebrow text-f1red-fg">
        {eyebrow}
      </span>
      <h2 className="text-small font-black uppercase tracking-eyebrow text-fg">{children}</h2>
    </div>
  );
}

/**
 * Landing page (`/home`, opened from the nav logo): what F1 Replay can do,
 * links into every page, and a support call-to-action. Visiting `/` still
 * goes straight to the replay.
 */
export default function Home() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const openTour = useSettings((s) => s.openTour);
  const openHelp = useSettings((s) => s.openHelp);
  const openModal = useSettings((s) => s.openModal);
  const releaseDate = formatReleaseDate(useReleaseDate());

  // Keep the selected season/session when moving on, like the nav does.
  const href = (path: string, view?: MainView) => {
    const params = new URLSearchParams(searchParams);
    if (view) params.set("view", view);
    else params.delete("view");
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };
  const trackLink = (destination: string) => () =>
    trackEvent("home_link_clicked", { destination });
  const trackSupport = (target: string) => () =>
    trackEvent("home_support_clicked", { target });

  const startTour = () => {
    trackEvent("tour_started", { source: "home" });
    navigate(href("/", "tracker"));
    openTour();
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-track md:overflow-y-auto md:overscroll-contain px-3 py-4 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,_rgb(var(--color-f1red)/0.18),_transparent_65%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="overflow-hidden rounded-sm border border-panel bg-surface">
          <div className="flex h-7 items-center justify-between bg-f1red px-4 text-white">
            <span className="text-caption font-black uppercase tracking-spaced">F1 Replay</span>
            <span className="hidden font-mono text-caption uppercase tracking-wider sm:inline">
              Free · Unofficial · Open data
            </span>
          </div>
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-panel bg-track text-fg sm:h-28 sm:w-28">
              <AppLogo size={56} />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-black uppercase leading-none tracking-wider text-fg sm:text-5xl">
                F1<span className="mx-2 font-light text-f1red">|</span>Replay
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-fg/85 sm:text-base sm:leading-7">
                Scrub through any Formula 1 session like a replay video. The track map, live
                timing, race control, team radio and telemetry all stay in sync, from the
                first practice lap to the chequered flag.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={href("/", "tracker")}
                  onClick={trackLink("tracker_cta")}
                  className={buttonClass("primary")}
                >
                  <Play aria-hidden="true" className="h-3.5 w-3.5" />
                  Open Driver Tracker
                </Link>
                <Link
                  to={href("/schedule")}
                  onClick={trackLink("schedule_cta")}
                  className={buttonClass("secondary")}
                >
                  <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                  Browse schedule
                </Link>
                <button type="button" onClick={startTour} className={buttonClass("quiet", "md")}>
                  <Compass aria-hidden="true" className="h-3.5 w-3.5" />
                  Take the tour
                </button>
              </div>
            </div>
          </div>
        </header>

        <section aria-labelledby="home-features">
          <SectionTitle eyebrow="01">
            <span id="home-features">Features</span>
          </SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ id, title, text, tags, icon: FeatureIcon, path, view }) => (
              <li key={id} className="flex">
                <Link
                  to={href(path, view)}
                  onClick={trackLink(id)}
                  className={`group flex w-full flex-col rounded-sm border border-panel bg-surface p-4 transition-colors hover:border-f1red ${FOCUS_RING}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-f1red text-white">
                      <FeatureIcon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-black uppercase tracking-wider text-fg">
                      {title}
                    </h3>
                  </div>
                  <p className="mt-3 flex-1 text-body leading-5 text-muted">{text}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-sm border border-panel px-1.5 py-0.5 text-tiny font-bold uppercase tracking-wider text-fg/70"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-caption font-bold uppercase tracking-caps text-f1red-fg">
                    Open
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="home-extras">
          <SectionTitle eyebrow="02">
            <span id="home-extras">Also inside</span>
          </SectionTitle>
          <ul className="grid gap-px overflow-hidden rounded-sm border border-panel bg-panel sm:grid-cols-2 lg:grid-cols-3">
            {EXTRAS.map(({ icon: ExtraIcon, text }) => (
              <li key={text} className="flex items-center gap-3 bg-surface px-4 py-3">
                <ExtraIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-f1red-fg" />
                <span className="text-body text-fg/85">{text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                trackEvent("nav_help_opened", { source: "home" });
                openHelp();
              }}
              className={buttonClass("quiet", "sm", "h-8")}
            >
              <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
              How it works
            </button>
            <button
              type="button"
              onClick={() => {
                trackEvent("nav_settings_opened", { source: "home" });
                openModal();
              }}
              className={buttonClass("quiet", "sm", "h-8")}
            >
              <SettingsIcon aria-hidden="true" className="h-3.5 w-3.5" />
              Settings
            </button>
          </div>
        </section>

        <section
          aria-labelledby="home-support"
          className="rounded-sm border border-f1red/40 border-l-4 border-l-f1red bg-f1red/10 p-5 sm:p-6"
        >
          <p className="flex items-center gap-2 text-caption font-bold uppercase tracking-eyebrow text-f1red-fg">
            <Coffee aria-hidden="true" className="h-3.5 w-3.5" />
            Support the app
          </p>
          <h2 id="home-support" className="mt-2 text-xl font-black uppercase tracking-wider text-fg">
            Keep F1 Replay on track
          </h2>
          <p className="mt-2 max-w-3xl text-body leading-6 text-fg/90">
            F1 Replay is free, ad-free and built in spare time. Support pays for hosting
            and the data cache that keeps replays fast, and helps bring live sessions to the
            app. Every coffee makes a difference.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackSupport("coffee")}
              className={buttonClass("primary")}
            >
              <Coffee aria-hidden="true" className="h-3.5 w-3.5" />
              Buy me a coffee
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackSupport("github_star")}
              className={buttonClass("secondary")}
            >
              <Star aria-hidden="true" className="h-3.5 w-3.5" />
              Star on GitHub
            </a>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackSupport("issues")}
              className={buttonClass("quiet", "md")}
            >
              <Bug aria-hidden="true" className="h-3.5 w-3.5" />
              Report an issue
            </a>
          </div>
        </section>

        <footer
          aria-labelledby="home-about"
          className="border-t border-panel pt-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="home-about"
                className="text-caption font-black uppercase tracking-eyebrow text-f1red-fg"
              >
                About F1 Replay
              </h2>
              <p className="mt-1 text-small leading-5 text-muted">
                Independent, unofficial and not affiliated with Formula One.
              </p>
            </div>
            <a
              href={RELEASES_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("secondary", "sm")}
            >
              Release notes
            </a>
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-2 border-y border-panel py-3 text-small sm:grid-cols-3">
            <div>
              <dt className="text-tiny font-bold uppercase tracking-widest text-muted">
                Version
              </dt>
              <dd className="mt-0.5 font-mono text-fg">{appVersionLabel}</dd>
            </div>
            <div>
              <dt className="text-tiny font-bold uppercase tracking-widest text-muted">
                Released
              </dt>
              <dd className="mt-0.5 font-mono text-fg">{releaseDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-tiny font-bold uppercase tracking-widest text-muted">
                Data
              </dt>
              <dd className="mt-0.5">
                <a
                  href={OPENF1_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-f1red/85 transition-colors hover:text-f1red"
                >
                  OpenF1 API
                </a>
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
            <a
              href="/.well-known/security.txt"
              className="text-f1red/85 transition-colors hover:text-f1red"
            >
              Security
            </a>
            <Link
              to="/terms"
              className="text-f1red/85 transition-colors hover:text-f1red"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-f1red/85 transition-colors hover:text-f1red"
            >
              Privacy Policy
            </Link>
          </div>
        </footer>
      </div>
    </section>
  );
}
