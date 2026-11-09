import { useEffect, useState } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Ellipsis, Flag, Radio, Trophy } from "lucide-react";
import { useStringParam } from "@/hooks/useSearchParamState";
import { useSettings } from "@/stores/settings";
import { TOUR_TARGET } from "@/components/AppTour/targets";
import type { MainView } from "@/components/Nav";
import { trackEvent } from "@/lib/analytics";
import { HOME_PATH } from "@/utils/url";

const VALID_VIEWS = new Set<MainView>(["leaderboard", "tracker", "commentary"]);

export function MobileNav() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const openHelp = useSettings((s) => s.openHelp);
  const [view, setView] = useStringParam<MainView>("view", "tracker");
  const [showMore, setShowMore] = useState(false);
  const currentView: MainView = VALID_VIEWS.has(view as MainView)
    ? (view as MainView)
    : "tracker";
  const isMain = location.pathname === "/";

  useEffect(() => {
    if (!isMain) return;
    if (VALID_VIEWS.has(view as MainView)) return;
    setView("tracker");
  }, [isMain, setView, view]);

  useEffect(() => {
    if (!isMain || typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (currentView !== "leaderboard") return;
    setView("tracker");
  }, [currentView, isMain, setView]);

  function viewHref(id: MainView) {
    const params = new URLSearchParams(searchParams);
    params.set("view", id);
    return `/?${params}`;
  }

  function hrefWithSearch(path: string) {
    const query = searchParams.toString();
    return query ? `${path}?${query}` : path;
  }

  const navButton = (active: boolean) =>
    `group flex min-w-0 flex-col items-center justify-center gap-1 px-0.5 py-1 text-tiny font-bold uppercase tracking-wider transition-colors ${
      active ? "text-f1red-fg" : "text-muted hover:text-fg"
    }`;

  const navIcon = (active: boolean) =>
    `flex h-7 w-10 items-center justify-center rounded-sm transition-colors ${
      active
        ? "bg-f1red/10 text-f1red-fg"
        : "text-muted group-hover:bg-panel group-hover:text-fg"
    }`;

  const isReplayActive = isMain && currentView === "tracker";
  const isFeedsActive = isMain && currentView === "commentary";
  const isStandingsActive = location.pathname.startsWith("/standings");
  const isScheduleActive = location.pathname === "/schedule";
  const isMoreActive =
    showMore ||
    location.pathname === HOME_PATH ||
    location.pathname === "/telemetry" ||
    location.pathname === "/settings" ||
    location.pathname === "/privacy" ||
    location.pathname === "/terms";

  function goTo(url: string) {
    setShowMore(false);
    trackEvent("mobile_nav_navigate", { destination: url });
    navigate(url);
  }

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-30 flex flex-col border-t border-panel bg-track/95 shadow-2xl backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {showMore && (
        <div className="grid grid-cols-3 gap-2 border-b border-panel bg-surface px-3 py-3">
          <button
            onClick={() => goTo(hrefWithSearch(HOME_PATH))}
            className="min-h-11 rounded-sm border border-panel bg-panel px-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:border-f1red"
          >
            Home & About
          </button>
          <button
            onClick={() => goTo(hrefWithSearch("/telemetry"))}
            className="min-h-11 rounded-sm border border-panel bg-panel px-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:border-f1red"
          >
            Telemetry
          </button>
          <button
            onClick={() => goTo("/settings")}
            className="min-h-11 rounded-sm border border-panel bg-panel px-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:border-f1red"
          >
            Settings
          </button>
          <button
            onClick={() => {
              setShowMore(false);
              trackEvent("nav_help_opened", { source: "mobile_menu" });
              openHelp();
            }}
            className="min-h-11 rounded-sm border border-panel bg-panel px-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:border-f1red"
          >
            Help
          </button>
          <button
            onClick={() => goTo("/privacy")}
            className="min-h-11 rounded-sm border border-panel bg-panel px-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:border-f1red"
          >
            Privacy
          </button>
          <button
            onClick={() => goTo("/terms")}
            className="min-h-11 rounded-sm border border-panel bg-panel px-2 text-caption font-black uppercase tracking-caps text-fg transition-colors hover:border-f1red"
          >
            Terms
          </button>
        </div>
      )}

      <div data-tour={TOUR_TARGET.mobileNav} className="grid h-14 grid-cols-5">
        <button
          onClick={() => {
            trackEvent("nav_view_changed", {
              view: "tracker",
              source: "mobile",
            });
            goTo(viewHref("tracker"));
          }}
          className={navButton(isReplayActive)}
          aria-current={isReplayActive ? "page" : undefined}
        >
          <span className={navIcon(isReplayActive)}>
            <Flag size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span>Replay</span>
        </button>
        <button
          onClick={() => {
            trackEvent("nav_view_changed", {
              view: "commentary",
              source: "mobile",
            });
            goTo(viewHref("commentary"));
          }}
          className={navButton(isFeedsActive)}
          aria-current={isFeedsActive ? "page" : undefined}
        >
          <span className={navIcon(isFeedsActive)}>
            <Radio size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span>Feeds</span>
        </button>
        <button
          onClick={() => goTo(hrefWithSearch("/standings"))}
          className={navButton(isStandingsActive)}
          aria-current={isStandingsActive ? "page" : undefined}
        >
          <span className={navIcon(isStandingsActive)}>
            <Trophy size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span>Standings</span>
        </button>
        <button
          onClick={() => goTo(hrefWithSearch("/schedule"))}
          className={navButton(isScheduleActive)}
          aria-current={isScheduleActive ? "page" : undefined}
        >
          <span className={navIcon(isScheduleActive)}>
            <CalendarDays size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span>Schedule</span>
        </button>
        <button
          onClick={() => {
            setShowMore((value) => {
              const nextValue = !value;
              trackEvent("mobile_nav_more_toggled", { expanded: nextValue });
              return nextValue;
            });
          }}
          className={navButton(isMoreActive)}
          aria-expanded={showMore}
          data-tour={TOUR_TARGET.mobileMore}
        >
          <span className={navIcon(isMoreActive)}>
            <Ellipsis size={20} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
