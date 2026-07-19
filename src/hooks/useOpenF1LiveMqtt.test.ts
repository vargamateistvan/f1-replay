import { describe, expect, it } from "vitest";
import { mergeRow, type MqttPayload } from "./useOpenF1LiveMqtt";

function byDateKey(row: MqttPayload): string {
  return row._key ?? `${row.date}_${row.driver_number ?? -1}`;
}

function byDateSort(row: MqttPayload): number {
  const ms = Date.parse(row.date ?? "");
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

describe("mergeRow", () => {
  it("updates an existing row when the key matches", () => {
    const prev: MqttPayload[] = [
      {
        _key: "abc",
        session_key: 1,
        date: "2024-01-01T00:00:01Z",
        driver_number: 1,
      },
    ];

    const incoming: MqttPayload = {
      _key: "abc",
      session_key: 1,
      date: "2024-01-01T00:00:01Z",
      driver_number: 44,
    };

    const out = mergeRow(prev, incoming, {
      buildKey: byDateKey,
      buildSortKey: byDateSort,
      maxRows: 10,
    });

    expect(out).toHaveLength(1);
    expect(out[0]?.driver_number).toBe(44);
  });

  it("sorts rows by timestamp and treats invalid dates as oldest", () => {
    const prev: MqttPayload[] = [
      { date: "2024-01-01T00:00:02Z", driver_number: 2 },
      { date: "not-a-date", driver_number: 99 },
    ];
    const incoming: MqttPayload = {
      date: "2024-01-01T00:00:01Z",
      driver_number: 1,
    };

    const out = mergeRow(prev, incoming, {
      buildKey: byDateKey,
      buildSortKey: byDateSort,
      maxRows: 10,
    });

    expect(out.map((r) => r.driver_number)).toEqual([99, 1, 2]);
  });

  it("evicts oldest rows when maxRows is exceeded", () => {
    const prev: MqttPayload[] = [
      { date: "bad-date", driver_number: 9 },
      { date: "2024-01-01T00:00:00Z", driver_number: 1 },
      { date: "2024-01-01T00:00:01Z", driver_number: 2 },
    ];
    const incoming: MqttPayload = {
      date: "2024-01-01T00:00:02Z",
      driver_number: 3,
    };

    const out = mergeRow(prev, incoming, {
      buildKey: byDateKey,
      buildSortKey: byDateSort,
      maxRows: 3,
    });

    expect(out.map((r) => r.driver_number)).toEqual([1, 2, 3]);
  });
});
