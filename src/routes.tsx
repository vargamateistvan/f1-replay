import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense, useCallback, useEffect, useRef } from "react";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { SettingsModal } from "@/components/SettingsModal/SettingsModal";
import { HowItWorksModal } from "@/components/HowItWorksModal/HowItWorksModal";
import { RouteSeo } from "@/components/Seo/RouteSeo";
import {
  analyticsEnabled,
  trackPageEngagement,
  trackPageView,
} from "@/lib/analytics";
import { appVersionLabel } from "@/lib/appVersion";
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

function RouteAnalyticsTracker() {
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const activePathRef = useRef(currentPath);
  const activeSinceMsRef = useRef(Date.now());

  const flushEngagement = useCallback(
    (reason: "navigate" | "hidden" | "pagehide" | "unmount") => {
      if (!analyticsEnabled()) return;
      const now = Date.now();
      const durationMs = now - activeSinceMsRef.current;
      trackPageEngagement(activePathRef.current, durationMs, reason);
      activeSinceMsRef.current = now;
    },
    [],
  );

  useEffect(() => {
    if (!analyticsEnabled()) return;
    if (activePathRef.current !== currentPath) {
      flushEngagement("navigate");
      activePathRef.current = currentPath;
    }
    activeSinceMsRef.current = Date.now();
    trackPageView(currentPath);
  }, [currentPath, flushEngagement]);

  useEffect(() => {
    if (!analyticsEnabled()) return;

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushEngagement("hidden");
        return;
      }
      activeSinceMsRef.current = Date.now();
    }

    function onPageHide() {
      flushEngagement("pagehide");
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      flushEngagement("unmount");
    };
  }, [flushEngagement]);

  return null;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteSeo />
      <RouteAnalyticsTracker />
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
          <div className="mx-auto flex w-full items-center justify-between gap-2.5">
            <span className="font-mono uppercase tracking-[0.12em] text-muted/85">
              Version {appVersionLabel}
            </span>
            <div className="flex items-center gap-2.5">
              <Link
                to="/privacy"
                className="text-f1red/85 transition-colors hover:text-f1red"
              >
                Privacy
              </Link>
              <span aria-hidden="true" className="text-muted">
                |
              </span>
              <Link
                to="/terms"
                className="text-f1red/85 transition-colors hover:text-f1red"
              >
                Terms
              </Link>
              <span aria-hidden="true" className="text-muted">
                |
              </span>
              <a
                href="/.well-known/security.txt"
                className="text-f1red/85 transition-colors hover:text-f1red"
              >
                Security
              </a>
            </div>
          </div>
        </footer>
        <MobileNav />
        <SettingsModal />
        <HowItWorksModal />
      </div>
    </BrowserRouter>
  );
}
