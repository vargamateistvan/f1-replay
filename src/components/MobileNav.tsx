import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useStringParam } from "@/hooks/useSearchParamState";
import type { MainView } from "@/components/Nav";

const TABS: { id: MainView; label: string; icon: string }[] = [
  { id: "leaderboard", label: "Tower", icon: "≡" },
  { id: "tracker", label: "Tracker", icon: "◉" },
  { id: "commentary", label: "Feeds", icon: "📡" },
];

export function MobileNav() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [view] = useStringParam<MainView>("view", "leaderboard");
  const isMainRoute = location.pathname === "/";
  const currentView: MainView = view ?? "leaderboard";

  function viewHref(id: MainView) {
    const params = new URLSearchParams(searchParams);
    if (id === "leaderboard") params.delete("view");
    else params.set("view", id);
    return `/?${params}`;
  }

  return (
    <nav className="md:hidden shrink-0 flex h-11 bg-track border-t border-panel">
      {isMainRoute ? (
        TABS.map(({ id, label, icon }) => {
          const active = currentView === id;
          return (
            <button
              key={id}
              onClick={() => navigate(viewHref(id))}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.1em] border-t-2 transition-colors ${
                active
                  ? "text-white border-f1red"
                  : "text-white/50 border-transparent"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
            </button>
          );
        })
      ) : (
        <>
          <button
            onClick={() => navigate(`/?${searchParams}`)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.1em] border-t-2 text-white/50 border-transparent"
          >
            <span className="text-base leading-none">←</span>
            <span>Race</span>
          </button>
          <button
            onClick={() => navigate(`/telemetry?${searchParams}`)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.1em] border-t-2 transition-colors ${
              location.pathname === "/telemetry"
                ? "text-white border-f1red"
                : "text-white/50 border-transparent"
            }`}
          >
            <span className="text-base leading-none">📈</span>
            <span>Telemetry</span>
          </button>
          <button
            onClick={() => navigate(`/standings?${searchParams}`)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.1em] border-t-2 transition-colors ${
              location.pathname === "/standings"
                ? "text-white border-f1red"
                : "text-white/50 border-transparent"
            }`}
          >
            <span className="text-base leading-none">🏆</span>
            <span>Standings</span>
          </button>
        </>
      )}
    </nav>
  );
}
