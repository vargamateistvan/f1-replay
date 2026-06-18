import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { SettingsModal } from "@/components/SettingsModal/SettingsModal";
import { HowItWorksModal } from "@/components/HowItWorksModal/HowItWorksModal";
import { RouteSeo } from "@/components/Seo/RouteSeo";
import RaceWeekend from "@/pages/RaceWeekend";
import Telemetry from "@/pages/Telemetry";
import Standings from "@/pages/Standings";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteSeo />
      <div className="flex flex-col md:h-[100dvh] md:min-h-[100dvh] md:overflow-hidden">
        <Nav />
        <main className="flex flex-col flex-1 pb-[calc(3rem+env(safe-area-inset-bottom))] md:min-h-0 md:overflow-hidden md:pb-0">
          <Routes>
            <Route path="/" element={<RaceWeekend />} />
            <Route path="/telemetry" element={<Telemetry />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <MobileNav />
        <SettingsModal />
        <HowItWorksModal />
      </div>
    </BrowserRouter>
  );
}
