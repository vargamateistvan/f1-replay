import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { SettingsModal } from "@/components/SettingsModal/SettingsModal";
import { HowItWorksModal } from "@/components/HowItWorksModal/HowItWorksModal";
import { RouteSeo } from "@/components/Seo/RouteSeo";
import { trackPageView } from "@/utils/analytics";
const RaceWeekend = lazy(() => import("@/pages/RaceWeekend"));
const Telemetry = lazy(() => import("@/pages/Telemetry"));
const Standings = lazy(() => import("@/pages/Standings"));
const Settings = lazy(() => import("@/pages/Settings"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-xs uppercase tracking-[0.12em] text-muted animate-pulse">
      Loading View
    </div>
  );
}

function RouteAnalytics() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    trackPageView(location.pathname, location.search, navigationType);
  }, [location.pathname, location.search, navigationType]);

  return null;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteSeo />
      <RouteAnalytics />
      <div className="flex flex-col md:h-[100dvh] md:min-h-[100dvh] md:overflow-hidden">
        <Nav />
        <main className="flex flex-col flex-1 pb-[calc(3rem+env(safe-area-inset-bottom))] md:min-h-0 md:overflow-hidden md:pb-0">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<RaceWeekend />} />
              <Route path="/telemetry" element={<Telemetry />} />
              <Route path="/standings" element={<Standings />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
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
