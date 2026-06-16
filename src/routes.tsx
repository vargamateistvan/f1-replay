import { HashRouter, Routes, Route } from "react-router-dom";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { SettingsModal } from "@/components/SettingsModal/SettingsModal";
import RaceWeekend from "@/pages/RaceWeekend";
import Telemetry from "@/pages/Telemetry";
import Standings from "@/pages/Standings";
import Settings from "@/pages/Settings";

export function AppRouter() {
  return (
    <HashRouter>
      <div className="flex min-h-[100dvh] flex-col overflow-y-auto overflow-x-hidden md:h-[100dvh] md:overflow-hidden">
        <Nav />
        <main className="flex-1 min-h-0 overflow-hidden md:overflow-hidden">
          <Routes>
            <Route path="/" element={<RaceWeekend />} />
            <Route path="/telemetry" element={<Telemetry />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <MobileNav />
        <SettingsModal />
      </div>
    </HashRouter>
  );
}
