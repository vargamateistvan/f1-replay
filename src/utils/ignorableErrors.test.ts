import { describe, expect, it } from "vitest";
import {
  isCrossOriginFrameError,
  isIgnorableWindowError,
  isOpaqueScriptError,
} from "./ignorableErrors";

describe("isOpaqueScriptError", () => {
  it("matches Safari/Chrome's sanitized cross-origin message", () => {
    expect(isOpaqueScriptError({ message: "Script error." })).toBe(true);
    expect(isOpaqueScriptError({ message: "Script error" })).toBe(true);
    expect(isOpaqueScriptError({ message: " script error. ", error: null })).toBe(true);
  });

  it("keeps errors that carry an error object or a real message", () => {
    expect(
      isOpaqueScriptError({ message: "Script error.", error: new Error("x") }),
    ).toBe(false);
    expect(isOpaqueScriptError({ message: "Script error in TrackMap" })).toBe(false);
    expect(isOpaqueScriptError({ message: "" })).toBe(false);
  });
});

describe("isIgnorableWindowError", () => {
  it("ignores opaque script errors and cross-origin frame errors", () => {
    expect(isIgnorableWindowError({ message: "Script error." })).toBe(true);
    expect(
      isIgnorableWindowError({
        message: "Blocked a frame with origin https://x from accessing a frame",
      }),
    ).toBe(true);
  });

  it("keeps real app errors", () => {
    const error = new TypeError("undefined is not an object");
    expect(isIgnorableWindowError({ message: error.message, error })).toBe(false);
  });
});

describe("isCrossOriginFrameError", () => {
  it("reads the message from Error objects", () => {
    expect(isCrossOriginFrameError(new Error("cross-origin frame"))).toBe(true);
    expect(isCrossOriginFrameError(new Error("boom"))).toBe(false);
  });
});
