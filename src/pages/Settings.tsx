import { useNavigate } from "react-router-dom";
import { SettingsBody } from "@/components/SettingsModal/SettingsControls";

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full bg-[#1a1a24]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a35] shrink-0 bg-track">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center text-muted hover:text-white transition-colors"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-[14px] font-bold text-white tracking-wide">Settings</span>
      </div>

      {/* Scrollable content */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-6"
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        <SettingsBody />
      </div>
    </div>
  );
}
