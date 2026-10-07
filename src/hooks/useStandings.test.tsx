import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStandings } from "./useStandings";

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const sessions2023 = [
  {
    session_key: 9000,
    meeting_key: 1100,
    session_type: "Race",
    session_name: "Race",
    date_start: "2023-03-05T15:00:00Z",
  },
  {
    session_key: 9001,
    meeting_key: 1101,
    session_type: "Race",
    session_name: "Race",
    date_start: "2023-11-26T13:00:00Z",
  },
];

function championshipKey(): unknown {
  const call = mockUseQuery.mock.calls.find(
    ([opts]) => (opts as { queryKey: unknown[] }).queryKey[0] === "championshipDrivers",
  );
  return (call?.[0] as { queryKey: unknown[] }).queryKey[1];
}

describe("useStandings", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (options.queryKey[0] === "sessions-year") {
        return { data: sessions2023, isPending: false };
      }
      return { data: undefined, isPending: false };
    });
  });

  it("uses the latest race of the year when no session is preferred", () => {
    renderHook(() => useStandings(2023));
    expect(championshipKey()).toBe(9001);
  });

  it("honours a preferred session that belongs to the selected year", () => {
    renderHook(() => useStandings(2023, 9000));
    expect(championshipKey()).toBe(9000);
  });

  it("ignores a preferred session from another year", () => {
    renderHook(() => useStandings(2023, 9999));
    expect(championshipKey()).toBe(9001);
  });

  it("ignores a preferred meeting from another year", () => {
    renderHook(() => useStandings(2023, null, 4242));
    expect(championshipKey()).toBe(9001);
  });
});
