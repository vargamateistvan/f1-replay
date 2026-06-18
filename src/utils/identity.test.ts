import { describe, expect, it } from "vitest";

import {
  buildCircuitSearchCandidates,
  canonicalTeamName,
  circuitIdentityKeys,
  teamIdentityKeys,
} from "./identity";

describe("canonicalTeamName", () => {
  it("matches sponsor-heavy names to the known constructor", () => {
    expect(
      canonicalTeamName("Mercedes-AMG Petronas F1 Team", [
        "Mercedes",
        "Ferrari",
      ]),
    ).toBe("Mercedes");
    expect(
      canonicalTeamName("Stake F1 Team Kick Sauber", ["Sauber", "Ferrari"]),
    ).toBe("Sauber");
  });

  it("preserves unknown teams instead of forcing a wrong alias", () => {
    expect(
      canonicalTeamName("Andretti Cadillac", ["Ferrari", "Mercedes"]),
    ).toBe("Andretti Cadillac");
  });
});

describe("teamIdentityKeys", () => {
  it("keeps useful multi-word identity keys", () => {
    expect(teamIdentityKeys("Oracle Red Bull Racing")).toContain("red-bull");
  });
});

describe("buildCircuitSearchCandidates", () => {
  it("generates broader candidates for renamed or shortened tracks", () => {
    expect(
      buildCircuitSearchCandidates("Jeddah Corniche Circuit", "Saudi Arabia"),
    ).toEqual(
      expect.arrayContaining([
        "Jeddah Corniche Circuit",
        "Jeddah Corniche Formula One circuit",
        "Jeddah Corniche circuit Saudi Arabia",
        "Saudi Arabia Grand Prix circuit",
      ]),
    );
  });
});

describe("circuitIdentityKeys", () => {
  it("normalizes circuit suffixes into stable keys", () => {
    expect(circuitIdentityKeys("Autodromo Nazionale Monza")).toContain("monza");
  });
});
