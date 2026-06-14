import { HashRouter, Routes, Route } from "react-router-dom";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import RaceWeekend from "@/pages/RaceWeekend";
import Telemetry from "@/pages/Telemetry";
import Standings from "@/pages/Standings";

export function AppRouter() {
  return (
    <HashRouter>
      <div className="flex flex-col h-screen overflow-hidden">
        <Nav />
        <main className="flex-1 min-h-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<RaceWeekend />} />
            <Route path="/telemetry" element={<Telemetry />} />
            <Route path="/standings" element={<Standings />} />
          </Routes>
        </main>
        <MobileNav />
      </div>
    </HashRouter>
  );
}
