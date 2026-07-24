import { useMemo } from "react";
import { isSessionLive } from "@/utils/live";
import type { Session } from "@/api/types";

type UseRaceWeekendSessionMetaParams = {
  sessions: readonly Session[];
  sessionKey: number | null;
};

export function useRaceWeekendSessionMeta({
  sessions,
  sessionKey,
}: Readonly<UseRaceWeekendSessionMetaParams>) {
  const session = useMemo(
    () => sessions.find((entry) => entry.session_key === sessionKey),
    [sessions, sessionKey],
  );

  const live = isSessionLive(session);
  const sessionStartMs = session ? new Date(session.date_start).getTime() : 0;
  const sessionEndMs = session ? new Date(session.date_end).getTime() : 0;
  const durationMs = sessionEndMs - sessionStartMs;
  const isRaceSession =
    session?.session_type === "Race" || session?.session_type === "Sprint";
  const sessionName = session?.session_name ?? "";

  return {
    session,
    live,
    sessionStartMs,
    sessionEndMs,
    durationMs,
    isRaceSession,
    sessionName,
  };
}
