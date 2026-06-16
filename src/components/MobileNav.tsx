import { useEffect, useState } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useStringParam } from "@/hooks/useSearchParamState";
import type { MainView } from "@/components/Nav";

export function MobileNav() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useStringParam<MainView>("view", "leaderboard");
  const [showMore, setShowMore] = useState(false);
  const currentView: MainView = view ?? "leaderboard";
  const isMain = location.pathname === "/";

  useEffect(() => {
    if (!isMain || typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    if (currentView !== "leaderboard") return;
    setView("tracker");
  }, [currentView, isMain, setView]);

  function viewHref(id: MainView) {
    const params = new URLSearchParams(searchParams);
    if (id === "leaderboard") params.delete("view");
    else params.set("view", id);
    return `/?${params}`;
  }

  const btn = (active: boolean) =>
    `flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 text-[9px] font-bold uppercase tracking-[0.1em] border-t-2 transition-colors ${
      active ? "text-white border-f1red" : "text-white/50 border-transparent"
    }`;

  function goTo(url: string) {
    setShowMore(false);
    navigate(url);
  }

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-30 flex flex-col bg-track border-t border-panel"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {showMore && (
        <div className="grid grid-cols-3 gap-px border-b border-panel bg-[#111118] px-2 py-2">
          <button
            onClick={() => goTo(`/telemetry?${searchParams}`)}
            className="h-10 rounded-sm bg-panel px-2 text-[10px] font-black uppercase tracking-[0.12em] text-white"
          >
            Telemetry
          </button>
          <button
            onClick={() => goTo(`/standings?${searchParams}`)}
            className="h-10 rounded-sm bg-panel px-2 text-[10px] font-black uppercase tracking-[0.12em] text-white"
          >
            Standings
          </button>
          <button
            onClick={() => goTo("/settings")}
            className="h-10 rounded-sm bg-panel px-2 text-[10px] font-black uppercase tracking-[0.12em] text-white"
          >
            Settings
          </button>
        </div>
      )}

      <div className="flex h-12">
        <button
          onClick={() => goTo(viewHref("tracker"))}
          className={btn(isMain && currentView === "tracker")}
        >
          <span className="text-base leading-none">◉</span>
          <span>Tracker</span>
        </button>
        <button
          onClick={() => goTo(viewHref("commentary"))}
          className={btn(isMain && currentView === "commentary")}
        >
          <span className="text-base leading-none">≋</span>
          <span>Feeds</span>
        </button>
        <button
          onClick={() => setShowMore((value) => !value)}
          className={btn(
            showMore ||
              location.pathname === "/telemetry" ||
              location.pathname === "/standings" ||
              location.pathname === "/settings",
          )}
          aria-expanded={showMore}
        >
          <span className="text-base leading-none">⋯</span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
