import { describe, expect, it } from "vitest";
import type { Driver } from "@/api/types";
import type { TrackFlagState } from "@/timeline/raceControl";
import { buildStatusBadges, type StatusBadgeInput } from "./statusBadges";

const noSectorFlags = { 1: null, 2: null, 3: null } as const;

function input(overrides: Partial<StatusBadgeInput> = {}): StatusBadgeInput {
  return {
    startLights: null,
    activeTrackVehicles: null,
    trackFlagState: null,
    timingSectorFlags: { ...noSectorFlags },
    raceLeader: null,
    lightMode: false,
    ...overrides,
  };
}

function flagState(globalFlag: string | null): TrackFlagState {
  return { globalFlag, marshalFlags: {}, maxMarshalSector: 0, updatedAtMs: 0 };
}

const keys = (i: StatusBadgeInput) => buildStatusBadges(i).map((b) => b.key);

describe("buildStatusBadges", () => {
  it("returns nothing for a quiet track", () => {
    expect(buildStatusBadges(input())).toEqual([]);
  });

  it("shows the light gantry instead of the formation lap", () => {
    const badges = buildStatusBadges(
      input({
        startLights: { phase: "sequence", lit: 3 },
        activeTrackVehicles: {
          safetyCar: false,
          vsc: false,
          medicalCar: false,
          formationLap: true,
        },
      }),
    );
    expect(badges.map((b) => b.key)).toEqual(["start_lights"]);
    expect(badges[0]!.lightsLit).toBe(3);
  });

  it("reports lights out with no lamps lit", () => {
    const [badge] = buildStatusBadges(input({ startLights: { phase: "out" } }));
    expect(badge).toMatchObject({ label: "Lights out", lightsLit: 0 });
  });

  it("badges a track-wide flag once instead of per sector", () => {
    expect(
      keys(
        input({
          trackFlagState: flagState("RED"),
          timingSectorFlags: { 1: "RED", 2: "RED", 3: "RED" },
        }),
      ),
    ).toEqual(["flag_RED"]);
  });

  it("badges each flagged timing sector when no track-wide flag is active", () => {
    expect(
      keys(
        input({
          trackFlagState: flagState("CHEQUERED"),
          timingSectorFlags: { 1: "YELLOW", 2: null, 3: "DOUBLE_YELLOW" },
        }),
      ),
    ).toEqual(["flag_YELLOW S1", "flag_DOUBLE_YELLOW S3"]);
  });

  it("does not duplicate a deployed safety car as a flag badge", () => {
    expect(
      keys(
        input({
          activeTrackVehicles: {
            safetyCar: true,
            vsc: false,
            medicalCar: false,
          },
          trackFlagState: flagState("SAFETY_CAR"),
        }),
      ),
    ).toEqual(["safety_car"]);
  });

  it("adds the race leader last, falling back from acronym to number", () => {
    const leader = {
      driver_number: 44,
      name_acronym: "",
      last_name: "",
      team_colour: "00D2BE",
    } as unknown as Driver;
    const badges = buildStatusBadges(
      input({
        activeTrackVehicles: {
          safetyCar: false,
          vsc: false,
          medicalCar: false,
          chequeredFlag: true,
        },
        raceLeader: leader,
      }),
    );
    expect(badges.map((b) => b.key)).toEqual(["chequered", "race_leader"]);
    expect(badges[1]).toMatchObject({
      label: "RACE LEADER: #44",
      driver: leader,
    });
  });
});
