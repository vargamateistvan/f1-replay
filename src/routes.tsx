import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { SettingsModal } from "@/components/SettingsModal/SettingsModal";
import { HowItWorksModal } from "@/components/HowItWorksModal/HowItWorksModal";
import { RouteSeo } from "@/components/Seo/RouteSeo";
import RaceWeekend from "@/pages/RaceWeekend";
import Telemetry from "@/pages/Telemetry";
import Standings from "@/pages/Standings";
import Settings from "@/pages/Settings";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
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
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <footer className="border-t border-panel bg-track/90 px-3 py-1 text-[10px] text-muted">
          <div className="mx-auto flex w-full items-center justify-end gap-2.5">
            <Link
              to="/privacy"
              className="text-f1red/85 transition-colors hover:text-f1red"
            >
              Privacy
            </Link>
            <span aria-hidden="true" className="text-[#5a5a68]">
              |
            </span>
            <Link
              to="/terms"
              className="text-f1red/85 transition-colors hover:text-f1red"
            >
              Terms
            </Link>
            <span aria-hidden="true" className="text-[#5a5a68]">
              |
            </span>
            <a
              href="/.well-known/security.txt"
              className="text-f1red/85 transition-colors hover:text-f1red"
            >
              Security
            </a>
          </div>
        </footer>
        <MobileNav />
        <SettingsModal />
        <HowItWorksModal />
      </div>
    </BrowserRouter>
  );
}
