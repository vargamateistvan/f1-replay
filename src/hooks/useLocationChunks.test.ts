import { describe, expect, it } from "vitest";
import { chunkIndexFor } from "./useLocationChunks";
import { CHUNK_MS } from "@/constants";

describe("chunkIndexFor", () => {
  it("clamps negatives to zero and increments by chunk width", () => {
    expect(chunkIndexFor(-1)).toBe(0);
    expect(chunkIndexFor(0)).toBe(0);
    expect(chunkIndexFor(CHUNK_MS - 1)).toBe(0);
    expect(chunkIndexFor(CHUNK_MS)).toBe(1);
    expect(chunkIndexFor(CHUNK_MS * 3 + 42)).toBe(3);
  });
});
