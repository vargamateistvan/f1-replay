import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const scriptUrl = pathToFileURL(resolve("scripts/fetch-georef.mjs")).href;

function runScript(
  tokens: { GH_TOKEN?: string; GITHUB_TOKEN?: string } = {},
  latest = true,
  apiStatus = 200,
) {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    globalThis.fetch = async (url, options) => {
      console.log("REQUEST " + JSON.stringify({ url, headers: options?.headers }));
      if (url.startsWith("https://api.github.com/")) {
        return new Response(JSON.stringify(
          ${apiStatus} === 200 ? { sha: "resolved-commit" } : { message: "API rate limit exceeded" }
        ), { status: ${apiStatus} });
      }
      return new Response("Stop before baking or writing files", { status: 503 });
    };
    ${latest ? 'process.argv.push("--latest");' : ""}
    await import(${JSON.stringify(scriptUrl)});
  `], {
    env: { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "", ...tokens },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  const requests = result.stdout.split("\n")
    .filter((line) => line.startsWith("REQUEST "))
    .map((line): { url: string; headers?: Record<string, string> } =>
      JSON.parse(line.slice("REQUEST ".length)));
  return { ...result, requests };
}

describe("georef GitHub requests", () => {
  it.each([
    { GH_TOKEN: "workflow-token", GITHUB_TOKEN: "other-token" },
    { GITHUB_TOKEN: "workflow-token" },
  ])("authenticates the commit lookup without sending credentials to raw downloads (%j)", (tokens) => {
    const result = runScript(tokens);

    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]).toMatchObject({
      url: "https://api.github.com/repos/bacinger/f1-circuits/commits/master",
      headers: { Authorization: "Bearer workflow-token" },
    });
    expect(result.requests[1]).toEqual({
      url: "https://raw.githubusercontent.com/bacinger/f1-circuits/resolved-commit/f1-circuits.geojson",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("HTTP 503");
  });

  it("allows local latest lookups without a token", () => {
    const { requests } = runScript();

    expect(requests).toHaveLength(2);
    expect(requests[0].headers).not.toHaveProperty("Authorization");
  });

  it("skips the API lookup for pinned runs even with a token", () => {
    const { requests } = runScript({ GH_TOKEN: "workflow-token" }, false);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
    expect(requests[0].headers).toBeUndefined();
  });

  it("reports the GitHub error and stops instead of silently using an old commit", () => {
    const result = runScript({}, true, 403);

    expect(result.status).toBe(1);
    expect(result.requests).toHaveLength(1);
    expect(result.stderr).toContain("HTTP 403 resolving bacinger master");
    expect(result.stderr).toContain("API rate limit exceeded");
  });
});
