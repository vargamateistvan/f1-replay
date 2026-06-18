import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useNumberParam, useStringParam } from "./useSearchParamState";

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/race?session=10"]}>
      {children}
    </MemoryRouter>
  );
}

function useHarness() {
  const [session, setSession] = useNumberParam("session", null);
  const [view, setView] = useStringParam("view", "tracker");
  const location = useLocation();
  return { session, setSession, view, setView, search: location.search };
}

describe("useSearchParamState", () => {
  it("reads and writes number params including delete on null", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    expect(result.current.session).toBe(10);

    act(() => result.current.setSession(42));
    expect(result.current.session).toBe(42);
    expect(result.current.search).toContain("session=42");

    act(() => result.current.setSession(null));
    expect(result.current.session).toBeNull();
    expect(result.current.search).not.toContain("session=");
  });

  it("uses fallback for missing string param and deletes when set back to fallback", () => {
    const { result } = renderHook(() => useHarness(), { wrapper });
    expect(result.current.view).toBe("tracker");

    act(() => result.current.setView("leaderboard"));
    expect(result.current.view).toBe("leaderboard");
    expect(result.current.search).toContain("view=leaderboard");

    act(() => result.current.setView("tracker"));
    expect(result.current.view).toBe("tracker");
    expect(result.current.search).not.toContain("view=");
  });
});
