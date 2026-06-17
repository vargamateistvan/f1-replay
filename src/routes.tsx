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
      <div className="flex h-screen min-h-screen md:h-[100dvh] md:min-h-[100dvh] flex-col overflow-hidden">
        <Nav />
        <main className="app-main-scroll flex min-h-0 flex-1 flex-col pb-[calc(3rem+env(safe-area-inset-bottom))] md:overflow-hidden md:pb-0">
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
