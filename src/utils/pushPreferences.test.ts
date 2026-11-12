import { describe, expect, it } from "vitest";
import { DEFAULT_PUSH_PREFERENCES, isPushPreferences } from "./pushPreferences";

describe("device push preferences", () => {
  it("defaults all alert types to opt-out while selecting supported session types", () => {
    expect(isPushPreferences(DEFAULT_PUSH_PREFERENCES)).toBe(true);
    expect(Object.values(DEFAULT_PUSH_PREFERENCES.alerts)).toEqual([false, false, false]);
    expect(DEFAULT_PUSH_PREFERENCES.sessions).toEqual({
      race: true, sprint: true, qualifying: true, sprintQualifying: true, practice: false,
    });
  });

  it("rejects incomplete, extra or non-boolean fields", () => {
    expect(isPushPreferences(null)).toBe(false);
    expect(isPushPreferences({ ...DEFAULT_PUSH_PREFERENCES, extra: true })).toBe(false);
    expect(isPushPreferences({ ...DEFAULT_PUSH_PREFERENCES, alerts: { reminder: true } })).toBe(false);
    expect(isPushPreferences({
      ...DEFAULT_PUSH_PREFERENCES, sessions: { ...DEFAULT_PUSH_PREFERENCES.sessions, race: "true" },
    })).toBe(false);
  });
});
