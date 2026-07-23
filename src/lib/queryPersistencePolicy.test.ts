import { describe, expect, it } from "vitest";
import { shouldPersistQueryKey } from "./queryPersistencePolicy";

describe("shouldPersistQueryKey", () => {
  it("skips heavy chunked query families", () => {
    expect(shouldPersistQueryKey(["location-chunk", 1, 0])).toBe(false);
    expect(shouldPersistQueryKey(["allCarDataWindow", 1, 2])).toBe(false);
    expect(shouldPersistQueryKey(["carDataWindow", 1, 44, 3])).toBe(false);
  });

  it("keeps normal historical session data persisted", () => {
    expect(shouldPersistQueryKey(["drivers", 123])).toBe(true);
    expect(shouldPersistQueryKey(["laps", 123, undefined, undefined])).toBe(
      true,
    );
    expect(shouldPersistQueryKey(["sessionResult", 123])).toBe(true);
  });
});
