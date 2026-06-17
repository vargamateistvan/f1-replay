import type { Session } from "@/api/types";
import { LIVE_BUFFER_MS } from "@/constants";

// Re-exported for existing import sites (hooks/useSession.ts).
export { LIVE_POLL_FAST_MS, LIVE_POLL_SLOW_MS } from "@/constants";

export function isSessionLive(session: Session | undefined | null): boolean {
  if (!session || session.is_cancelled) return false;
  const now = Date.now();
  return (
    new Date(session.date_start).getTime() - LIVE_BUFFER_MS <= now &&
    now <= new Date(session.date_end).getTime() + LIVE_BUFFER_MS
  );
}
