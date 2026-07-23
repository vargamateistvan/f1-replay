export type TrackerTab = "timing" | "chart" | "gap" | "map" | "strategy";

type TrackerTabSource = "mobile" | "desktop";

interface TrackerTabBarProps {
  source: TrackerTabSource;
  activeTab: TrackerTab;
  onTabChange: (tab: TrackerTab, source: TrackerTabSource) => void;
}

const MOBILE_TABS: readonly [TrackerTab, string][] = [
  ["timing", "Timing"],
  ["map", "Track"],
  ["strategy", "Tyre Strategy"],
  ["chart", "Chart"],
  ["gap", "Gap"],
];

const DESKTOP_TABS: readonly [TrackerTab, string][] = [
  ["timing", "Timing"],
  ["strategy", "Tyre Strategy"],
  ["chart", "Laps"],
  ["gap", "Gap"],
];

export function TrackerTabBar({
  source,
  activeTab,
  onTabChange,
}: Readonly<TrackerTabBarProps>) {
  const tabs = source === "mobile" ? MOBILE_TABS : DESKTOP_TABS;

  if (source === "mobile") {
    return (
      <div className="sticky top-0 z-20 grid grid-cols-5 w-full border-b border-panel shrink-0 bg-track/95 backdrop-blur">
        {tabs.map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab, source)}
            className={`w-full px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "text-white border-f1red bg-surface"
                : "text-muted border-transparent hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex border-b border-panel shrink-0">
      {tabs.map(([tab, label]) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab, source)}
          className={`flex-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === tab
              ? "text-white border-b-2 border-f1red -mb-px bg-surface"
              : "text-muted hover:text-white bg-track"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
