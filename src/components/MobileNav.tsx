import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useStringParam } from "@/hooks/useSearchParamState";
import type { MainView } from "@/components/Nav";

export function MobileNav() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [view] = useStringParam<MainView>("view", "leaderboard");
  const currentView: MainView = view ?? "leaderboard";
  const isMain = location.pathname === "/";

  function viewHref(id: MainView) {
    const params = new URLSearchParams(searchParams);
    if (id === "leaderboard") params.delete("view");
    else params.set("view", id);
    return `/?${params}`;
  }

  const btn = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.1em] border-t-2 transition-colors ${
      active ? "text-white border-f1red" : "text-white/50 border-transparent"
    }`;

  return (
    <nav className="md:hidden shrink-0 flex h-11 bg-track border-t border-panel">
      <button
        onClick={() => navigate(viewHref("leaderboard"))}
        className={btn(isMain && currentView === "leaderboard")}
      >
        <span className="text-base leading-none">≡</span>
        <span>Tower</span>
      </button>
      <button
        onClick={() => navigate(viewHref("tracker"))}
        className={btn(isMain && currentView === "tracker")}
      >
        <span className="text-base leading-none">◉</span>
        <span>Tracker</span>
      </button>
      <button
        onClick={() => navigate(viewHref("commentary"))}
        className={btn(isMain && currentView === "commentary")}
      >
        <span className="text-base leading-none">≋</span>
        <span>Feeds</span>
      </button>
      <button
        onClick={() => navigate(`/telemetry?${searchParams}`)}
        className={btn(location.pathname === "/telemetry")}
      >
        <span className="text-base leading-none">↗</span>
        <span>Telemetry</span>
      </button>
      <button
        onClick={() => navigate(`/standings?${searchParams}`)}
        className={btn(location.pathname === "/standings")}
      >
        <span className="text-base leading-none">⊞</span>
        <span>Standings</span>
      </button>
    </nav>
  );
}
