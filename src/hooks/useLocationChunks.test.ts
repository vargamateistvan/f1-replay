import { describe, expect, it } from "vitest";
import {
  chunkIndexFor,
  getEarlyLocationPrefetchMs,
  getLocationPrefetchOffsets,
  locationChunkIndexFor,
  mergeLocationChunkData,
} from "./useLocationChunks";
import { CHUNK_MS, LOCATION_CHUNK_MS } from "@/constants";

const prevChunk = [
  {
    date: "2024-01-01T00:04:59.000Z",
    driver_number: 1,
    meeting_key: 1,
    session_key: 1,
    x: 10,
    y: 20,
    z: 0,
  },
];

const currentChunk = [
  {
    date: "2024-01-01T00:05:01.000Z",
    driver_number: 1,
    meeting_key: 1,
    session_key: 1,
    x: 30,
    y: 40,
    z: 0,
  },
];

const nextChunk = [
  {
    date: "2024-01-01T00:10:01.000Z",
    driver_number: 1,
    meeting_key: 1,
    session_key: 1,
    x: 50,
    y: 60,
    z: 0,
  },
];

describe("chunkIndexFor", () => {
  it("clamps negatives to zero and increments by chunk width", () => {
    expect(chunkIndexFor(-1)).toBe(0);
    expect(chunkIndexFor(0)).toBe(0);
    expect(chunkIndexFor(CHUNK_MS - 1)).toBe(0);
    expect(chunkIndexFor(CHUNK_MS)).toBe(1);
    expect(chunkIndexFor(CHUNK_MS * 3 + 42)).toBe(3);
  });
});

describe("locationChunkIndexFor", () => {
  it("uses the smaller location chunk size for indexing", () => {
    expect(locationChunkIndexFor(-1)).toBe(0);
    expect(locationChunkIndexFor(0)).toBe(0);
    expect(locationChunkIndexFor(LOCATION_CHUNK_MS - 1)).toBe(0);
    expect(locationChunkIndexFor(LOCATION_CHUNK_MS)).toBe(1);
    expect(locationChunkIndexFor(LOCATION_CHUNK_MS * 4 + 123)).toBe(4);
  });
});

describe("mergeLocationChunkData", () => {
  it("keeps the previous chunk as a bridge during rollover", () => {
    expect(
      mergeLocationChunkData(prevChunk, currentChunk, nextChunk, true),
    ).toEqual([...prevChunk, ...currentChunk, ...nextChunk]);
  });

  it("still returns bridged samples when the current chunk is empty", () => {
    expect(mergeLocationChunkData(prevChunk, [], nextChunk, true)).toEqual([
      ...prevChunk,
      ...nextChunk,
    ]);
  });

  it("can omit the next chunk when compact mode disables lookahead", () => {
    expect(
      mergeLocationChunkData(prevChunk, currentChunk, nextChunk, false),
    ).toEqual([...prevChunk, ...currentChunk]);
  });
});

describe("getLocationPrefetchOffsets", () => {
  it("uses the default two-chunk headroom at normal playback speeds", () => {
    expect(getLocationPrefetchOffsets(1)).toEqual([2, 3]);
    expect(getLocationPrefetchOffsets(4)).toEqual([2, 3]);
  });

  it("widens lookahead substantially at 8x playback", () => {
    expect(getLocationPrefetchOffsets(8)).toEqual([2, 3, 4, 5, 6]);
  });

  it("widens lookahead even further at 16x playback", () => {
    expect(getLocationPrefetchOffsets(16)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("getEarlyLocationPrefetchMs", () => {
  it("keeps the default 60-second early window at normal speeds", () => {
    expect(getEarlyLocationPrefetchMs(1)).toBe(60_000);
    expect(getEarlyLocationPrefetchMs(4)).toBe(60_000);
  });

  it("starts early prefetch sooner at 8x playback", () => {
    expect(getEarlyLocationPrefetchMs(8)).toBe(180_000);
  });

  it("starts early prefetch much sooner at 16x playback", () => {
    expect(getEarlyLocationPrefetchMs(16)).toBe(240_000);
  });
});
