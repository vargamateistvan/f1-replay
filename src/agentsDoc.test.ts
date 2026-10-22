import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

// AGENTS.md is the agents' map of the codebase; fail when a module is added
// without a line there (see "Keeping this file current").
const srcDir = join(cwd(), "src");
const agentsDoc = readFileSync(join(cwd(), "AGENTS.md"), "utf8");

const DOCUMENTED_DIRS = ["hooks", "utils", "lib", "timeline", "stores", "data"];

function moduleFiles(dir: string): string[] {
  return readdirSync(join(srcDir, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(ts|tsx|json)$/.test(name) && !/\.test\.tsx?$/.test(name));
}

describe("AGENTS.md", () => {
  it.each(DOCUMENTED_DIRS)("mentions every module in src/%s", (dir) => {
    const missing = moduleFiles(dir).filter((name) => !agentsDoc.includes(name));
    expect(missing).toEqual([]);
  });

  it("mentions every component folder", () => {
    const missing = readdirSync(join(srcDir, "components"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("__"))
      .map((entry) => entry.name)
      .filter((name) => !agentsDoc.includes(`\`${name}\``));
    expect(missing).toEqual([]);
  });
});
