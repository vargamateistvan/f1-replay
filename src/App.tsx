import {
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AppRouter } from "./routes";
import { useEffect } from "react";
import { startClock, stopClock } from "./timeline/clock";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { OpenF1Error } from "@/api/client";
import { queryPersister } from "@/lib/queryPersister";
import { shouldPersistQueryKey } from "@/lib/queryPersistencePolicy";
import { useSettings } from "@/stores/settings";
import { initializeAnalytics } from "@/lib/analytics";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry client errors (401/403/404) — only transient failures.
      retry: (count, error) => {
        if (
          error instanceof OpenF1Error &&
          error.status >= 400 &&
          error.status < 500
        )
          return false;
        return count < 2;
      },
      refetchOnWindowFocus: false,
      // Keep everything in memory for the whole session; persister's maxAge handles expiry.
      gcTime: Infinity,
    },
  },
});

// Historical F1 data never changes, so 30 days is a safe persistence window.
// Live-session queries (staleTime: 0) are restored as stale and immediately refetched.
const PERSIST_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const shouldDehydrateAppQuery = (
  query: Parameters<typeof defaultShouldDehydrateQuery>[0],
) => {
  return (
    defaultShouldDehydrateQuery(query) && shouldPersistQueryKey(query.queryKey)
  );
};

function CoffeeWidgetGate() {
  const showCoffeeWidget = useSettings((s) => s.showCoffeeWidget);
  useEffect(() => {
    const STYLE_ID = "bmc-hide-style";
    if (!showCoffeeWidget) {
      if (!document.getElementById(STYLE_ID)) {
        const s = document.createElement("style");
        s.id = STYLE_ID;
        // Target the BMC widget's injected container + popup elements
        s.textContent =
          "#bmc-wbtn,#bmc-widget-banner,.bmc-btn-container{display:none!important}";
        document.head.appendChild(s);
      }
    } else {
      let s = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
      if (!s) {
        s = document.createElement("style");
        s.id = STYLE_ID;
        document.head.appendChild(s);
      }
      s.textContent =
        "@media (max-width: 767px){#bmc-wbtn,#bmc-widget-banner,.bmc-btn-container{display:none!important}}";
    }
  }, [showCoffeeWidget]);
  return null;
}

function LightModeGate() {
  const lightMode = useSettings((s) => s.lightMode);
  useEffect(() => {
    if (lightMode) {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, [lightMode]);
  return null;
}

export default function App() {
  useEffect(() => {
    startClock();
    initializeAnalytics();
    return stopClock;
  }, []);

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: PERSIST_MAX_AGE,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldDehydrateAppQuery,
          },
        }}
      >
        <CoffeeWidgetGate />
        <LightModeGate />
        <ErrorDisplay />
        <AppRouter />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
