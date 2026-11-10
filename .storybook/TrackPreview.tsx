import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorMessage } from "../src/components/ErrorMessage/ErrorMessage";

export function TrackPreview({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-2">
        <p className="font-mono text-caption text-muted">
          Simulated cars on baked circuit geometry. No OpenF1 requests. Use the
          playhead control to move the cars; click a car to focus it.
        </p>
        <div className="relative h-[32rem] min-h-0 overflow-hidden border border-panel bg-sunken">
          {children}
        </div>
      </div>
    </QueryClientProvider>
  );
}

export function TrackSetupNotice({ message }: { message: string }) {
  return <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
    <ErrorMessage variant="empty" message={message} />
  </div>;
}
