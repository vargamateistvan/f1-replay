import type { CommentaryTab } from "@/components/CommentaryPanels/CommentaryPanels";

export type CommentaryTabMeta = readonly [
  CommentaryTab,
  string,
  string,
  number,
  string,
];

interface CommentaryTabBarProps {
  tabs: readonly CommentaryTabMeta[];
  activeTab: CommentaryTab;
  onTabChange: (tab: CommentaryTab) => void;
}

export function CommentaryTabBar({
  tabs,
  activeTab,
  onTabChange,
}: Readonly<CommentaryTabBarProps>) {
  return (
    <div className="grid grid-cols-6 w-full border-b border-panel shrink-0 bg-track sm:flex sm:overflow-x-auto">
      {tabs.map(([tab, label, shortLabel, count, metaLabel]) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`w-full px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 sm:shrink-0 sm:w-auto sm:px-4 sm:text-[11px] ${
            activeTab === tab
              ? "text-white border-f1red -mb-px"
              : "text-muted border-transparent hover:text-white"
          }`}
        >
          <span className="block sm:hidden">{shortLabel}</span>
          <span className="hidden sm:block">{label}</span>
          <span
            className={`mt-1 block font-mono text-[9px] leading-none tabular-nums ${
              activeTab === tab ? "text-white/70" : "text-muted/80"
            }`}
          >
            <span className="sm:hidden">{count}</span>
            <span className="hidden sm:inline">
              {count} {metaLabel}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
