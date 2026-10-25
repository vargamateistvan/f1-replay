import { useNavigate, useSearchParams } from "react-router-dom";
import { SettingsBody } from "@/components/SettingsModal/SettingsControls";
import { isSettingsTabId } from "@/stores/settings";

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = isSettingsTabId(tabParam) ? tabParam : undefined;

  return (
    <div className="flex flex-1 flex-col bg-track md:h-full">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-panel bg-track px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center border border-panel text-muted transition-colors hover:border-f1red hover:text-f1red"
          aria-label="Go back"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="text-[15px] font-black uppercase leading-tight tracking-[0.08em] text-white">
            Settings
          </h1>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            Saved on this device
          </p>
        </div>
      </div>

      {/* Content — on desktop the inner panels own their scrolling; on phones
          the page scrolls so nothing hides behind the bottom nav. */}
      <div className="flex flex-1 flex-col px-4 pb-4 md:min-h-0">
        <SettingsBody key={initialTab} initialTab={initialTab} />
      </div>
    </div>
  );
}
