import { describe, it, expect } from "vitest";
import {
  buildToastEvents,
  classifyPenaltyToastMessage,
  lapStartTimes,
  pitTimes,
  flagTimes,
  safetyCarTimes,
  overtakeTimes,
  nextAfter,
  prevBefore,
  atOrBefore,
} from "./events";
import type { Lap, Pit, RaceControl, Overtake, TeamRadio } from "@/api/types";

const START = new Date("2024-01-01T00:00:00Z").getTime();
const iso = (sec: number) => new Date(START + sec * 1000).toISOString();

describe("lapStartTimes", () => {
  it("dedupes to one boundary per lap (earliest across drivers) and sorts", () => {
    const laps = [
      { lap_number: 2, date_start: iso(90), driver_number: 1 },
      { lap_number: 1, date_start: iso(5), driver_number: 1 },
      { lap_number: 2, date_start: iso(88), driver_number: 44 }, // earlier → wins
      { lap_number: 1, date_start: iso(6), driver_number: 44 },
    ] as unknown as Lap[];
    expect(lapStartTimes(laps, START)).toEqual([5_000, 88_000]);
  });

  it("skips laps without a start and drops negatives", () => {
    const laps = [
      { lap_number: 1, date_start: null, driver_number: 1 },
      { lap_number: 2, date_start: iso(-10), driver_number: 1 },
      { lap_number: 3, date_start: iso(30), driver_number: 1 },
    ] as unknown as Lap[];
    expect(lapStartTimes(laps, START)).toEqual([30_000]);
  });
});

describe("pitTimes / flagTimes / overtakeTimes", () => {
  it("maps pit dates to relative ms, sorted", () => {
    const pits = [{ date: iso(50) }, { date: iso(10) }] as unknown as Pit[];
    expect(pitTimes(pits, START)).toEqual([10_000, 50_000]);
  });

  it("keeps only flag-bearing race-control rows", () => {
    const rc = [
      { date: iso(20), flag: "YELLOW" },
      { date: iso(10), flag: null },
      { date: iso(30), flag: "" },
      { date: iso(40), flag: "GREEN" },
    ] as unknown as RaceControl[];
    expect(flagTimes(rc, START)).toEqual([20_000, 40_000]);
  });

  it("maps overtake dates", () => {
    const ovt = [{ date: iso(15) }] as unknown as Overtake[];
    expect(overtakeTimes(ovt, START)).toEqual([15_000]);
  });

  it("includes safety-control phrase events for SC and VSC", () => {
    const rc = [
      { date: iso(5), flag: null, message: "SAFETY CAR DEPLOYED" },
      { date: iso(10), flag: null, message: "SAFETY CAR IN THIS LAP" },
      { date: iso(12), flag: null, message: "VSC DEPLOYED" },
      { date: iso(18), flag: null, message: "VSC ENDING" },
      { date: iso(25), flag: "YELLOW", message: "YELLOW" },
    ] as unknown as RaceControl[];
    expect(safetyCarTimes(rc, START)).toEqual([5_000, 10_000, 12_000, 18_000]);
  });
});

describe("buildToastEvents", () => {
  it("assigns lap number to radio toasts from lap boundaries", () => {
    const radios = [
      {
        date: iso(95),
        driver_number: 1,
        meeting_key: 1,
        recording_url: "https://example.com/radio.mp3",
        session_key: 1,
      },
    ] as TeamRadio[];

    const laps = [
      { lap_number: 1, date_start: iso(5), driver_number: 1 },
      { lap_number: 2, date_start: iso(88), driver_number: 1 },
    ] as unknown as Lap[];

    const events = buildToastEvents(radios, [], [], [], START, laps);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("radio");
    expect(events[0]?.payload).toMatchObject({
      driverNumber: 1,
      lapNumber: 2,
    });
  });
});

describe("classifyPenaltyToastMessage", () => {
  it("classifies warning-style notices", () => {
    expect(classifyPenaltyToastMessage("BLACK AND WHITE FLAG FOR CAR 4")).toBe(
      "warning_notice",
    );
    expect(
      classifyPenaltyToastMessage("Driver receives a reprimand for weaving"),
    ).toBe("warning_notice");
  });

  it("classifies major penalties", () => {
    expect(
      classifyPenaltyToastMessage("Car 16 receives a five second time penalty"),
    ).toBe("major_penalty");
    expect(
      classifyPenaltyToastMessage("Drive through penalty for car 63"),
    ).toBe("major_penalty");
  });
});

describe("nextAfter / prevBefore", () => {
  const marks = [0, 1000, 2000, 3000];

  it("nextAfter returns the next mark, skipping the current one (1ms eps)", () => {
    expect(nextAfter(marks, 0)).toBe(1000);
    expect(nextAfter(marks, 1000)).toBe(2000); // already on a mark → advance
    expect(nextAfter(marks, 1500)).toBe(2000);
  });

  it("nextAfter returns null past the end", () => {
    expect(nextAfter(marks, 3000)).toBeNull();
  });

  it("prevBefore steps back with a 1s epsilon", () => {
    // at 2500, prev (with 1s eps) is the mark before 1500 → 1000
    expect(prevBefore(marks, 2500)).toBe(1000);
    expect(prevBefore(marks, 5000)).toBe(3000);
  });

  it("prevBefore returns null before the first mark", () => {
    expect(prevBefore(marks, 500)).toBeNull();
  });

  it("atOrBefore snaps to current lap start and does not step further back", () => {
    expect(atOrBefore(marks, 2500)).toBe(2000);
    expect(atOrBefore(marks, 2000)).toBe(2000);
    expect(atOrBefore(marks, 500)).toBe(0);
  });
});
