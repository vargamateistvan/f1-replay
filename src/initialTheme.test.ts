import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const html = readFileSync("index.html", "utf8");
const script = html.match(/<script id="initial-theme">([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error("Missing initial theme script");

function restoreTheme(getItem: () => string | null) {
  const toggle = vi.fn();
  const warn = vi.fn();
  runInNewContext(script!, {
    localStorage: { getItem },
    document: { documentElement: { classList: { toggle } } },
    console: { warn },
  });
  return { toggle, warn };
}

describe("initial theme before app bootstrap", () => {
  it.each([true, false])("restores saved lightMode=%s", (lightMode) => {
    const { toggle, warn } = restoreTheme(() =>
      JSON.stringify({ state: { lightMode } }),
    );
    expect(toggle).toHaveBeenCalledWith("light", lightMode);
    expect(warn).not.toHaveBeenCalled();
  });

  it("uses the default dark theme without saved settings", () => {
    expect(restoreTheme(() => null).toggle).toHaveBeenCalledWith("light", false);
  });

  it.each([
    () => "{broken",
    () => { throw new Error("Storage unavailable"); },
  ])("reports inaccessible or malformed settings without blocking startup", (getItem) => {
    const { warn } = restoreTheme(getItem);
    expect(warn).toHaveBeenCalledWith(
      "Could not restore the initial theme",
      expect.anything(),
    );
  });
});
